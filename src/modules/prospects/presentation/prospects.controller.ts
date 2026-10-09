import type { Request, Response, Server } from 'restify';
import { InternalServerError } from 'restify-errors';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { environment } from '../../../shared/config/environment';
import { s3Client } from '../../../shared/storage/s3-client';
import { buildPlatformUploadKey } from '../domain/build-platform-upload-key';
import { findProspectCategory } from '../domain/prospect-categories';
import { IProspectRepository } from '../domain/repositories/prospect.repository.interface';
import { IPlacesSearchService } from '../domain/services/i-places-search.service';
import { IProspectOutreachService } from '../domain/services/i-prospect-outreach.service';
import {
  contactAdHocSchema,
  contactProspectsSchema,
  listProspectsQuerySchema,
  presignPlatformUploadSchema,
  saveProspectsSchema,
  searchProspectsQuerySchema,
} from './prospects.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0123-prospeccao-restaurantes-google-maps / specs/0124-campanha-whatsapp-prospects —
 * painel da plataforma, protegido por `platformAdminMiddleware` (REQ-1, mesmo padrão de
 * `PlatformController`). Rotas sob `/platform/prospects*`, nunca `/restaurants/me/*` — não é um
 * recurso de restaurante cliente.
 */
export class ProspectsController extends BaseRouter {
  constructor(
    private readonly placesSearchService: IPlacesSearchService,
    private readonly prospectRepository: IProspectRepository,
    private readonly platformAdminMiddleware: AsyncHandler,
    private readonly prospectOutreachService: IProspectOutreachService,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const adminAuthenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.platformAdminMiddleware];

    // REQ-5 — busca na Google Places API; não salva nada ainda (salvar é REQ-6, rota própria).
    application.get('/platform/prospects/search', ...adminAuthenticated, async (req: Request, res: Response) => {
      const query = parseBody(searchProspectsQuerySchema, req.query);
      const category = findProspectCategory(query.category)!; // já validado pelo enum do schema
      try {
        const results = await this.placesSearchService.searchNearby({
          latitude: query.latitude,
          longitude: query.longitude,
          radiusMeters: query.radiusMeters,
          placesType: category.placesType,
        });
        res.json(200, results);
      } catch (error) {
        // REQ-8 — chave ausente ou falha da API da Google: aviso claro, nunca derruba o painel.
        throw new InternalServerError(error instanceof Error ? error.message : 'Falha ao buscar na Google Places API');
      }
    });

    // REQ-6/REQ-9 — salva os selecionados; ignora (não duplica) quem já existe por placeId.
    application.post('/platform/prospects', ...adminAuthenticated, async (req: Request, res: Response) => {
      const { items } = parseBody(saveProspectsSchema, req.body);
      const saved = [];
      for (const item of items) {
        const existing = await this.prospectRepository.findByPlaceId(item.placeId);
        saved.push(existing ?? (await this.prospectRepository.create(item)));
      }
      res.json(201, saved);
    });

    // REQ-7 — lista os já salvos, opcionalmente filtrados por ramo.
    application.get('/platform/prospects', ...adminAuthenticated, async (req: Request, res: Response) => {
      const { category } = parseBody(listProspectsQuerySchema, req.query);
      const prospects = await this.prospectRepository.listAll(category);
      res.json(200, prospects);
    });

    // specs/0124 REQ-6/REQ-7/REQ-8/REQ-9 — envia pros prospects selecionados; devolve o
    // resultado por prospect (a tela usa isto pra marcar o ✓ sem precisar recarregar a lista).
    application.post('/platform/prospects/contact', ...adminAuthenticated, async (req: Request, res: Response) => {
      const { prospectIds, message, imageUrl } = parseBody(contactProspectsSchema, req.body);
      const results = await this.prospectOutreachService.contactProspects(prospectIds, message, imageUrl);
      res.json(200, { results });
    });

    // specs/0124 REQ-11/REQ-11.1 — número avulso, fora da lista de prospects; nunca cria/atualiza
    // nenhum registro.
    application.post('/platform/prospects/contact-adhoc', ...adminAuthenticated, async (req: Request, res: Response) => {
      const { phone, message, imageUrl } = parseBody(contactAdHocSchema, req.body);
      try {
        await this.prospectOutreachService.contactAdHoc(phone, message, imageUrl);
        res.json(200, { success: true });
      } catch (error) {
        throw new InternalServerError(error instanceof Error ? error.message : 'Falha ao enviar mensagem');
      }
    });

    // specs/0124 REQ-3 — mesmo padrão de presign de `UploadsController`, mas sem `restaurantId`
    // (imagem da mensagem de abordagem não pertence a nenhum restaurante).
    application.post('/platform/prospects/uploads/presign', ...adminAuthenticated, async (req: Request, res: Response) => {
      const { filename } = parseBody(presignPlatformUploadSchema, req.body);
      const key = buildPlatformUploadKey(filename);

      const uploadUrl = await getSignedUrl(
        s3Client,
        new PutObjectCommand({ Bucket: environment.s3.bucket, Key: key }),
        { expiresIn: 300 },
      );
      const publicUrl = `https://${environment.s3.bucket}.s3.${environment.s3.region}.amazonaws.com/${key}`;

      res.json(200, { uploadUrl, publicUrl });
    });
  }
}
