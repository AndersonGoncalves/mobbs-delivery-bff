import { z } from 'zod';

import { normalizePhoneNumber } from '../../../shared/utils/normalize-phone-number';
import { isValidCnpj } from '../domain/cnpj-validator';
import { BUSINESS_TYPES } from '../domain/business-type';

// specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-10 — reaproveita o mesmo enum já
// usado em `Order.paymentMethod`/`Payment.method` (`modules/orders/domain/entities/order.entity.ts`),
// não redefine um novo.
export const paymentMethodSchema = z.enum(['creditCard', 'creditCardOnline', 'debitCard', 'pix', 'cash']);

// specs/0155-app-totem-autoatendimento REQ-11/"Fora de escopo" do spec.md — o totem só oferece
// dinheiro e Pix nesta v1 (sem maquininha integrada); schema próprio (não `paymentMethodSchema`
// inteiro) pra rejeitar na validação, não só esconder na UI, qualquer outra forma.
export const totemPaymentMethodSchema = z.enum(['pix', 'cash']);

// specs/0028-destaques-vendidos-banners REQ-5, REQ-6 — mesmo padrão de
// `productAdditionalGroupSchema`/`type`: o campo de destino exigido depende de `linkType`,
// validado de verdade no BFF (não só no formulário da web).
const bannerSchema = z
  .object({
    id: z.string().min(1),
    imageUrl: z.string().url(),
    linkType: z.enum(['product', 'category', 'externalUrl', 'highlights', 'bestSellers', 'none']),
    productId: z.string().min(1).optional(),
    menuCategoryId: z.string().min(1).optional(),
    externalUrl: z.string().url().optional(),
  })
  .superRefine((banner, ctx) => {
    if (banner.linkType === 'product' && !banner.productId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['productId'], message: 'productId é obrigatório quando linkType é "product"' });
    }
    if (banner.linkType === 'category' && !banner.menuCategoryId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['menuCategoryId'], message: 'menuCategoryId é obrigatório quando linkType é "category"' });
    }
    if (banner.linkType === 'externalUrl' && !banner.externalUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['externalUrl'], message: 'externalUrl é obrigatório quando linkType é "externalUrl"' });
    }
  });

// specs/0032-ajustes-diversos-rating-taxa-entrega REQ-10.
const deliveryFeeZoneSchema = z.object({
  id: z.string().min(1),
  neighborhood: z.string().min(1),
  feeCents: z.number().nonnegative(),
});

