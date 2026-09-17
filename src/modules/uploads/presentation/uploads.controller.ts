import type { Request, Response, Server } from 'restify';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { environment } from '../../../shared/config/environment';
import { s3Client } from '../../../shared/storage/s3-client';
import { buildUploadKey } from '../domain/build-upload-key';
import { presignUploadSchema } from './uploads.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0036-migracao-imagens-s3 — o BFF nunca vê o arquivo em si, só assina a URL de upload
 * (REQ-1/REQ-2); `restaurantId` sempre de `req.restaurantId` (sessão), nunca do corpo, mesmo
 * padrão de segurança das outras rotas `/restaurants/me/*`. `ContentType` de propósito **fora**
 * do `PutObjectCommand` assinado — se entrasse, o `PUT` real precisaria mandar exatamente o
 * mesmo header assinado aqui (o BFF não sabe o `file.type` de verdade, só o `filename`), e
 * qualquer descompasso quebraria a assinatura (`SignatureDoesNotMatch`). Sem `ContentType`
 * assinado, o navegador manda o header livremente no PUT e o S3 grava o que vier, sem validar
 * contra a assinatura.
 */
export class UploadsController extends BaseRouter {
  constructor(private readonly restaurantOperatorMiddleware: AsyncHandler) {
    super();
  }

  initializeRoutes(application: Server): void {
    const authenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.restaurantOperatorMiddleware];

    application.post(
      '/restaurants/me/uploads/presign',
      ...authenticated,
      async (req: Request, res: Response) => {
        const { kind, filename } = parseBody(presignUploadSchema, req.body);
        const key = buildUploadKey(kind, req.restaurantId!, filename);

        const uploadUrl = await getSignedUrl(
          s3Client,
          new PutObjectCommand({ Bucket: environment.s3.bucket, Key: key }),
          { expiresIn: 300 },
        );
        const publicUrl = `https://${environment.s3.bucket}.s3.${environment.s3.region}.amazonaws.com/${key}`;

        res.json(200, { uploadUrl, publicUrl });
      },
    );
  }
}
