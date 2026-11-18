export interface SupportSettings {
  whatsapp: string;
  commercialWhatsapp: string;
  financialWhatsapp: string;
  email: string;
  // Pedido explícito do usuário (18/11/2026) — antes fixos em `SupportPage.tsx` como
  // 'comercial@bsdelivery.com.br'/'financeiro@bsdelivery.com.br'; viram campos editáveis, mesmo
  // padrão do e-mail de suporte.
  commercialEmail: string;
  financialEmail: string;
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
  commercialEmail: 'comercial@bsdelivery.com.br',
  financialEmail: 'financeiro@bsdelivery.com.br',
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
