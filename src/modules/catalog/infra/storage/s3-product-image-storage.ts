import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { getOwnProductImageKey, IProductImageStorage } from '../../domain/product-image-storage';

export class S3ProductImageStorage implements IProductImageStorage {
  private readonly bucketBaseUrl: string;

  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    region: string,
  ) {
    this.bucketBaseUrl = `https://${bucket}.s3.${region}.amazonaws.com/`;
  }

  async deleteProductImageIfOwned(imageUrl: string | undefined, restaurantId: string): Promise<void> {
    const key = getOwnProductImageKey(imageUrl, restaurantId, this.bucketBaseUrl);
    if (!key) return;
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
