import { avatarKeyFromPublicUrl, buildAvatarKey, isOwnAvatarKey } from './build-avatar-key';

describe('buildAvatarKey', () => {
  it('gera uma chave por cliente, com extensão, nunca reaproveitando a anterior', () => {
    const first = buildAvatarKey('c-1', 'jpg');
    const second = buildAvatarKey('c-1', 'jpg');

    expect(first).toMatch(/^customers\/c-1\/avatar-[0-9a-f-]{36}\.jpg$/);
    expect(second).not.toBe(first);
  });
});

describe('avatarKeyFromPublicUrl', () => {
  const bucket = 'mobbs-delivery-images';
  const region = 'sa-east-1';

  it('devolve a chave quando a URL é do nosso bucket', () => {
    const url = `https://${bucket}.s3.${region}.amazonaws.com/customers/c-1/avatar-abc.jpg`;
    expect(avatarKeyFromPublicUrl(url, bucket, region)).toBe('customers/c-1/avatar-abc.jpg');
  });

  it('devolve null para foto de outra origem (ex.: Google) ou sem foto', () => {
    expect(avatarKeyFromPublicUrl('https://lh3.googleusercontent.com/a/abc=s96-c', bucket, region)).toBeNull();
    expect(avatarKeyFromPublicUrl(undefined, bucket, region)).toBeNull();
  });

  it('devolve null para URL malformada', () => {
    expect(avatarKeyFromPublicUrl('não é uma url', bucket, region)).toBeNull();
  });
});

describe('isOwnAvatarKey', () => {
  it('aceita só avatar da própria pasta do cliente', () => {
    expect(isOwnAvatarKey('customers/c-1/avatar-abc.jpg', 'c-1')).toBe(true);
    expect(isOwnAvatarKey('customers/c-2/avatar-abc.jpg', 'c-1')).toBe(false);
    expect(isOwnAvatarKey('customers/c-1/outro-arquivo.jpg', 'c-1')).toBe(false);
  });
});
