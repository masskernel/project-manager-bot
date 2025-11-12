// index.js — Project Manager bot (archive/delete fix + explicit bot perms + robust targeting)
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

// -------- utils
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
      catch (e) { results[idx] = e; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

function getUniqueRandomColor(guild) {
  const used = new Set(guild.roles.cache.map(r => r.color).filter(c => c && c !== 0));
  let color;
  do { color = Math.floor(Math.random() * 0xffffff); } while (used.has(color));
  if (!color || color === 0) color = 0x5865f2;
  return color;
}

const EXPECTED_TEXTS = ['brief', 'discussion', 'ressources', 'livrables', 'retours'];
const COLORED_EMOJIS = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '🟤'];
const bannerName = (projectName, emoji) => `${emoji} ═════ ${projectName} ═════ ${emoji}`;
const voiceName  = (slug) => `vocal – réunion・p-${slug}`;

// Marqueur fiable injecté dans topic
function buildTopic({ slug, roleId, tag }) {
  const parts = [`PROJECT:${slug}`];
  if (roleId) parts.push(`ROLE:${roleId}`);
  if (tag) parts.push(tag);
  return parts.join(' | ');
}

// Récupère channels du projet via le topic PROJECT:<slug> (fiable)
async function getProjectTextChannels(guild, slug) {
  const all = await guild.channels.fetch();
  return [...all.values()].filter(c =>
    c?.type === ChannelType.GuildText &&
    typeof c.topic === 'string' &&
    c.topic.includes(`PROJECT:${slug}`)
  );
}

// Extrait roleId depuis le topic d’un des salons texte
function extractRoleIdFromTopic(ch) {
  if (!ch?.topic) return null;
  const m = ch.topic.match(/ROLE:(\d{17,20})/);
  return m ? m[1] : null;
}

// Assure la catégorie + overwrites, y compris pour le bot
async function ensureCategoryWithPerms(guild, name, mode) {
  const botId = guild.members.me.id;
  const all = await guild.channels.fetch();
  let cat = [...all.values()].find(c => c?.type === ChannelType.GuildCategory && c.name === name);
  if (!cat) {
    cat = await guild.channels.create({ name, type: ChannelType.GuildCategory });
  }

  const everyoneId = guild.roles.everyone.id;

  // Droits utiles pour que le bot puisse déplacer/supprimer
  const botAllow = [
    P.ViewChannel, P.ManageChannels, P.ManageRoles, P.ManageThreads,
    P.Connect, P.Speak, P.MoveMembers, P.ReadMessageHistory, P.SendMessages
  ];

  const overwritesActive = [
    { id: everyoneId, deny: [P.ViewChannel] },
    { id: ADMIN_ROLE_ID, allow: [P.ViewChannel, P.ReadMessageHistory] },
    { id: MEMBERS_ROLE_ID, allow: [P.ViewChannel, P.ReadMessageHistory] },
    { id: botId,       allow: botAllow },
  ];

  const denyArchive = [
    P.SendMessages, P.SendMessagesInThreads, P.CreatePublicThreads, P.CreatePrivateThreads,
    P.EmbedLinks, P.AttachFiles, P.AddReactions, P.CreateInstantInvite,
    P.Connect, P.Speak, P.Stream
  ];

  const overwritesArchive = [
    { id: everyoneId, deny: [P.ViewChannel] },
    { id: ADMIN_ROLE_ID,  allow: [P.ViewChannel, P.ReadMessageHistory],  deny: denyArchive },
    { id: MEMBERS_ROLE_ID,allow: [P.ViewChannel, P.ReadMessageHistory],  deny: denyArchive },
    { id: botId,          allow: botAllow }, // le bot garde les pleins droits
  ];

  await cat.permissionOverwrites.set(mode === 'archive' ? overwritesArchive : overwritesActive);
  return cat;
}

