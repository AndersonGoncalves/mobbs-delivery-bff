import { getOwnProductImageKey } from './product-image-storage';

const BUCKET_BASE = 'https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/';

describe('getOwnProductImageKey (specs/0099)', () => {
  it('AC-1: devolve a chave quando a foto está no prefixo de produtos do próprio restaurante', () => {
    expect(getOwnProductImageKey(`${BUCKET_BASE}restaurants/r-1/products/abc.jpg`, 'r-1', BUCKET_BASE)).toBe(
      'restaurants/r-1/products/abc.jpg',
    );
  });

  it('AC-2: ignora imagem do catálogo padrão compartilhado (app-imagens/)', () => {
    expect(getOwnProductImageKey(`${BUCKET_BASE}app-imagens/coca-cola-1l.jpeg`, 'r-1', BUCKET_BASE)).toBeNull();
  });

  it('AC-2: ignora imagem de outro restaurante, mesmo dentro do bucket', () => {
    expect(getOwnProductImageKey(`${BUCKET_BASE}restaurants/r-OUTRO/products/abc.jpg`, 'r-1', BUCKET_BASE)).toBeNull();
  });

  it('AC-2: ignora foto de banner/logo do próprio restaurante (fora do prefixo de produtos)', () => {
    expect(getOwnProductImageKey(`${BUCKET_BASE}restaurants/r-1/banners/abc.jpg`, 'r-1', BUCKET_BASE)).toBeNull();
  });

  it('AC-2: ignora URL de outro bucket/host, mesmo que o caminho pareça do restaurante', () => {
    expect(getOwnProductImageKey('https://outro-bucket.s3.us-east-1.amazonaws.com/restaurants/r-1/products/abc.jpg', 'r-1', BUCKET_BASE)).toBeNull();
  });

  it('AC-3: sem imagem (undefined ou vazia) devolve null', () => {
    expect(getOwnProductImageKey(undefined, 'r-1', BUCKET_BASE)).toBeNull();
    expect(getOwnProductImageKey('', 'r-1', BUCKET_BASE)).toBeNull();
  });
});
