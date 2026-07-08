export interface GroceryItem {
  id: string;
  name: string;
  quantity: number;
  productId?: string;
  addedAt: Date;
  note?: string;
}

export interface GroceryList {
  id: string;
  name: string;
  items: GroceryItem[];
  createdAt: Date;
  updatedAt: Date;
  lastOrderedAt?: Date;
}

export interface PicnicProduct {
  id: string;
  name: string;
  price: number;
  unit: string;
  imageId?: string;
}

export interface DeliverySlot {
  slotId: string;
  date: string;
  start: string;
  end: string;
  price: number;
  available: boolean;
}

export const DEFAULT_LIST_ID = 'default';
