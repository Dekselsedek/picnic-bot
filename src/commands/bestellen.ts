/**
 * /bestellen — interactief boodschappenlijst omzetten in Picnic mand.
 */

import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SelectMenuInteraction,
  type ButtonInteraction,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { GroceryListService } from '../services/groceryList.js';
import { PicnicService } from '../services/picnic.js';

const groceryService = new GroceryListService();

type ProductResult = { id: string; name: string; price: number; unit: string };

type Session = {
  listItems: { id: string; name: string; quantity: number }[];
  currentIndex: number;
  results: ProductResult[];
  resolved: { itemId: string; productId: string; name: string; price: number }[];
};

const sessions = new Map<string, Session>();

function fmt(cents: number) { return '\u20ac' + (cents / 100).toFixed(2); }

async function showNextItem(replyTarget: any, ps: PicnicService, userId: string) {
  const session = sessions.get(userId)!;
  if (session.currentIndex >= session.listItems.length) {
    await showCart(replyTarget, ps, userId);
    return;
  }

  const item = session.listItems[session.currentIndex];
  const { products, ambiguous } = await ps.searchProductsDisambiguate(item.name, 6);

  if (products.length === 0) {
    const msg = `Geen resultaten voor "${item.name}", overgeslagen.`;
    if ('update' in replyTarget) await replyTarget.update({ content: msg, components: [] });
    else await replyTarget.followUp({ content: msg, ephemeral: true });
    session.currentIndex++;
    await showNextItem(replyTarget, ps, userId);
    return;
  }

  session.results = products;

  if (!ambiguous && products.length === 1) {
    const p = products[0];
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`b_ja_${session.currentIndex}`).setLabel('Ja').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`b_pick_${session.currentIndex}`).setLabel('Andere').setStyle(ButtonStyle.Secondary)
    );
    const msg = `**${item.name}**\n  \u2192 ${p.name} | ${fmt(p.price)}\n\nToevoegen?`;
    if ('update' in replyTarget) await replyTarget.update({ content: msg, components: [row] });
    else await replyTarget.followUp({ content: msg, components: [row], ephemeral: true });
  } else {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`b_pick_${session.currentIndex}`)
      .setPlaceholder('Kies een product...')
      .addOptions(
        ...products.slice(0, 10).map((p, i) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(p.name.slice(0, 100))
            .setDescription(`${fmt(p.price)} ${p.unit}`)
            .setValue(String(i))
        ),
        new StringSelectMenuOptionBuilder().setLabel('Geen van deze').setValue('skip')
      );
    const msg = `**${item.name}** \u2014 ${products.length} resultaten. Kies:`;
    if ('update' in replyTarget) {
      await replyTarget.update({ content: msg, components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)] });
    } else {
      await replyTarget.followUp({ content: msg, components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)], ephemeral: true });
    }
  }
}

async function showCart(replyTarget: any, ps: PicnicService, userId: string) {
  const session = sessions.get(userId)!;

  let totaal = 0;
  for (const item of session.resolved) {
    try {
      await ps.addToCart(item.productId, 1);
      totaal += item.price;
    } catch (err) {
      console.warn('Could not add:', item.name, (err as Error).message);
    }
  }

  let slotsText = '';
  try {
    const { slots } = await ps.getDeliverySlots();
    const avail = slots.filter(s => s.available);
    if (avail.length === 0) slotsText = 'Geen bezorgslots beschikbaar.';
    else {
      slotsText = '**Beschikbare bezorgslots:**\n';
      for (const s of avail.slice(0, 5)) {
        slotsText += `  - ${s.date} ${s.start}-${s.end} | ${s.price === 0 ? 'Gratis' : fmt(s.price)}\n`;
      }
    }
  } catch {
    slotsText = 'Kon bezorgslots niet ophalen (2FA sessie verlopen?).';
  }

  let reply = `**Mand gevuld!**\n\n**Bestelling:**\n`;
  for (const item of session.resolved) {
    reply += `  - ${item.name} | ${fmt(item.price)}\n`;
  }
  reply += `\n**Totaal: ${fmt(totaal)}**\n\n${slotsText}\n_Betaling doe je in de Picnic app._`;

  sessions.delete(userId);
  if ('update' in replyTarget) await replyTarget.update({ content: reply, components: [] });
  else await replyTarget.followUp({ content: reply, ephemeral: true });
}

export const ORDER_COMMAND = {
  data: new SlashCommandBuilder()
    .setName('bestellen')
    .setDescription('Zet je boodschappenlijst om in een Picnic bestelling'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    const list = groceryService.getList(userId);

    if (list.items.length === 0) {
      await interaction.reply({ content: 'Je lijst is leeg. Gebruik /voegtoe eerst.', ephemeral: true });
      return;
    }

    const ps = new PicnicService();
    ps.loadAuth();
    if (!ps.isAuthenticated()) {
      await interaction.reply({ content: 'Niet ingelogd bij Picnic. Gebruik /login eerst.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    sessions.set(userId, {
      listItems: list.items.map(i => ({ id: i.id, name: i.name, quantity: i.quantity })),
      currentIndex: 0,
      results: [],
      resolved: [],
    });

    await interaction.followUp({
      content: `${list.items.length} items te verwerken. Ik begin met "${list.items[0].name}".`,
      ephemeral: true,
    });

    await showNextItem(interaction, ps, userId);
  },

  async handleComponent(interaction: SelectMenuInteraction | ButtonInteraction, userId: string) {
    const session = sessions.get(userId);
    if (!session) {
      await interaction.reply({ content: 'Sessie verlopen. Gebruik /bestellen opnieuw.', ephemeral: true });
      return;
    }

    const customId: string = (interaction as any).customId ?? '';

    if (customId.startsWith('b_ja_') || customId.startsWith('b_pick_')) {
      const product = session.results[0];
      if (product) {
        session.resolved.push({
          itemId: session.listItems[session.currentIndex].id,
          productId: product.id,
          name: product.name,
          price: product.price,
        });
        await interaction.update({ content: `+ ${product.name}`, components: [] });
        session.currentIndex++;
        const ps = new PicnicService();
        ps.loadAuth();
        await showNextItem(interaction, ps, userId);
      }
    } else if (customId.startsWith('b_pick_') && interaction.isSelectMenu()) {
      const value = interaction.values[0];
      if (value === 'skip') {
        await interaction.update({ content: 'Overgeslagen.', components: [] });
        session.currentIndex++;
        const ps = new PicnicService();
        ps.loadAuth();
        await showNextItem(interaction, ps, userId);
        return;
      }
      const idx = parseInt(value, 10);
      const product = session.results[idx];
      if (product) {
        session.resolved.push({
          itemId: session.listItems[session.currentIndex].id,
          productId: product.id,
          name: product.name,
          price: product.price,
        });
        await interaction.update({ content: `+ ${product.name}`, components: [] });
        session.currentIndex++;
        const ps = new PicnicService();
        ps.loadAuth();
        await showNextItem(interaction, ps, userId);
      }
    }
  },
};
