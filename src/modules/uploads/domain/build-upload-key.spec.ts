import { buildUploadKey } from './build-upload-key';

describe('buildUploadKey', () => {
  it('logo: caminho fixo, sem UUID', () => {
    expect(buildUploadKey('logo', 'r-1', 'foto.png')).toBe('restaurants/r-1/logo.png');
  });

  it('defaultProductImage: caminho fixo, sem UUID', () => {
    expect(buildUploadKey('defaultProductImage', 'r-1', 'foto.jpg')).toBe('restaurants/r-1/default-product-image.jpg');
  });

  it('product: gera um UUID por chamada, dentro da pasta products/', () => {
    const key = buildUploadKey('product', 'r-1', 'foto.png');
    expect(key).toMatch(/^restaurants\/r-1\/products\/[0-9a-f-]{36}\.png$/);
  });

  it('banner: gera um UUID por chamada, dentro da pasta banners/', () => {
    const key = buildUploadKey('banner', 'r-1', 'foto.png');
    expect(key).toMatch(/^restaurants\/r-1\/banners\/[0-9a-f-]{36}\.png$/);
  });

  it('additionalGroupOption: gera um UUID por chamada, dentro da pasta additional-group-options/', () => {
    const key = buildUploadKey('additionalGroupOption', 'r-1', 'foto.png');
    expect(key).toMatch(/^restaurants\/r-1\/additional-group-options\/[0-9a-f-]{36}\.png$/);
  });

  it('sem extensão no filename, usa "jpg" como fallback', () => {
    expect(buildUploadKey('logo', 'r-1', 'foto-sem-extensao')).toBe('restaurants/r-1/logo.jpg');
  });

  it('duas chamadas pro mesmo kind "product" geram UUIDs diferentes (sem colisão)', () => {
    const key1 = buildUploadKey('product', 'r-1', 'a.png');
    const key2 = buildUploadKey('product', 'r-1', 'a.png');
    expect(key1).not.toBe(key2);
  });
});
