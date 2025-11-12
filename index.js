// index.js — salons privés + archive/delete via TOPIC + garde-fou sur permissions
require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionsBitField,
} = require('discord.js');

const {
  TOKEN,
  GUILD_ID,
  ADMIN_ROLE_ID,
  MEMBERS_ROLE_ID,
  ACTIVE_CATEGORY_NAME,
  ARCHIVE_CATEGORY_NAME,
} = process.env;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const P = PermissionsBitField.Flags;

/* ---------- Utils ---------- */
const slugify = (s) =>
  s.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

async function runLimited(tasks, limit = 3) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      try { results[idx] = await tasks[idx](); }
      catch (e) { console.error('❌ Task failed:', e?.rawError ?? e?.message ?? e); results[idx] = e; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

function getUniqueRandomColor(guild) {
  const used = new Set(guild.roles.cache.map((r) => r.color).filter((c) => c && c !== 0));
  let color;
  do { color = Math.floor(Math.random() * 0xffffff); } while (used.has(color));
  if (!color || color === 0) color = 0x5865f2;
  return color;
}

/** Filtre toute valeur falsy dans une liste de flags (évite "undefined" → crash). */
const F = (...flags) => flags.filter(Boolean);

/**
 * Overwrites PRIVÉS explicites pour chaque salon
 * - @everyone : deny ViewChannel
 * - Admin, Membres, Rôle Projet : allow View + droits utiles
 * - Bot : droits étendus
 */
function privateOverwrites(guild, projectRoleId, kind /* 'text' | 'voice' */) {
  const botId = guild.members.me.id;
  const everyoneId = guild.roles.everyone.id;

  const commonAllows = F(P.ViewChannel, P.ReadMessageHistory);
  const textAllows   = F(
    P.SendMessages, P.EmbedLinks, P.AttachFiles, P.AddReactions,
    P.SendMessagesInThreads, P.CreatePublicThreads, P.CreatePolls // peut être undefined
  );
  const voiceAllows  = F(P.Connect, P.Speak, P.Stream);

  const allowFor = (roleId) => ({
    id: roleId,
    allow: kind === 'voice'
      ? F(...commonAllows, ...voiceAllows)
      : F(...commonAllows, ...textAllows),
  });

  const botAllow = {
    id: botId,
    allow: F(
      P.ViewChannel, P.ManageChannels, P.ManageRoles, P.ManageThreads,
      P.ReadMessageHistory, P.SendMessages, P.EmbedLinks, P.AttachFiles,
      P.AddReactions, P.CreateInstantInvite,
      P.Connect, P.Speak, P.Stream,
      P.SendMessagesInThreads, P.CreatePublicThreads, P.CreatePolls // peut être undefined
    ),
  };

  return [
    { id: everyoneId, deny: F(P.ViewChannel) },
    allowFor(ADMIN_ROLE_ID),
    allowFor(MEMBERS_ROLE_ID),
    allowFor(projectRoleId),
    botAllow,
  ];
}

async function ensureCategory(guild, name) {
  const all = await guild.channels.fetch();
  let cat = all.find((c) => c?.type === ChannelType.GuildCategory && c.name === name);
  if (!cat) cat = await guild.channels.create({ name, type: ChannelType.GuildCategory });
  return cat;
}

const EXPECTED_TEXTS = ['brief', 'discussion', 'ressources', 'livrables', 'retours'];
const COLORED_EMOJIS = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '🟤'];
const bannerName = (projectName, emoji) => `${emoji} ═════ ${projectName} ═════ ${emoji}`;
const voiceName  = (slug) => `vocal – réunion・p-${slug}`;

function buildTopic({ slug, roleId, tag }) {
  const parts = [`PROJECT:${slug}`];
  if (roleId) parts.push(`ROLE:${roleId}`);
  if (tag) parts.push(tag);
  return parts.join(' | ');
}

const hasProjectTag = (ch, slug) =>
  ch?.type === ChannelType.GuildText &&
  typeof ch.topic === 'string' &&
  ch.topic.includes(`PROJECT:${slug}`);

function extractTagFromTopic(topic) {
  const m = topic?.match(/\b(BANNER|BRIEF|DISCUSSION|RESSOURCES|LIVRABLES|RETOURS)\b/);
  return m ? m[1] : undefined;
}

/* ---------- CREATE ---------- */
async function createProject(guild, projectName) {
  const slug = slugify(projectName);
  const activeCat = await ensureCategory(guild, ACTIVE_CATEGORY_NAME);

  const projRole = await guild.roles.create({
    name: `PROJET — ${projectName}`,
    mentionable: true,
    hoist: true,
    // "color" émet un warning sur certaines versions → conservé, non bloquant
    color: getUniqueRandomColor(guild),
  });
  const roleId = projRole.id;

  const emoji = COLORED_EMOJIS[Math.floor(Math.random() * COLORED_EMOJIS.length)];
  const tasks = [];

  tasks.push(() => guild.channels.create({
    name: bannerName(projectName, emoji),
    type: ChannelType.GuildText,
    parent: activeCat,
    permissionOverwrites: privateOverwrites(guild, roleId, 'text'),
    topic: buildTopic({ slug, roleId, tag: 'BANNER' }),
  }));

  for (const n of EXPECTED_TEXTS) {
    tasks.push(() => guild.channels.create({
      name: n,
      type: ChannelType.GuildText,
      parent: activeCat,
      permissionOverwrites: privateOverwrites(guild, roleId, 'text'),
      topic: buildTopic({ slug, roleId, tag: n.toUpperCase() }),
    }));
  }

  tasks.push(() => guild.channels.create({
    name: voiceName(slug),
    type: ChannelType.GuildVoice,
    parent: activeCat,
    permissionOverwrites: privateOverwrites(guild, roleId, 'voice'),
  }));

  await runLimited(tasks, 3);
  return { roleId, slug };
}

