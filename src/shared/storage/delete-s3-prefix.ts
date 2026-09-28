import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

/**
 * specs/0040-reset-restaurante-teste — apaga todo objeto sob um prefixo (`restaurants/<id>/`),
 * paginando `ListObjectsV2` (1000 chaves por página, o máximo da API) e apagando em lotes de até
 * 1000 via `DeleteObjectsCommand` (o máximo por chamada). Sem objeto nenhum sob o prefixo, não
 * lança — devolve `0` (mesmo raciocínio de "idempotente" do resto do script: restaurante sem
 * imagem nenhuma enviada é um estado válido, não um erro).
 */
export async function deleteS3Prefix(client: S3Client, bucket: string, prefix: string): Promise<number> {
  let deletedCount = 0;
  let continuationToken: string | undefined;

  do {
    const listed = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: continuationToken }),
    );
    const keys = (listed.Contents ?? []).map((object) => object.Key).filter((key): key is string => !!key);

    if (keys.length > 0) {
      await client.send(
        new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }),
      );
      deletedCount += keys.length;
    }

    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);

  return deletedCount;
}
