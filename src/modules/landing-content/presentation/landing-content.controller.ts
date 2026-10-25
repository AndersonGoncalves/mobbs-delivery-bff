import { randomUUID } from 'crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Request, Response, Server } from 'restify';
import { NotFoundError, TooManyRequestsError } from 'restify-errors';
import { environment } from '../../../shared/config/environment';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { parseBody } from '../../../shared/http/validate';
import { BaseRouter } from '../../../shared/router/base.router';
import { s3Client } from '../../../shared/storage/s3-client';
import type { ILandingContentRepository, ILandingTestimonialRepository, LandingContent } from '../domain/landing-content';
import {
  landingContentSchema,
  listTestimonialsSchema,
  presignLandingUploadSchema,
  submitTestimonialSchema,
  testimonialIdSchema,
  updateTestimonialSchema,
} from './landing-content.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

const SUBMISSIONS_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;
const PUBLIC_TESTIMONIALS_LIMIT = 30;

function buildLandingUploadKey(filename: string): string {
  const raw = filename.includes('.') ? filename.slice(filename.lastIndexOf('.') + 1).toLowerCase() : '';
  const extension = /^[a-z0-9]{1,5}$/.test(raw) ? raw : 'jpg';
  return `platform/landing/${randomUUID()}.${extension}`;
}

/** specs/0183-conteudo-pagina-inicial — conteúdo público da home e moderação de depoimentos. */
export class LandingContentController extends BaseRouter {
  private readonly submissions = new Map<string, number[]>();

  constructor(
    private readonly contentRepository: ILandingContentRepository,
    private readonly testimonialRepository: ILandingTestimonialRepository,
    private readonly platformAdminMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const adminAuthenticated = [firebaseAuthMiddleware, this.platformAdminMiddleware];

    application.get('/landing/public', async (_req: Request, res: Response) => {
      const [content, approved] = await Promise.all([
        this.contentRepository.get(),
        this.testimonialRepository.list('approved'),
      ]);
      const testimonials = approved
        .slice(0, PUBLIC_TESTIMONIALS_LIMIT)
        .map(({ id, authorName, businessName, city, text, rating }) => ({
          id, authorName, businessName, city, text, ...(rating ? { rating } : {}),
        }));
      res.json(200, { ...content, testimonials });
    });

    application.post('/landing/testimonials', async (req: Request, res: Response) => {
      this.assertWithinRateLimit(req);
      const { website, ...payload } = parseBody(submitTestimonialSchema, req.body);
      if (!website) await this.testimonialRepository.create(payload);
      res.json(201, { received: true });
    });

    application.get('/platform/landing-content', ...adminAuthenticated, async (_req: Request, res: Response) => {
      res.json(200, await this.contentRepository.get());
    });

    application.put('/platform/landing-content', ...adminAuthenticated, async (req: Request, res: Response) => {
      const parsed = parseBody(landingContentSchema, req.body);
      const content: LandingContent = {
        features: parsed.features.map((item) => ({ ...item, id: item.id ?? randomUUID() })),
        howItWorks: parsed.howItWorks.map((item) => ({ ...item, id: item.id ?? randomUUID() })),
        clients: parsed.clients.map((item) => ({ ...item, id: item.id ?? randomUUID() })),
        company: parsed.company,
        settings: parsed.settings ?? (await this.contentRepository.get()).settings,
      };
      res.json(200, await this.contentRepository.update(content));
    });

    application.post('/platform/landing-content/uploads/presign', ...adminAuthenticated, async (req: Request, res: Response) => {
      const { filename } = parseBody(presignLandingUploadSchema, req.body);
      const key = buildLandingUploadKey(filename);
      const uploadUrl = await getSignedUrl(
        s3Client,
        new PutObjectCommand({ Bucket: environment.s3.bucket, Key: key }),
        { expiresIn: 300 },
      );
      const publicUrl = `https://${environment.s3.bucket}.s3.${environment.s3.region}.amazonaws.com/${key}`;
      res.json(200, { uploadUrl, publicUrl });
    });

    application.get('/platform/landing-testimonials', ...adminAuthenticated, async (req: Request, res: Response) => {
      const { status } = parseBody(listTestimonialsSchema, req.query);
      res.json(200, await this.testimonialRepository.list(status));
    });

    application.patch('/platform/landing-testimonials/:id', ...adminAuthenticated, async (req: Request, res: Response) => {
      const id = parseBody(testimonialIdSchema, req.params.id);
      const { status } = parseBody(updateTestimonialSchema, req.body);
      const updated = await this.testimonialRepository.updateStatus(id, status);
      if (!updated) throw new NotFoundError('Depoimento não encontrado');
      res.json(200, updated);
    });

    application.del('/platform/landing-testimonials/:id', ...adminAuthenticated, async (req: Request, res: Response) => {
      const id = parseBody(testimonialIdSchema, req.params.id);
      if (!(await this.testimonialRepository.delete(id))) throw new NotFoundError('Depoimento não encontrado');
      res.send(204);
    });
  }

  // Em memória: suficiente contra envio em massa por um mesmo IP; a moderação cobre o resto.
  private assertWithinRateLimit(req: Request): void {
    const forwarded = req.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    const ip = first || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const recent = (this.submissions.get(ip) ?? []).filter((time) => now - time < HOUR_MS);
    if (recent.length >= SUBMISSIONS_PER_HOUR) {
      throw new TooManyRequestsError('Muitos envios. Tente novamente mais tarde.');
    }
    this.submissions.set(ip, [...recent, now]);
  }
}
