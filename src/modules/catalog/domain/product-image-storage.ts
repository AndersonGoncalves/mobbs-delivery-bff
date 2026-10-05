export interface IProductImageStorage {
  deleteProductImageIfOwned(imageUrl: string | undefined, restaurantId: string): Promise<void>;
}

/**
 * specs/0099-preserva-imagem-compartilhada-s3-exclusao-produto REQ-1/REQ-2/REQ-3 — só a chave dentro
 * do prefixo do próprio restaurante (`restaurants/<id>/products/`, ver `buildUploadKey`) pode ser
 * apagada do bucket. URLs de outro prefixo (`app-imagens/`, compartilhado entre restaurantes pelo
 * catálogo inicial) ou de outro bucket devolvem `null`.
 */
export function getOwnProductImageKey(imageUrl: string | undefined, restaurantId: string, bucketBaseUrl: string): string | null {
  if (!imageUrl || !imageUrl.startsWith(bucketBaseUrl)) return null;
  const key = imageUrl.slice(bucketBaseUrl.length);
  return key.startsWith(`restaurants/${restaurantId}/products/`) ? key : null;
}
