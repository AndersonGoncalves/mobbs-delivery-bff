export interface IBusinessHours {
  dayOfWeek: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  isClosed: boolean;
  openTime?: string;
  closeTime?: string;
}

/**
 * Só os campos já necessários para specs/0009-resolucao-restaurante (REQ-1/REQ-9: resolver +
 * branding) — docs/architecture/data-model.md tem o Restaurant completo; os demais campos
 * entram quando as specs que os usam (0003, 0004, 0006, 0010, 0013) forem implementadas no BFF.
 */
export interface IRestaurant {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  businessHours: IBusinessHours[];
  logoUrl?: string;
  primaryColor?: string;
}
