import 'dotenv/config';
import { Client, GatewayIntentBits, Routes, REST, type ChatInputCommandInteraction, type Message } from 'discord.js';

import { PicnicService } from './services/picnic.js';
import { LOGIN_COMMAND, pending2FA } from './commands/login.js';
import { ADD_COMMAND } from './commands/voegtoe.js';
import { LIST_COMMAND } from './commands/lijst.js';
import { ORDER_COMMAND } from './commands/bestellen.js';

// ── Singleton PicnicService (shared across all commands) ─────────────────────
export const picnicService = new PicnicService();

// ── Discord client ────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ── Slash command registry ────────────────────────────────────────────────
const SLASH_COMMANDS = [
  LOGIN_COMMAND,
  ADD_COMMAND,
  LIST_COMMAND,
  ORDER_COMMAND,
];

// ── Startup ───────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`Logged in as ${client.user?.tag}`);

  // Restore Picnic session from disk so the bot stays logged in across restarts
  try {
    picnicService.loadAuth();
    console.log('Picnic auth loaded.');
  } catch (err) {
    console.warn('Could not load Picnic auth:', (err as Error).message);
  }

  // Register slash commands with Discord
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN!);
    const commands = SLASH_COMMANDS.map(c => c.data.toJSON());
    const guildId = process.env.GUILD_ID ?? '';
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(client.user!.id, guildId), { body: commands });
    } else {
      await rest.put(Routes.applicationCommands(client.user!.id), { body: commands });
    }
    console.log(`Registered ${commands.length} slash commands.`);
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
});

// ── Interaction handler ────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const cmd = SLASH_COMMANDS.find(c => c.data.name === interaction.commandName);
      if (cmd) {
        await (cmd as any).execute(interaction as ChatInputCommandInteraction);
        return;
      }
    }

    // Button / select-menu component routing
    if (interaction.isButton() || interaction.isSelectMenu()) {
      const customId: string = (interaction as any).customId ?? '';

      if (
        customId.startsWith('b_ja_') ||
        customId.startsWith('b_pick_') ||
        customId.startsWith('b_other_')
      ) {
        await (ORDER_COMMAND as any).handleComponent(interaction, interaction.user.id);
        return;
      }

      if (
        customId.startsWith('add_') ||
        customId.startsWith('remove_') ||
        customId.startsWith('clear_')
      ) {
        await interaction.reply({
          content: 'Deze actie is nog niet geïmplementeerd.',
          ephemeral: true,
        });
        return;
      }
    }
  } catch (err) {
    console.error('Interaction error:', err);
    try {
      if (interaction.isRepliable()) {
        await interaction.reply({
          content: `Er ging iets mis: ${(err as Error).message}`,
          ephemeral: true,
        });
      }
    } catch { /* ignore */ }
  }
});

// ── DM message handler (2FA code submission) ───────────────────────────────
// Text messages in DMs arrive via messageCreate, not interactionCreate
client.on('messageCreate', async (message: Message) => {
  // Ignore bots and non-DM channels
  if (message.author.bot || !message.channel.isDMBased()) return;

  const userId = message.author.id;
  const pending = pending2FA.get(userId);
  if (!pending) return;

  const code = message.content.trim();
  if (!code) {
    await message.reply('Geen code ontvangen. Probeer /login opnieuw.');
    return;
  }

  try {
    const ps = new PicnicService();
    await ps.login(pending.email, pending.password);
    await ps.verify2FA(code);
    await ps.saveAuth();
    pending2FA.delete(userId);
    await message.reply('2FA succesvol! Je bent nu ingelogd bij Picnic.');
  } catch (err) {
    await message.reply(`2FA mislukt: ${(err as Error).message}`);
  }
});

// ── Login ─────────────────────────────────────────────────────────────────
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error('DISCORD_BOT_TOKEN is not set in environment.');
  process.exit(1);
}

client.login(token).catch(err => {
  console.error('Failed to login:', err);
  process.exit(1);
});
