import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * specs/0112 REQ-9 — criptografia de campo sensível (AES-256-GCM). A chave vem da variável de ambiente
 * `PIX_KEY_ENCRYPTION_KEY` (32 bytes em base64). Sem ela, qualquer uso falha: nunca grava em claro.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function loadKey(): Buffer {
  const raw = process.env.PIX_KEY_ENCRYPTION_KEY;
  if (!raw) throw new Error('PIX_KEY_ENCRYPTION_KEY não configurada');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('PIX_KEY_ENCRYPTION_KEY precisa ter 32 bytes em base64');
  return key;
}

/** Devolve `iv | tag | cifrado` em base64. */
export function encryptField(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, loadKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

export function decryptField(payload: string): string {
  const data = Buffer.from(payload, 'base64');
  const iv = data.subarray(0, IV_BYTES);
  const tag = data.subarray(IV_BYTES, IV_BYTES + 16);
  const encrypted = data.subarray(IV_BYTES + 16);
  const decipher = createDecipheriv(ALGORITHM, loadKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