// specs/0010-configuracao-restaurante REQ-1, REQ-8, REQ-9, REQ-10 — cada página da retaguarda
// manda só os campos que edita (PUT /restaurants/me genérico, `plan.md`).
export const restaurantProfileSchema = z
  .object({
    name: z.string().min(1),
    // specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-14 — `.optional()` de
    // propósito (achado real: sem isso, salvar a página "App do cliente" sem nunca ter enviado
    // logo falhava `.url()`, já que o form manda a chave sempre, mesmo vazia) — mesmo padrão de
    // `defaultProductImageUrl`/`instagramUrl` abaixo.
    logoUrl: z.string().url().optional(),
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve estar em formato #RRGGBB'),
    onPrimaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve estar em formato #RRGGBB'),
    // specs/0031-imagem-padrao-disponibilidade-checkout-ajustes REQ-1.
    // specs/0031-imagem-padrao-disponibilidade-checkout-ajustes REQ-1 — `.optional()` de
    // propósito (diferente de `logoUrl`/`primaryColor` acima): a maioria dos restaurantes nunca
    // configura isso, então o form da retaguarda manda `undefined` (chave omitida) quando vazio,
    // não uma string vazia — não pode falhar `.url()` no primeiro "Salvar" de quem nunca mexeu
    // nesse campo.
    defaultProductImageUrl: z.string().url().optional(),
    address: z.object({
      street: z.string().min(1),
      number: z.string().min(1),
      complement: z.string().optional(),
      neighborhood: z.string().min(1),
      city: z.string().min(1),
      state: z.string().min(1),
      zipCode: z.string().min(1),
    }),
    // specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-3 — sempre salvo com "55" na
    // frente, independente do que o form mandar (máscara visual é só cosmética do lado web/app).
    phone: z.string().min(1).transform(normalizePhoneNumber),
    // specs/0029-ajustes-carrinho-perfil-restaurante-diversos REQ-4.
    document: z.string().refine(isValidCnpj, 'CNPJ inválido'),
    minimumOrderValue: z.number().nonnegative(),
    stockControlEnabled: z.boolean().optional(),
    // specs/0131-cashback-app REQ-1 — 0 a 100, default 0 (desligado).
    cashbackPercent: z.number().min(0).max(100).optional(),
    // specs/0132-programa-fidelidade-app REQ-1 — ausência/`0` = feature desligada.
    loyaltyGoalOrders: z.number().int().nonnegative().optional(),
    loyaltyRewardValue: z.number().nonnegative().optional(),
    // specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login REQ-1 — só usado de verdade
    // quando deliveryFeeMode === 'fixed', mas sempre aceito/gravado (mesmo raciocínio de
    // deliveryFeeZones, que também persiste mesmo fora do modo byNeighborhood).
    deliveryFeeCents: z.number().nonnegative(),
    // specs/0029-ajustes-carrinho-perfil-restaurante-diversos REQ-2.
    shareMessage: z.string(),
    // specs/0094-mensagem-boas-vindas-home REQ-1 — opcional; string vazia limpa o card.
    welcomeMessage: z.string().max(500).optional(),
    welcomeCardColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve estar em formato #RRGGBB').optional(),
    pixKey: z.string(),
    pixKeyType: z.enum(['telefone', 'cpf', 'cnpj', 'email', 'aleatoria']),
    pixBeneficiaryName: z.string(),
    // specs/0029-ajustes-carrinho-perfil-restaurante-diversos REQ-8.
    productImageOnRight: z.boolean(),
    // toggle visual análogo a productImageOnRight: fundo branco fixo (true) vs. tom calculado
    // a partir de primaryColor (false, default).
    useWhiteBackground: z.boolean(),
    // Pedido explícito do usuário — mesmo raciocínio de useWhiteBackground, pra barra de
    // navegação inferior. Default true (branco fixo).
    useWhiteBottomNavBar: z.boolean(),
    // Pedido explícito do usuário (3º follow-up) — `statusBarColorMode` (enum, 2º follow-up)
    // removido: a barra de status não é mais escolhível à parte, sempre segue useWhiteBackground.
    // Pedido explícito do usuário (2º follow-up) — mesmo raciocínio de useWhiteBackground, pros
    // campos de texto e a caixa de busca da home do app cliente.
    useWhiteTextFieldColor: z.boolean(),
    useWhiteSearchFieldColor: z.boolean(),
    // specs/0028-destaques-vendidos-banners REQ-1, REQ-4, REQ-10.
    showBestSellers: z.boolean(),
    showHighlights: z.boolean(),
    showBanners: z.boolean(),
    showReorderTag: z.boolean().optional(),
    showMostPurchasedTag: z.boolean().optional(),
    banners: z.array(bannerSchema),
    // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-2.
    allowCustomerCancelOrder: z.boolean(),
    // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-10; 'free' adicionado em
    // specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login REQ-1.
    deliveryFeeMode: z.enum(['fixed', 'byNeighborhood', 'free']),
    deliveryFeeZones: z.array(deliveryFeeZoneSchema),
    // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-9 — mesmo padrão `.optional()` de
    // `defaultProductImageUrl` (a maioria não configura, form manda `undefined`, não string vazia).
    instagramUrl: z.string().url().optional(),
    // specs/0118-controle-caixa-automatico-redes-sociais REQ-7/REQ-8 — mesmo padrão `.optional()`
    // de `instagramUrl` (opcional, link completo).
    facebookUrl: z.string().url().optional(),
    // specs/0118-controle-caixa-automatico-redes-sociais REQ-1 — seletor "manual"/"automático"
    // salvo junto com o resto do perfil (`CashRegisterPage.tsx`, não o Perfil de verdade).
    cashRegisterMode: z.enum(['manual', 'automatic']),
    // Pedido explícito do usuário — liga/desliga global do bloqueio de clientes.
    customerBlockingEnabled: z.boolean(),
    // specs/0139-impressao-automatica-bridge REQ-5 — a chave de API (`autoPrintApiKey`) não entra
    // aqui de propósito, só é gerada/trocada pela rota dedicada de regenerar.
    autoPrintEnabled: z.boolean(),
    autoPrintIntervalSeconds: z.number().int().min(5).max(120),
    // specs/0156-filtro-idade-impressao-automatica REQ-2.
    autoPrintMaxAgeMinutes: z.number().int().min(1).max(60),
    // specs/0155-app-totem-autoatendimento REQ-22 — a chave (`totemApiKey`) não entra aqui de
    // propósito, só é gerada/trocada pela rota dedicada de regenerar (mesmo padrão de
    // `autoPrintApiKey`/`autoPrintEnabled` acima).
    totemEnabled: z.boolean(),
    totemPaymentMethods: z.array(totemPaymentMethodSchema),
    // Pedido explícito do usuário — tempo médio de atendimento, por modalidade (minutos).
    deliveryTimeMinMinutes: z.number().int().positive(),
    deliveryTimeMaxMinutes: z.number().int().positive(),
    pickupTimeMinMinutes: z.number().int().positive(),
    pickupTimeMaxMinutes: z.number().int().positive(),
    // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-1.
    showHighlightsInMultipleRows: z.boolean(),
    showBestSellersInMultipleRows: z.boolean(),
    // specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login REQ-1 — mesmo padrão de
    // `showBestSellers` desde specs/0117-vitrine-manual-e-ajustes-formularios.
    showCartSuggestions: z.boolean(),
    // specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-10.
    acceptedPaymentMethods: z.array(paymentMethodSchema),
    // specs/0151-confirmacao-automatica-por-forma-pagamento REQ-1.
    autoConfirmPaymentMethods: z.array(paymentMethodSchema),
    // specs/0083-modalidade-entrega-retirada-restaurante REQ-2/REQ-3 — pelo menos uma modalidade.
    orderTypes: z.array(z.enum(['delivery', 'pickup'])).min(1, 'Escolha pelo menos uma modalidade (entrega ou retirada)'),
    // specs/0062-confirmar-pedido-whatsapp-restaurante.
    notifyRestaurantOnNewOrder: z.boolean(),
    newOrderRestaurantWhatsAppTemplate: z.string(),
    // specs/0063-notificacao-whatsapp-pedido-confirmado.
    notifyCustomerOnOrderConfirmed: z.boolean(),
    orderConfirmedWhatsAppTemplate: z.string(),
    // specs/0064-notificacao-whatsapp-pix-confirmado.
    notifyCustomerOnPixConfirmed: z.boolean(),
    pixConfirmedWhatsAppTemplate: z.string(),
    // specs/0069.
    notifyCustomerOnOrderCreated: z.boolean(),
    orderReceiptWhatsAppTemplate: z.string(),
    // specs/0065.
    notifyCustomerOnOrderOutForDelivery: z.boolean(),
    notifyCustomerOnOrderReadyForPickup: z.boolean(),
    orderOutForDeliveryWhatsAppTemplate: z.string(),
    orderReadyForPickupWhatsAppTemplate: z.string(),
    // specs/0071.
    notifyCustomerOnOrderPreparing: z.boolean(),
    orderPreparingWhatsAppTemplate: z.string(),
    notifyCustomerOnOrderCancelled: z.boolean(),
    orderCancelledWhatsAppTemplate: z.string(),
    // specs/0086-mensagens-whatsapp-pedido-entregue-pagamento-confirmado.
    notifyCustomerOnOrderDelivered: z.boolean(),
    orderDeliveredWhatsAppTemplate: z.string(),
  })
  .partial()
  .superRefine((data, ctx) => {
    // specs/0151-confirmacao-automatica-por-forma-pagamento REQ-2 — validado de verdade no BFF,
    // não só confiar na UI (mesmo padrão de `businessHourSchema` acima): toda forma marcada pra
    // confirmar automaticamente também precisa estar marcada como aceita, no mesmo payload (o
    // schema é `.partial()`, então exige os dois campos juntos quando `autoConfirmPaymentMethods`
    // é enviado — não dá pra validar contra o estado atual do restaurante aqui).
    if (!data.autoConfirmPaymentMethods) return;
    if (!data.acceptedPaymentMethods) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['autoConfirmPaymentMethods'],
        message: 'autoConfirmPaymentMethods precisa ser enviado junto com acceptedPaymentMethods',
      });
      return;
    }
    const notAccepted = data.autoConfirmPaymentMethods.filter((method) => !data.acceptedPaymentMethods!.includes(method));
    if (notAccepted.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['autoConfirmPaymentMethods'],
        message: `Forma(s) de pagamento não aceita(s), não pode(m) confirmar automaticamente: ${notAccepted.join(', ')}`,
      });
    }
  });

