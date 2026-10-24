export interface SupportSettings {
  whatsapp: string;
  commercialWhatsapp: string;
  financialWhatsapp: string;
  email: string;
  businessHours: string;
  trainingPriceCents: number;
  trainingUnlimitedItems: boolean;
  trainingIncludedItems: number;
  trainingExtraItemPriceCents: number;
}

export const DEFAULT_SUPPORT_SETTINGS: Readonly<SupportSettings> = {
  whatsapp: '5585986404604',
  commercialWhatsapp: '5585986404604',
  financialWhatsapp: '5585986404604',
  email: 'anndersonn.gonncalves@gmail.com',
  businessHours: 'Horário comercial',
  trainingPriceCents: 4990,
  trainingUnlimitedItems: true,
  trainingIncludedItems: 50,
  trainingExtraItemPriceCents: 100,
};

export interface ISupportSettingsRepository {
  get(): Promise<SupportSettings>;
  update(settings: SupportSettings): Promise<SupportSettings>;
}
