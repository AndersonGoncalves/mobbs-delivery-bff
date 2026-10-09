import { randomUUID } from 'crypto';

/** specs/0124-campanha-whatsapp-prospects REQ-3 — imagem opcional da mensagem de abordagem, sem
 * vínculo com nenhum restaurante (ao contrário de `buildUploadKey`, que exige um
 * `restaurantId`). */
export function buildPlatformUploadKey(filename: string): string {
  const extension = filename.includes('.') ? filename.slice(filename.lastIndexOf('.') + 1) : 'jpg';
  return `platform/prospects/outreach/${randomUUID()}.${extension}`;
}
