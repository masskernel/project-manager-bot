// register-commands.js — version stable
require('dotenv').config();
const { REST, Routes, ApplicationCommandOptionType } = require('discord.js');

const { TOKEN, CLIENT_ID, GUILD_ID } = process.env;

const commands = [
  {
    name: 'newproject',
    description: 'Créer un nouveau projet',
    options: [
      { name: 'project', description: 'Nom du projet', type: ApplicationCommandOptionType.String, required: true },
      { name: 'client_role', description: 'Rôle client (facultatif)', type: ApplicationCommandOptionType.Role, required: false }
    ]
  },
  {
    name: 'archive',
    description: 'Archiver un projet',
    options: [{ name: 'project', description: 'Nom du projet', type: ApplicationCommandOptionType.String, required: true }]
  },
  {
    name: 'unarchive',
    description: 'Désarchiver un projet',
    options: [{ name: 'project', description: 'Nom du projet', type: ApplicationCommandOptionType.String, required: true }]
  },
  {
    name: 'delete',
    description: 'Supprimer totalement un projet (salons + vocaux + rôle)',
    options: [{ name: 'project', description: 'Nom du projet', type: ApplicationCommandOptionType.String, required: true }]
  }
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('⏳ Enregistrement des commandes...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ Commandes enregistrées.');
  } catch (err) {
    console.error('❌ Erreur:', err);
    process.exit(1);
  }
})();