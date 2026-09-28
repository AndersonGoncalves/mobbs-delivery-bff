import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

import { deleteS3Prefix } from './delete-s3-prefix';

describe('deleteS3Prefix (specs/0040)', () => {
  function buildClient() {
    return { send: jest.fn() as jest.Mock } as unknown as S3Client & { send: jest.Mock };
  }

  it('sem objeto nenhum sob o prefixo, não lança e devolve 0 (idempotente)', async () => {
    const client = buildClient();
    client.send.mockResolvedValueOnce({ Contents: [], IsTruncated: false });

    const deleted = await deleteS3Prefix(client, 'bucket', 'restaurants/r-1/');

    expect(deleted).toBe(0);
    expect(client.send).toHaveBeenCalledTimes(1);
    expect(client.send.mock.calls[0][0]).toBeInstanceOf(ListObjectsV2Command);
  });

  it('apaga todas as chaves de uma única página', async () => {
    const client = buildClient();
    client.send.mockResolvedValueOnce({
      Contents: [{ Key: 'restaurants/r-1/logo.jpg' }, { Key: 'restaurants/r-1/products/abc.jpg' }],
      IsTruncated: false,
    });
    client.send.mockResolvedValueOnce({});

    const deleted = await deleteS3Prefix(client, 'bucket', 'restaurants/r-1/');

    expect(deleted).toBe(2);
    const deleteCall = client.send.mock.calls[1][0] as DeleteObjectsCommand;
    expect(deleteCall).toBeInstanceOf(DeleteObjectsCommand);
    expect(deleteCall.input.Delete?.Objects).toEqual([{ Key: 'restaurants/r-1/logo.jpg' }, { Key: 'restaurants/r-1/products/abc.jpg' }]);
  });

  it('pagina quando há mais de 1000 chaves (IsTruncated) e soma o total das duas páginas', async () => {
    const client = buildClient();
    client.send
      .mockResolvedValueOnce({ Contents: [{ Key: 'a' }], IsTruncated: true, NextContinuationToken: 'tok-2' })
      .mockResolvedValueOnce({}) // delete da 1ª página
      .mockResolvedValueOnce({ Contents: [{ Key: 'b' }, { Key: 'c' }], IsTruncated: false })
      .mockResolvedValueOnce({}); // delete da 2ª página

    const deleted = await deleteS3Prefix(client, 'bucket', 'restaurants/r-1/');

    expect(deleted).toBe(3);
    expect(client.send).toHaveBeenCalledTimes(4);
    const secondList = client.send.mock.calls[2][0] as ListObjectsV2Command;
    expect(secondList.input.ContinuationToken).toBe('tok-2');
  });

  it('objeto sem Key (defensivo, a API não deveria devolver isso) é ignorado, não quebra o delete', async () => {
    const client = buildClient();
    client.send.mockResolvedValueOnce({ Contents: [{ Key: 'a' }, {}], IsTruncated: false });
    client.send.mockResolvedValueOnce({});

    const deleted = await deleteS3Prefix(client, 'bucket', 'restaurants/r-1/');

    expect(deleted).toBe(1);
  });
});
