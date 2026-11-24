import { DEFAULT_NEW_ORDER_RESTAURANT_TEMPLATE } from '../../notifications/domain/new-order-restaurant-message-builder';
import { BusinessType } from './business-type';
import { buildDefaultWelcomeMessage } from './default-welcome-message';
import { IBusinessHours } from './entities/restaurant.entity';
import { IRestaurantRepository } from './repositories/restaurant.repository.interface';

export type NewRestaurantInput = Parameters<IRestaurantRepository['create']>[0];

/** specs/0039-onboarding-primeiro-acesso REQ-1 — horário padrão "aberto todo dia, 08:00-23:00",
 * em vez de nascer vazio (o que faz o app mostrar "loja fechada" até o dono configurar). */
const ALL_DAYS: IBusinessHours['dayOfWeek'][] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
export const DEFAULT_BUSINESS_HOURS: IBusinessHours[] = ALL_DAYS.map((dayOfWeek) => ({ dayOfWeek, isClosed: false, openTime: '08:00', closeTime: '23:00' }));

/**
 * Estado inicial de um restaurante recém-criado — extraído de `RestaurantSignupController`
 * (specs/0215-ambiente-homologacao REQ-5) pra que o seed dos restaurantes fixos de homologação
 * (`scripts/seed-homolog-restaurants.ts`) nasça exatamente igual a um autocadastro real, sem
 * duplicar (e deixar divergir) a lista de defaults.
 *
 * specs/0039-onboarding-primeiro-acesso REQ-1/REQ-2 — destaques/banners/cancelar pedido/
 * imagem à direita nascem desligados (o default do schema é ligado) porque uma loja recém-
 * criada, sem produto/foto nenhum, fica com essas seções vazias/quebradas até o dono
 * configurar de verdade. REQ-10 — taxa de entrega nasce grátis (o default do schema é
 * `fixed`/R$ 0), pelo mesmo motivo: sem zona/valor configurado ainda, "grátis" é o estado
 * inicial mais correto até o dono decidir a taxa de verdade.
 */
export function buildNewRestaurantInput(params: { name: string; slug: string; phone?: string; businessType: BusinessType }): NewRestaurantInput {
  return {
    name: params.name,
    slug: params.slug,
    phone: params.phone,
    businessHours: DEFAULT_BUSINESS_HOURS,
    showHighlights: false,
    showBanners: false,
    allowCustomerCancelOrder: false,
    productImageOnRight: false,
    category: params.businessType,
    // specs/0062-confirmar-pedido-whatsapp-restaurante REQ-3 — grava o template de verdade
    // (não só confia no fallback do builder), igual todo default gravado nesta chamada.
    newOrderRestaurantWhatsAppTemplate: DEFAULT_NEW_ORDER_RESTAURANT_TEMPLATE,
    deliveryFeeMode: 'free',
    deliveryFeeCents: 0,
    welcomeMessage: buildDefaultWelcomeMessage(params.businessType),
    // Pedido explícito do usuário (11/11/2026) — autocadastro nasce com a identidade visual
    // padrão da plataforma, em vez de primaryColor/onPrimaryColor ausentes (sem default no
    // schema) e useWhiteBackground colorido (default `false` do schema), até o dono
    // configurar de verdade na retaguarda (App do cliente).
    primaryColor: '#3E44E8',
    onPrimaryColor: '#FFFFFF',
    useWhiteBackground: true,
  };
}
