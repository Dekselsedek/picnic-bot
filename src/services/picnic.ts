import type { PicnicProduct, DeliverySlot } from '../types/index.js';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';

type PicnicLib = any;

let _client: PicnicLib | null = null;

async function getClient(): Promise<PicnicLib> {
  if (_client) return _client;
  const mod = await import('picnic-api') as any;
  _client = new (mod.default ?? mod)({ countryCode: 'NL' });
  return _client;
}

export class PicnicService {
  private _authKey: string | null = null;

  setAuthKey(key: string) { this._authKey = key; }
  getAuthKey() { return this._authKey; }

  async login(email: string, password: string) {
    const client = await getClient();
    const result = await client.auth.login(email, password);
    this._authKey = result.authKey;
    return {
      authKey: result.authKey,
      requires2FA: result.second_factor_authentication_required ?? false,
    };
  }

  async verify2FA(code: string) {
    const client = await getClient();
    await client.auth.verify2FACode(code);
    this._authKey = client.auth.http.authKey;
    return this._authKey;
  }

  async generate2FA() {
    const client = await getClient();
    await client.auth.generate2FACode('SMS');
  }

  isAuthenticated() { return this._authKey !== null; }

  private async withAuth<T>(fn: (client: PicnicLib) => Promise<T>): Promise<T> {
    const client = await getClient();
    if (this._authKey) client.auth.http.authKey = this._authKey;
    return fn(client);
  }

  async searchProducts(query: string, limit = 10): Promise<PicnicProduct[]> {
    return this.withAuth(async client => {
      const results = await client.catalog.search(query, limit);
      return results.map((p: any) => ({
        id: p.id,
        name: p.name,
        price: p.display_price,
        unit: p.unit_quantity ?? '',
        imageId: p.image_ids?.[0],
      }));
    });
  }

  async searchProductsDisambiguate(query: string, limit = 6): Promise<{ products: PicnicProduct[]; ambiguous: boolean }> {
    const products = await this.searchProducts(query, limit);
    const names = products.map(p => p.name.toLowerCase());
    const uniqueNames = new Set(names);
    const ambiguous = products.length >= 3 && uniqueNames.size >= 2;
    return { products, ambiguous };
  }

  async addToCart(productId: string, count = 1) {
    return this.withAuth(async client => {
      await client.cart.addProductToCart(productId, count);
    });
  }

  async getCart(): Promise<{ items: { name: string; count: number; price: number }[]; total: number; itemCount: number }> {
    return this.withAuth(async client => {
      const cart = await client.cart.getCart();
      const lineItems = cart.items?.[0]?.items ?? [];
      const items = lineItems
        .filter((i: any) => i.type === 'ORDER_ARTICLE')
        .map((i: any) => ({ name: i.name, count: i.count ?? 1, price: i.price }));
      return { items, total: cart.total_price ?? cart.total ?? 0, itemCount: cart.total_count ?? items.length };
    });
  }

  async clearCart() {
    return this.withAuth(async client => {
      await client.cart.clearCart();
    });
  }

  async getDeliverySlots(): Promise<{ slots: DeliverySlot[] }> {
    return this.withAuth(async client => {
      const raw: any = await client.cart.getDeliverySlots();
      const rawSlots: any[] = raw.delivery_slots ?? [];
      return {
        slots: rawSlots.map(s => ({
          slotId: s.slot_id,
          date: s.window_start?.slice(0, 10) ?? '',
          start: s.window_start?.slice(11, 16) ?? '',
          end: s.window_end?.slice(11, 16) ?? '',
          price: s.price ?? 0,
          available: s.is_available ?? false,
        })),
      };
    });
  }

  async saveAuth(path = './data/picnic_auth.json') {
    if (!this._authKey) throw new Error('No auth key');
    mkdirSync('./data', { recursive: true });
    writeFileSync(path, JSON.stringify({ authKey: this._authKey, savedAt: new Date().toISOString() }));
  }

  loadAuth(path = './data/picnic_auth.json') {
    try {
      if (!existsSync(path)) return;
      const data = JSON.parse(readFileSync(path, 'utf-8'));
      if (data.authKey) this._authKey = data.authKey;
    } catch { /* ignore */ }
  }
}
