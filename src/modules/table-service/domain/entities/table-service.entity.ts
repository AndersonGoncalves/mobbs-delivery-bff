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
  type: 'wall' | 'bar' | 'kitchen' | 'entrance' | 'counter' | 'other';
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CounterPositions = Record<string, { x: number; y: number }>;

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface TableMapLayout {
  restaurantId: string;
  decorations: TableMapDecoration[];
  spendingLimit?: number;
  counterPositions?: CounterPositions;
  // Pedido explícito do usuário — dias da semana com música ao vivo, usado por
  // `TableOrderService`/web pra só exibir o checkbox "Couvert" nesses dias.
  liveMusicDays: DayOfWeek[];
}