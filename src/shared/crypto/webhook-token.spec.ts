import { isValidWebhookToken } from './webhook-token';

describe('isValidWebhookToken (achado de auditoria pré-produção, 01/11/2026)', () => {
  it('token igual ao esperado é válido', () => {
    expect(isValidWebhookToken('token-secreto-123', 'token-secreto-123')).toBe(true);
  });

  it('token diferente (mesmo tamanho) é inválido', () => {
    expect(isValidWebhookToken('token-secreto-124', 'token-secreto-123')).toBe(false);
  });

  it('token com tamanho diferente do esperado é inválido, sem lançar (timingSafeEqual exigiria tamanhos iguais)', () => {
    expect(isValidWebhookToken('curto', 'token-secreto-123')).toBe(false);
  });

  it('sem token recebido é inválido', () => {
    expect(isValidWebhookToken(undefined, 'token-secreto-123')).toBe(false);
  });

  it('sem token esperado configurado é inválido (nunca libera acesso por um restaurante sem webhookToken)', () => {
    expect(isValidWebhookToken('qualquer-coisa', undefined)).toBe(false);
  });

  it('dois undefined é inválido', () => {
    expect(isValidWebhookToken(undefined, undefined)).toBe(false);
  });
});
