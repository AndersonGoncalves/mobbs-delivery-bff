import { randomBytes } from 'crypto';
import { environment } from '../../../shared/config/environment';

/** REQ-2 — 10 caracteres hex, mesmo formato do exemplo dado pelo usuário (`95c46d5345`). */
export function generateCampaignCode(): string {
  return randomBytes(5).toString('hex');
}

/** REQ-2 — mesmo domínio público/base de `buildTrackingLink` (`whatsapp-message-helpers.ts`);
 * o cardápio do cliente é servido por slug em path (`specs/0037-roteamento-por-caminho`), não
 * subdomínio. `src=wabot` identifica a origem (campanha de WhatsApp) pra quem olhar analytics
 * depois. */
export function buildCampaignMenuLink(slug: string, campaignCode: string, baseUrl: string = environment.publicApp.baseUrl): string {
  return `${baseUrl.replace(/\/+$/, '')}/${slug}?src=wabot&campaign=${campaignCode}`;
}

/** REQ-5 — página pública de descadastro (`mobbs-delivery-web`, `/sair/:token`, sem autenticação,
 * mesmo padrão de `/track`). */
export function buildCampaignUnsubscribeLink(token: string, baseUrl: string = environment.publicApp.baseUrl): string {
  return `${baseUrl.replace(/\/+$/, '')}/sair/${token}`;
}
