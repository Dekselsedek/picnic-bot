/**
 * /login — login bij Picnic account.
 */

import {
  SlashCommandBuilder,
  SlashCommandStringOption,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { PicnicService } from '../services/picnic.js';

// Pending 2FA sessions: userId -> { email, password }
export const pending2FA = new Map<string, { email: string; password: string }>();

export const LOGIN_COMMAND = {
  data: new SlashCommandBuilder()
    .setName('login')
    .setDescription('Login bij Picnic')
    .addStringOption(
      new SlashCommandStringOption()
        .setName('email')
        .setDescription('Je Picnic e-mailadres')
        .setRequired(true)
    )
    .addStringOption(
      new SlashCommandStringOption()
        .setName('wachtwoord')
        .setDescription('Je Picnic wachtwoord')
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const email = interaction.options.getString('email', true);
    const password = interaction.options.getString('wachtwoord', true);

    const ps = new PicnicService();

    try {
      const result = await ps.login(email, password);

      if (result.requires2FA) {
        // Store pending session
        pending2FA.set(interaction.user.id, { email, password });

        await interaction.reply({
          content: '2FA nodig — ik stuur je een DM om de code in te voeren.',
          ephemeral: true,
        });

        // DM the user for 2FA code
        try {
          const dm = await interaction.user.send(
            'Voer de 2FA code in die je per SMS hebt ontvangen. Typ de code in dit kanaal.'
          );
          // The 2FA DM handler is in index.ts
          void dm;
        } catch {
          // Fallback if DM fails
          await interaction.followUp({
            content: 'Kon geen DM sturen. Zorg dat je DM\'s toestaat van serverleden.',
            ephemeral: true,
          });
        }
        return;
      }

      await ps.saveAuth();
      await interaction.reply({ content: 'Ingelogd!', ephemeral: true });
    } catch (err) {
      console.error('Login error:', err);
      await interaction.reply({
        content: `Login mislukt: ${(err as Error).message}`,
        ephemeral: true,
      });
    }
  },
};
