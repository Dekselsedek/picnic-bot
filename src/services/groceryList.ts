import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { GroceryItem, GroceryList } from '../types/index.js';
import { DEFAULT_LIST_ID } from '../types/index.js';

const DATA_DIR = join(process.cwd(), 'data');
const LIST_FILE = (userId: string) => join(DATA_DIR, `list_${userId}.json`);

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadList(userId: string): GroceryList {
  const file = LIST_FILE(userId);
  ensureDataDir();
  if (existsSync(file)) {
    const raw = JSON.parse(readFileSync(file, 'utf-8'));
    return {
      ...raw,
      createdAt: new Date(raw.createdAt),
      updatedAt: new Date(raw.updatedAt),
      lastOrderedAt: raw.lastOrderedAt ? new Date(raw.lastOrderedAt) : undefined,
      items: raw.items.map((item: GroceryItem & { addedAt: string }) => ({
        ...item,
        addedAt: new Date(item.addedAt),
      })),
    };
  }
  return {
    id: DEFAULT_LIST_ID,
    name: 'Boodschappenlijst',
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function saveList(userId: string, list: GroceryList) {
  ensureDataDir();
  writeFileSync(LIST_FILE(userId), JSON.stringify(list, null, 2), 'utf-8');
}

export class GroceryListService {
  getList(userId: string): GroceryList {
    return loadList(userId);
  }

  addItem(userId: string, name: string, quantity = 1, note?: string): GroceryItem {
    const list = this.getList(userId);
    const item: GroceryItem = {
      id: crypto.randomUUID(),
      name: name.trim(),
      quantity,
      addedAt: new Date(),
      note,
    };
    list.items.push(item);
    list.updatedAt = new Date();
    saveList(userId, list);
    return item;
  }

  removeItem(userId: string, itemId: string): boolean {
    const list = this.getList(userId);
    const idx = list.items.findIndex(i => i.id === itemId);
    if (idx === -1) return false;
    list.items.splice(idx, 1);
    list.updatedAt = new Date();
    saveList(userId, list);
    return true;
  }

  clearList(userId: string) {
    saveList(userId, {
      id: DEFAULT_LIST_ID,
      name: 'Boodschappenlijst',
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  markOrdered(userId: string) {
    const list = this.getList(userId);
    list.lastOrderedAt = new Date();
    list.updatedAt = new Date();
    saveList(userId, list);
  }

  getResolvedItems(userId: string): GroceryItem[] {
    return this.getList(userId).items.filter(i => !!i.productId);
  }

  getUnresolvedItems(userId: string): GroceryItem[] {
    return this.getList(userId).items.filter(i => !i.productId);
  }
}