const businessHourSchema = z
  .object({
    dayOfWeek: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
    isClosed: z.boolean(),
    openTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    closeTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  })
  .refine(
    (day) => day.isClosed || !day.openTime || !day.closeTime || day.closeTime > day.openTime,
    // REQ-7: horário de fechamento não pode ser anterior ao de abertura no mesmo dia. Validação
    // "de verdade" também no BFF (não só no React Hook Form do lado web) — nunca confiar só no
    // cliente pra uma regra de negócio.
    { message: 'Horário de fechamento não pode ser anterior ao de abertura' },
  );

export const businessHoursSchema = z.array(businessHourSchema);

export const setActiveSchema = z.object({ isActive: z.boolean() });

// specs/0038-autocadastro-restaurante REQ-2 — e-mail/senha não vêm no corpo (já autenticados via
// Firebase antes desta rota chegar no handler, ver `req.user!.email` em `RestaurantSignupController`).
// specs/0039-onboarding-primeiro-acesso REQ-8 — businessType obrigatório (não `.optional()`):
// decide o catálogo inicial (REQ-9), sempre pedido no formulário de cadastro.
export const signupSchema = z.object({
  name: z.string().min(1),
  ownerName: z.string().trim().min(1),
  // specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-3.
  whatsapp: z.string().min(1).transform(normalizePhoneNumber),
  businessType: z.enum(BUSINESS_TYPES),
});

