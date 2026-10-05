import { randomUUID } from 'crypto';

export const AVATAR_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;

/** Foto de perfil do cliente no bucket — uma chave nova a cada envio (sem sobrescrever a anterior). */
export function buildAvatarKey(customerId: string, extension: (typeof AVATAR_EXTENSIONS)[number]): string {
  return `customers/${customerId}/avatar-${randomUUID()}.${extension}`;
}
