import { appImageUrl } from './default-image-url';
import { DEFAULT_CATALOGS_BY_BUSINESS_TYPE } from './default-catalogs-by-business-type';
import { DEFAULT_RAW_MATERIALS } from './default-raw-materials';

// specs/0215-ambiente-homologacao T022 — fotos padrão saem do bucket configurado, não fixas no de
// produção.
describe('appImageUrl (specs/0215 T022)', () => {
  it('monta o endereço a partir do bucket e da região informados', () => {
    expect(appImageUrl('ovo.jpeg', { bucket: 'mobbs-delivery-images-hml', region: 'us-east-1' }))
      .toBe('https://mobbs-delivery-images-hml.s3.us-east-1.amazonaws.com/app-imagens/ovo.jpeg');
  });

  it('com a configuração de produção, o endereço é o mesmo de antes (sem mudança em produção)', () => {
    expect(appImageUrl('ovo.jpeg', { bucket: 'mobbs-delivery-images', region: 'us-east-1' }))
      .toBe('https://mobbs-delivery-images.s3.us-east-1.amazonaws.com/app-imagens/ovo.jpeg');
  });

  it('todas as fotos do catálogo padrão e das matérias-primas usam o bucket configurado', () => {
    const urls = [
      ...Object.values(DEFAULT_CATALOGS_BY_BUSINESS_TYPE).flatMap((catalog) => [
        ...catalog.categories.flatMap((category) => category.products.map((product) => product.imageUrl)),
        ...(catalog.additionalGroupTemplates ?? []).flatMap((template) => template.options.map((option) => option.imageUrl)),
      ]),
      ...DEFAULT_RAW_MATERIALS.map((material) => material.imageUrl),
    ].filter((url): url is string => Boolean(url));

    expect(urls.length).toBeGreaterThan(0);
    const base = appImageUrl('');
    for (const url of urls) expect(url.startsWith(base)).toBe(true);
  });
});