export const updateSlugSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'Slug deve conter só letras minúsculas, números e hífen'),
});

// specs/0021-papeis-operador REQ-1 — todo operador novo já nasce com um papel explícito (o
// `dono` que cadastra escolhe; `gerente` por padrão no formulário da web, mas o BFF sempre exige
// o campo, nunca assume).
// specs/0137-papeis-garcom-motoboy REQ-2/REQ-3 — `garcom`/`motoboy` adicionados ao mesmo enum.
export const operatorRoleSchema = z.enum(['dono', 'gerente', 'financeiro', 'garcom', 'motoboy']);

export const addOperatorSchema = z.object({
  email: z.string().email(),
  role: operatorRoleSchema,
  name: z.string().trim().min(1),
  whatsapp: z.string().trim().min(1).transform(normalizePhoneNumber).optional(),
  photoUrl: z.string().url().optional(),
});

// specs/0021-papeis-operador REQ-8 — troca do papel de um operador já cadastrado.
export const updateOperatorRoleSchema = z.object({ role: operatorRoleSchema });
export const updateOperatorFullAccessSchema = z.object({ hasFullAccess: z.boolean() });

// (ajuste, pedido explícito do usuário) — editar nome/WhatsApp/foto de um operador já cadastrado
// (ex. um operador criado antes do nome virar obrigatório, specs/0161). Nunca inclui `email`
// (pedido explícito do usuário: e-mail não pode ser alterado aqui — é o que casa com a conta
// Firebase de login) nem `role`/`hasFullAccess` (já têm os próprios controles no grid).
export const updateOperatorProfileSchema = z.object({
  name: z.string().trim().min(1),
  whatsapp: z.string().trim().min(1).transform(normalizePhoneNumber).optional(),
  photoUrl: z.string().url().nullable().optional(),
});
