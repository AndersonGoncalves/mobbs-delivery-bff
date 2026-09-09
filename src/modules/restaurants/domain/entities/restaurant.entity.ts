export interface IBusinessHours {
  dayOfWeek: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  isClosed: boolean;
  openTime?: string;
  closeTime?: string;
}

export type PixKeyType = 'telefone' | 'cpf' | 'cnpj' | 'email' | 'aleatoria';

/**
 * Endereço do estabelecimento (não do cliente, docs/architecture/data-model.md §Address) — só os
 * campos físicos, sem `customerId`/`label`/`isDefault`/coordenadas (exclusivos do endereço de
 * entrega do `Customer`).
 */
export interface IRestaurantAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
}

/**
 * Campos de specs/0009-resolucao-restaurante (REQ-1/REQ-9: resolver + branding) mais os novos de
 * specs/0010-configuracao-restaurante (REQ-1, REQ-8, REQ-9, REQ-10) — docs/architecture/data-model.md
 * tem o Restaurant completo; os campos ainda não usados por nenhuma spec implementada (category,
 * description, bannerUrl, rating, deliveryFeeCents, estimatedDeliveryMinutes, whatsappConnected)
 * ficam de fora até a spec que os usa (0003/0006/0013) chegar.
 */
export interface IRestaurant {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  businessHours: IBusinessHours[];
  logoUrl?: string;
  primaryColor?: string;
  address?: IRestaurantAddress;
  phone?: string;
  minimumOrderValue: number;
  welcomeMessage?: string;
  orderConfirmationGreeting?: string;
  pixKey?: string;
  pixKeyType?: PixKeyType;
  pixBeneficiaryName?: string;
}
