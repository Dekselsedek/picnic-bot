/**
 * /voegtoe — voeg items toe aan je boodschappenlijst.
 * Geen Picnic nodig — zoeken gebeurt pas bij /bestellen.
 */

import {
  SlashCommandBuilder,
  SlashCommandStringOption,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { GroceryListService } from '../services/groceryList.js';

const groceryService = new GroceryListService();

export const ADD_COMMAND = {
  data: new SlashCommandBuilder()
    .setName('voegtoe')
    .setDescription('Voeg boodschappen toe aan je lijst')
    .addStringOption(
      new SlashCommandStringOption()
        .setName('items')
        .setDescription('Boodschappen (kommagescheiden: melk, rijst, tomaten)')
        .setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    const itemsRaw = interaction.options.getString('items', true);
    const items = itemsRaw.split(/[,;]/).map(s => s.trim()).filter(Boolean);

    if (items.length === 0) {
      await interaction.reply({ content: 'Geen geldige items.', ephemeral: true });
      return;
    }

    for (const item of items) {
      groceryService.addItem(userId, item, 1);
    }

    const list = groceryService.getList(userId);
    await interaction.reply({
      content: `${items.length} item(s) toegevoegd. Je lijst heeft nu ${list.items.length} items.\n_Gebruik /bestellen als je klaar bent._`,
      ephemeral: true,
    });
  },
};
