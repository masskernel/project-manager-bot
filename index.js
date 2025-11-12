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
      try {
        results[idx] = await tasks[idx]();
      } catch (e) {
        console.error('❌ Task failed:', e?.rawError ?? e?.message ?? e);
        results[idx] = e;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

function getUniqueRandomColor(guild) {
  const used = new Set(
    guild.roles.cache.map((r) => r.color).filter((c) => c && c !== 0)
  );
  let color;
  do {
    color = Math.floor(Math.random() * 0xffffff);
  } while (used.has(color));
  if (!color || color === 0) color = 0x5865f2;
  return color;
}

function privateOverwrites(guild, projectRoleId, kind /* 'text' | 'voice' */) {
  const botId = guild.members.me.id;
  const everyoneId = guild.roles.everyone.id;

  const commonAllows = [P.ViewChannel, P.ReadMessageHistory];
  const textAllows   = [P.SendMessages, P.EmbedLinks, P.AttachFiles, P.AddReactions, P.SendMessagesInThreads, P.CreatePublicThreads];
  const voiceAllows  = [P.Connect, P.Speak, P.Stream];

  const allowFor = (roleId) => ({
    id: roleId,
    allow: kind === 'voice'
      ? [...commonAllows, ...voiceAllows]
      : [...commonAllows, ...textAllows],
  });

  const botAllow = {
    id: botId,
    allow: [
      P.ViewChannel, P.ManageChannels, P.ManageRoles, P.ManageThreads,
      P.ReadMessageHistory, P.SendMessages, P.EmbedLinks, P.AttachFiles,
      P.AddReactions, P.CreateInstantInvite,
      P.Connect, P.Speak, P.Stream,
      P.SendMessagesInThreads, P.CreatePublicThreads,
    ],
  };

  return [
    { id: everyoneId, deny: [P.ViewChannel] },
    allowFor(ADMIN_ROLE_ID),
    allowFor(MEMBERS_ROLE_ID),
    allowFor(projectRoleId),
    botAllow,
  ];
}

async function ensureCategory(guild, name) {
  const all = await guild.channels.fetch();
  let cat = all.find((c) => c?.type === ChannelType.GuildCategory && c.name === name);
  if (!cat) {
    cat = await guild.channels.create({ name, type: ChannelType.GuildCategory });
  }
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

/* ---------- CREATE ---------- */
async function createProject(guild, projectName) {
  const slug = slugify(projectName);
  const activeCat = await ensureCategory(guild, ACTIVE_CATEGORY_NAME);

  const projRole = await guild.roles.create({
    name: `PROJET — ${projectName}`,
    mentionable: true,
    hoist: true,
    color: getUniqueRandomColor(guild),
  });
  const roleId = projRole.id;

  const emoji = COLORED_EMOJIS[Math.floor(Math.random() * COLORED_EMOJIS.length)];
  const tasks = [];

  tasks.push(async () => {
    return guild.channels.create({
      name: bannerName(projectName, emoji),
      type: ChannelType.GuildText,
      parent: activeCat,
      permissionOverwrites: privateOverwrites(guild, roleId, 'text'),
      topic: buildTopic({ slug, roleId, tag: 'BANNER' }),
    });
  });

  for (const n of EXPECTED_TEXTS) {
    tasks.push(async () => {
      return guild.channels.create({
        name: n,
        type: ChannelType.GuildText,
        parent: activeCat,
        permissionOverwrites: privateOverwrites(guild, roleId, 'text'),
        topic: buildTopic({ slug, roleId, tag: n.toUpperCase() }),
      });
    });
  }

  tasks.push(async () => {
    return guild.channels.create({
      name: voiceName(slug),
      type: ChannelType.GuildVoice,
      parent: activeCat,
      permissionOverwrites: privateOverwrites(guild, roleId, 'voice'),
    });
  });

  await runLimited(tasks, 3);
  return { roleId, slug };
}

/* ---------- ARCHIVE ---------- */
async function archiveProject(guild, projectName) {
  const slug = slugify(projectName);
  const activeCat  = await ensureCategory(guild, ACTIVE_CATEGORY_NAME);
  const archiveCat = await ensureCategory(guild, ARCHIVE_CATEGORY_NAME);

  const all = await guild.channels.fetch();

  const texts = Array.from(
    all
      .filter(
        (c) =>
          c.parentId === activeCat.id &&
          c.type === ChannelType.GuildText &&
          c.name.includes(slug)
      )
      .values()
  );

  const voices = Array.from(
    all
      .filter(
        (c) =>
          c.parentId === activeCat.id &&
          c.type === ChannelType.GuildVoice &&
          c.name.includes(slug)
      )
      .values()
  );

  for (const ch of texts) await ch.setParent(archiveCat);
  for (const v of voices) await v.delete();

  const role = guild.roles.cache.find((r) => r.name === `PROJET — ${projectName}`);
  if (role) await role.delete();

  return { moved: texts.length, voiceDeleted: voices.length };
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

  const all = await guild.channels.fetch();

  const texts = Array.from(
    all
      .filter(
        (c) =>
          c.parentId === archiveCat.id &&
          c.type === ChannelType.GuildText &&
          c.name.includes(slug)
      )
      .values()
  );

  for (const ch of texts) {
    await ch.setParent(activeCat);
    await ch.permissionOverwrites.set(privateOverwrites(guild, projRole.id, 'text'));
  }

  await guild.channels.create({
    name: voiceName(slug),
    type: ChannelType.GuildVoice,
    parent: activeCat,
    permissionOverwrites: privateOverwrites(guild, projRole.id, 'voice'),
  });

  return { moved: texts.length, roleId: projRole.id };
}

/* ---------- DELETE ---------- */
async function deleteProject(guild, projectName) {
  const slug = slugify(projectName);
  const all = await guild.channels.fetch();

  const texts = Array.from(
    all
      .filter(
        (c) =>
          c.type === ChannelType.GuildText &&
          c.name.includes(slug)
      )
      .values()
  );

  const voices = Array.from(
    all
      .filter(
        (c) =>
          c.type === ChannelType.GuildVoice &&
          c.name.includes(slug)
      )
      .values()
  );

  for (const ch of texts)  await ch.delete();
  for (const v of voices) await v.delete();

  const role = guild.roles.cache.find((r) => r.name === `PROJET — ${projectName}`);
  if (role) await role.delete();

  return { textDeleted: texts.length, voiceDeleted: voices.length };
}

/* ---------- BOT ---------- */
client.once('ready', () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const guild = await client.guilds.fetch(GUILD_ID);

  try {
    if (interaction.commandName === 'newproject') {
      const name = interaction.options.getString('project', true);
      await interaction.reply({ content: `Création de ${name}…`, flags: 1 << 6 }); // ephemeral (v15-friendly)
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
    try {
      await interaction.reply({ content: `❌ Erreur : ${err.message}`, flags: 1 << 6 });
    } catch {}
  }
});

client.login(TOKEN);