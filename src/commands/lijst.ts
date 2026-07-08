import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { GroceryListService } from '../services/groceryList.js';

const groceryService = new GroceryListService();

export const LIST_COMMAND = {
  data: new SlashCommandBuilder()
    .setName('lijst')
    .setDescription('Bekijk je boodschappenlijst'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    const list = groceryService.getList(userId);
    if (list.items.length === 0) {
      await interaction.reply({ content: 'Je lijst is leeg.', ephemeral: true });
      return;
    }
    let text = `**Boodschappenlijst** \u2014 ${list.items.length} items:\n\n`;
    for (const item of list.items) {
      text += `  - ${item.name}`;
      if (item.productId) text += ' \u2713';
      text += '\n';
    }
    text += '\n_Gebruik /bestellen om te bestellen._';
    await interaction.reply({ content: text, ephemeral: true });
  },
};