// -------- create / archive / unarchive / delete
async function createProject(guild, projectName) {
  const slug = slugify(projectName);
  const activeCat = await ensureCategoryWithPerms(guild, ACTIVE_CATEGORY_NAME, 'active');

  const projRole = await guild.roles.create({
    name: `PROJET — ${projectName}`,
    mentionable: true,
    hoist: true,
    color: getUniqueRandomColor(guild),
  });
  const roleId = projRole.id;

  const emoji = COLORED_EMOJIS[Math.floor(Math.random() * COLORED_EMOJIS.length)];
  const tasks = [];

  // Bannière
  tasks.push(() => guild.channels.create({
    name: bannerName(projectName, emoji),
    type: ChannelType.GuildText,
    parent: activeCat,
    topic: buildTopic({ slug, roleId, tag: 'BANNER' }),
    permissionOverwrites: [{ id: roleId, allow: [P.ViewChannel, P.SendMessages] }],
  }));

  // Salons texte standard
  for (const n of EXPECTED_TEXTS) {
    tasks.push(() => guild.channels.create({
      name: n,
      type: ChannelType.GuildText,
      parent: activeCat,
      topic: buildTopic({ slug, roleId, tag: n.toUpperCase() }),
      permissionOverwrites: [{ id: roleId, allow: [P.ViewChannel, P.SendMessages] }],
    }));
  }

  // Vocal
  tasks.push(() => guild.channels.create({
    name: voiceName(slug),
    type: ChannelType.GuildVoice,
    parent: activeCat,
    permissionOverwrites: [{ id: roleId, allow: [P.Connect, P.Speak] }],
  }));

  await runLimited(tasks, 3);
  return { roleId, slug };
}

async function archiveProject(guild, projectName) {
  const slug = slugify(projectName);
  const activeCat  = await ensureCategoryWithPerms(guild, ACTIVE_CATEGORY_NAME,  'active');
  const archiveCat = await ensureCategoryWithPerms(guild, ARCHIVE_CATEGORY_NAME, 'archive');

  // Cible uniquement les salons du projet via topic PROJECT:<slug>
  const textChans = await getProjectTextChannels(guild, slug);
  for (const ch of textChans) {
    if (ch.parentId !== archiveCat.id) {
      await ch.setParent(archiveCat).catch(() => {});
    }
  }

  // Supprime le vocal du projet
  const all = await guild.channels.fetch();
  const voice = [...all.values()].find(c =>
    c.type === ChannelType.GuildVoice && c.name === voiceName(slug)
  );
  if (voice) await voice.delete().catch(() => {});

  // Supprime le rôle du projet (on récupère l’ID à partir d’un topic)
  let roleId = null;
  for (const ch of textChans) {
    roleId = extractRoleIdFromTopic(ch);
    if (roleId) break;
  }
  if (!roleId) {
    // fallback par nom si pas trouvé (rare)
    const rByName = guild.roles.cache.find(r => r.name === `PROJET — ${projectName}`);
    roleId = rByName?.id || null;
  }
  if (roleId) {
    const role = guild.roles.cache.get(roleId);
    if (role) await role.delete().catch(() => {});
  }

  return { moved: textChans.length, voiceDeleted: voice ? 1 : 0 };
}

