import { randomUUID } from 'crypto';

export const AVATAR_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;

/** Foto de perfil do cliente no bucket — uma chave nova a cada envio (sem sobrescrever a anterior). */
export function buildAvatarKey(customerId: string, extension: (typeof AVATAR_EXTENSIONS)[number]): string {
  return `customers/${customerId}/avatar-${randomUUID()}.${extension}`;
}

/**
 * Chave do S3 a partir da URL pública gravada em `photoUrl`. `null` quando a URL não é do nosso bucket
 * (ex.: foto da conta Google) — nesse caso não há arquivo nosso pra apagar.
 */
export function avatarKeyFromPublicUrl(publicUrl: string | undefined, bucket: string, region: string): string | null {
  if (!publicUrl) return null;
  let url: URL;
  try {
    url = new URL(publicUrl);
  } catch {
    return null;
  }
  if (url.hostname !== `${bucket}.s3.${region}.amazonaws.com`) return null;
  const key = decodeURIComponent(url.pathname.slice(1));
  return key || null;
}

/** Só o próprio cliente apaga foto: a chave precisa estar na pasta e no padrão de avatar dele. */
export function isOwnAvatarKey(key: string, customerId: string): boolean {
  return key.startsWith(`customers/${customerId}/avatar-`);
}
