import { randomUUID } from 'crypto';

export type UploadKind = 'logo' | 'defaultProductImage' | 'product' | 'banner' | 'additionalGroupOption';

/** specs/0036-migracao-imagens-s3 ADR-0036-03 — mesma estrutura de pastas que o Firebase Storage
 * já usava (`mobbs-delivery-web/src/shared/storage.ts`), pra a migração ficar invisível pro
 * resto do sistema (DTOs/telas não mudam). */
export function buildUploadKey(kind: UploadKind, restaurantId: string, filename: string): string {
  const extension = filename.includes('.') ? filename.slice(filename.lastIndexOf('.') + 1) : 'jpg';
  const base = `restaurants/${restaurantId}`;

  switch (kind) {
    case 'logo':
      return `${base}/logo.${extension}`;
    case 'defaultProductImage':
      return `${base}/default-product-image.${extension}`;
    case 'product':
      return `${base}/products/${randomUUID()}.${extension}`;
    case 'banner':
      return `${base}/banners/${randomUUID()}.${extension}`;
    case 'additionalGroupOption':
      return `${base}/additional-group-options/${randomUUID()}.${extension}`;
  }
}