/* ---------- ARCHIVE ---------- */
async function archiveProject(guild, projectName) {
  const slug = slugify(projectName);
  const archiveCat = await ensureCategory(guild, ARCHIVE_CATEGORY_NAME);
  const all = await guild.channels.fetch();

  const textChannels = Array.from(all.values()).filter((c) => hasProjectTag(c, slug));
  for (const ch of textChannels) {
    if (ch.parentId !== archiveCat.id) await ch.setParent(archiveCat).catch(() => {});
  }

  const voice = Array.from(all.values()).find(
    (c) => c.type === ChannelType.GuildVoice && c.name === voiceName(slug)
  );
  if (voice) await voice.delete().catch(() => {});

  const role = guild.roles.cache.find((r) => r.name === `PROJET — ${projectName}`);
  if (role) await role.delete().catch(() => {});

  return { moved: textChannels.length, voiceDeleted: voice ? 1 : 0 };
}

/* ---------- UNARCHIVE ---------- */
async function unarchiveProject(guild, projectName) {
  const slug = slugify(projectName);
  const archiveCat = await ensureCategory(guild, ARCHIVE_CATEGORY_NAME);
  const activeCat  = await ensureCategory(guild, ACTIVE_CATEGORY_NAME);

  const projRole = await guild.roles.create({
    name: `PROJET — ${projectName}`,
    mentionable: true,
    hoist: true,
    color: getUniqueRandomColor(guild),
  });
  const roleId = projRole.id;

  const all = await guild.channels.fetch();
  const textChannels = Array.from(all.values()).filter(
    (c) => c.parentId === archiveCat.id && hasProjectTag(c, slug)
  );

  for (const ch of textChannels) {
    await ch.setParent(activeCat).catch(() => {});
    await ch.permissionOverwrites.set(privateOverwrites(guild, roleId, 'text')).catch(() => {});
    const tag = extractTagFromTopic(ch.topic);
    const newTopic = buildTopic({ slug, roleId, tag });
    await ch.setTopic(newTopic).catch(() => {});
  }

  await guild.channels.create({
    name: voiceName(slug),
    type: ChannelType.GuildVoice,
    parent: activeCat,
    permissionOverwrites: privateOverwrites(guild, roleId, 'voice'),
  }).catch(() => {});

  return { moved: textChannels.length, roleId };
}

/* ---------- DELETE ---------- */
async function deleteProject(guild, projectName) {
  const slug = slugify(projectName);
  const all = await guild.channels.fetch();

  const textChannels = Array.from(all.values()).filter((c) => hasProjectTag(c, slug));
  for (const ch of textChannels) await ch.delete().catch(() => {});

  const voice = Array.from(all.values()).find(
    (c) => c.type === ChannelType.GuildVoice && c.name === voiceName(slug)
  );
  if (voice) await voice.delete().catch(() => {});

  const role = guild.roles.cache.find((r) => r.name === `PROJET — ${projectName}`);
  if (role) await role.delete().catch(() => {});

  return { textDeleted: textChannels.length, voiceDeleted: voice ? 1 : 0 };
}

/* ---------- Bot wiring ---------- */
client.once('ready', () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const guild = await client.guilds.fetch(GUILD_ID);

  try {
    if (interaction.commandName === 'newproject') {
      const name = interaction.options.getString('project', true);
      await interaction.reply({ content: `Création de ${name}…`, flags: 1 << 6 });
      const r = await createProject(guild, name);
      await interaction.editReply(`✅ ${name} créé (rôle ${r.roleId})`);
    }

    if (interaction.commandName === 'archive') {
      const name = interaction.options.getString('project', true);
      await interaction.reply({ content: `Archivage de ${name}…`, flags: 1 << 6 });
      const r = await archiveProject(guild, name);
      await interaction.editReply(`🗃️ ${name} archivé (${r.moved} salons, ${r.voiceDeleted} vocaux supprimés)`);
    }

    if (interaction.commandName === 'unarchive') {
      const name = interaction.options.getString('project', true);
      await interaction.reply({ content: `Désarchivage de ${name}…`, flags: 1 << 6 });
      const r = await unarchiveProject(guild, name);
      await interaction.editReply(`📂 ${name} désarchivé (${r.moved} salons, rôle ${r.roleId})`);
    }

    if (interaction.commandName === 'delete') {
      const name = interaction.options.getString('project', true);
      await interaction.reply({ content: `Suppression de ${name}…`, flags: 1 << 6 });
      const r = await deleteProject(guild, name);
      await interaction.editReply(`🗑️ ${name} supprimé (${r.textDeleted} salons, ${r.voiceDeleted} vocaux)`);
    }
  } catch (err) {
    console.error('❌ Erreur globale :', err);
    try { await interaction.reply({ content: `❌ Erreur : ${err.message}`, flags: 1 << 6 }); } catch {}
  }
});

client.login(TOKEN);