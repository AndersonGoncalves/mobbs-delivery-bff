import { decryptField, encryptField } from './field-encryption';

const ORIGINAL_KEY = process.env.PIX_KEY_ENCRYPTION_KEY;

describe('field-encryption (specs/0112 REQ-9)', () => {
  beforeEach(() => {
    process.env.PIX_KEY_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  afterAll(() => {
    process.env.PIX_KEY_ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  it('criptografa e descriptografa de volta o mesmo valor, sem gravar o texto em claro', () => {
    const encrypted = encryptField('12345678909');

    expect(encrypted).not.toContain('12345678909');
    expect(decryptField(encrypted)).toBe('12345678909');
  });

  it('cada criptografia usa um IV novo (mesmo valor, cifras diferentes)', () => {
    expect(encryptField('a@b.com')).not.toBe(encryptField('a@b.com'));
  });

  it('sem PIX_KEY_ENCRYPTION_KEY, falha em vez de gravar em claro', () => {
    delete process.env.PIX_KEY_ENCRYPTION_KEY;

    expect(() => encryptField('x')).toThrow('PIX_KEY_ENCRYPTION_KEY não configurada');
  });

  it('chave com tamanho errado é recusada', () => {
    process.env.PIX_KEY_ENCRYPTION_KEY = Buffer.alloc(16).toString('base64');

    expect(() => encryptField('x')).toThrow('32 bytes');
  });
});
