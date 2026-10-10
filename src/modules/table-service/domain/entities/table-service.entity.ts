export interface TablePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RestaurantTable {
  id: string;
  restaurantId: string;
  name: string;
  normalizedName: string;
  capacity?: number;
  position: TablePosition;
  activeOrderId?: string;
}

export interface TableWaiter {
  id: string;
  restaurantId: string;
  name: string;
  isActive: boolean;
}

export interface TableMapDecoration {
  id: string;
  label: string;
  type: 'wall' | 'bar' | 'kitchen' | 'entrance' | 'other';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TableMapLayout {
  restaurantId: string;
  decorations: TableMapDecoration[];
  spendingLimit?: number;
}