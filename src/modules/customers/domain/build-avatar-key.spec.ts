import { buildAvatarKey } from './build-avatar-key';

describe('buildAvatarKey', () => {
  it('gera uma chave por cliente, com extensão, nunca reaproveitando a anterior', () => {
    const first = buildAvatarKey('c-1', 'jpg');
    const second = buildAvatarKey('c-1', 'jpg');

    expect(first).toMatch(/^customers\/c-1\/avatar-[0-9a-f-]{36}\.jpg$/);
    expect(second).not.toBe(first);
  });
});