async function unarchiveProject(guild, projectName) {
  const slug = slugify(projectName);
  const archiveCat = await ensureCategoryWithPerms(guild, ARCHIVE_CATEGORY_NAME, 'archive');
  const activeCat  = await ensureCategoryWithPerms(guild, ACTIVE_CATEGORY_NAME,  'active');

  // Recrée le rôle
  const projRole = await guild.roles.create({
    name: `PROJET — ${projectName}`,
    mentionable: true,
    hoist: true,
    color: getUniqueRandomColor(guild),
  });
  const roleId = projRole.id;

  // Ramène uniquement les salons du projet (via topic)
  const textChans = await getProjectTextChannels(guild, slug);
  for (const ch of textChans) {
    await ch.setParent(activeCat).catch(() => {});
    // On remet un overwrite basique pour le rôle (au cas où)
    await ch.permissionOverwrites.edit(roleId, { ViewChannel: true, SendMessages: true }).catch(() => {});
    // Ajoute/patch le topic pour garder le ROLE:<id> à jour
    const newTopic = buildTopic({ slug, roleId, tag: (ch.topic?.match(/\b(BANNER|BRIEF|DISCUSSION|RESSOURCES|LIVRABLES|RETOURS)\b/)||[])[0] });
    await ch.setTopic(newTopic).catch(() => {});
  }

  // Recrée le vocal
  await guild.channels.create({
    name: voiceName(slug),
    type: ChannelType.GuildVoice,
    parent: activeCat,
    permissionOverwrites: [{ id: roleId, allow: [P.Connect, P.Speak] }],
  }).catch(() => {});

  return { moved: textChans.length, roleId };
}

async function deleteProject(guild, projectName) {
  const slug = slugify(projectName);

  // Supprime tous les salons texte du projet (active + archive) via topic
  const textChans = await getProjectTextChannels(guild, slug);
  for (const ch of textChans) await ch.delete().catch(() => {});

  // Supprime le vocal s’il existe
  const all = await guild.channels.fetch();
  const voice = [...all.values()].find(c =>
    c.type === ChannelType.GuildVoice && c.name === voiceName(slug)
  );
  if (voice) await voice.delete().catch(() => {});

  // Supprime le rôle (ID depuis topic si possible)
  let roleId = null;
  for (const ch of textChans) { roleId = extractRoleIdFromTopic(ch); if (roleId) break; }
  if (!roleId) {
    const rByName = guild.roles.cache.find(r => r.name === `PROJET — ${projectName}`);
    roleId = rByName?.id || null;
  }
  if (roleId) {
    const role = guild.roles.cache.get(roleId);
    if (role) await role.delete().catch(() => {});
  }

  return { textDeleted: textChans.length, voiceDeleted: voice ? 1 : 0 };
}

// -------- wiring
client.once('ready', () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const guild = interaction.guild ?? (await client.guilds.fetch(GUILD_ID));
  try {
    if (interaction.commandName === 'newproject') {
      const name = interaction.options.getString('project', true);
      await interaction.reply({ content: `Création de ${name}…`, ephemeral: true });
      const r = await createProject(guild, name);
      await interaction.editReply(`✅ ${name} créé (rôle ${r.roleId}).`);
    }

    if (interaction.commandName === 'archive') {
      const name = interaction.options.getString('project', true);
      await interaction.reply({ content: `Archivage de ${name}…`, ephemeral: true });
      const r = await archiveProject(guild, name);
      await interaction.editReply(`🗃️ ${name} archivé (${r.moved} salons, ${r.voiceDeleted} vocaux supprimés).`);
    }

    if (interaction.commandName === 'unarchive') {
      const name = interaction.options.getString('project', true);
      await interaction.reply({ content: `Désarchivage de ${name}…`, ephemeral: true });
      const r = await unarchiveProject(guild, name);
      await interaction.editReply(`📂 ${name} désarchivé (${r.moved} salons, rôle ${r.roleId}).`);
    }

    if (interaction.commandName === 'delete') {
      const name = interaction.options.getString('project', true);
      await interaction.reply({ content: `Suppression de ${name}…`, ephemeral: true });
      const r = await deleteProject(guild, name);
      await interaction.editReply(`🗑️ ${name} supprimé (${r.textDeleted} salons, ${r.voiceDeleted} vocaux).`);
    }
  } catch (err) {
    console.error(err);
    const msg = err?.message || String(err);
    // Si la reply a déjà été envoyée, on essaie de followUp
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: `❌ Erreur : ${msg}`, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: `❌ Erreur : ${msg}`, ephemeral: true }).catch(() => {});
    }
  }
});

client.login(TOKEN);