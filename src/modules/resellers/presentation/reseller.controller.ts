import type { Request, Response, Server } from 'restify';
import { ConflictError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { parseBody } from '../../../shared/http/validate';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IResellerRepository } from '../domain/repositories/reseller.repository.interface';
import { IResellerProspectRepository } from '../domain/repositories/reseller-prospect.repository.interface';
import { IResellerClientRepository } from '../domain/repositories/reseller-client.repository.interface';
import { IResellerCommissionRepository } from '../domain/repositories/reseller-commission.repository.interface';
import { generateUniqueResellerCode } from '../domain/generate-reseller-code';
import { convertProspectSchema, resellerProspectInputSchema, resellerSignupSchema, updateResellerPixKeySchema } from './resellers.schemas';
import { buildCommissionsSummary } from './build-commissions-summary';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

const REFERRAL_LINK_BASE = 'https://bsdelivery.com.br/gratis?revenda=';
const CONVERTIBLE_RESTAURANTS_LIMIT = 20;

/**
 * specs/0189-painel-revenda — painel do revendedor logado (`revenda.bsdelivery.com.br`). Todas as
 * rotas isolam por `req.resellerId` (nunca por parâmetro de rota) — mesmo padrão multi-tenant de
 * `/restaurants/me/...`.
 */
export class ResellerController extends BaseRouter {
  constructor(
    private readonly resellerRepository: IResellerRepository,
    private readonly prospectRepository: IResellerProspectRepository,
    private readonly clientRepository: IResellerClientRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly commissionRepository: IResellerCommissionRepository,
    private readonly resellerMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const authenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.resellerMiddleware];

    // Ajuste explícito do usuário (02/11/2026) — achado real: o único jeito de virar revendedor
    // era o administrador cadastrar nome/e-mail em /platform/resellers (REQ-2, inalterado) e o
    // revendedor "reclamar" a senha depois em `/criar-acesso` (REQ-19) — mas quem se cadastra
    // pelo botão público da home (`/revenda/cadastro`) quer informar a própria senha na hora, sem
    // essa volta. Só `firebaseAuthMiddleware` aqui (não `resellerMiddleware`, que exige um
    // `Reseller` já existente — contraditório pra quem está se cadastrando agora): o front chama
    // `signUpWithEmail` primeiro (cria a conta Firebase), só então esta rota, autenticado — e-mail
    // sempre de `req.user.email`, nunca do corpo (ninguém cria um Reseller pra e-mail alheio). Fica
    // ativo na hora (ganha link de indicação, pode indicar restaurantes já no primeiro acesso) —
    // mesmo padrão sem aprovação manual do cadastro grátis de restaurante (`/gratis`).
    application.post('/reseller/signup', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const input = parseBody(resellerSignupSchema, req.body);
      const email = req.user!.email!;
      const existing = await this.resellerRepository.findByEmail(email);
      if (existing) {
        throw new ConflictError('Este e-mail já está cadastrado como revendedor — entre normalmente em vez de se cadastrar de novo.');
      }
      const code = await generateUniqueResellerCode(this.resellerRepository);
      // REQ-17 — zod já garantiu contractAccepted === true (REQ-18); a data do aceite é gravada
      // aqui, no momento exato em que o cadastro é efetivado.
      const reseller = await this.resellerRepository.create({
        name: input.name, email, phone: input.phone, code, contractAcceptedAt: new Date(),
      });
      res.json(201, { ...reseller, referralLink: `${REFERRAL_LINK_BASE}${reseller.code}` });
    });

    // REQ-9 — dados do revendedor + link de indicação pronto.
    application.get('/reseller/me', ...authenticated, async (req: Request, res: Response) => {
      const reseller = await this.resellerRepository.findById(req.resellerId!);
      if (!reseller) throw new NotFoundError('Revendedor não encontrado');
      res.json(200, { ...reseller, referralLink: `${REFERRAL_LINK_BASE}${reseller.code}` });
    });

    // Pedido explícito do usuário (follow-up) — dados bancários (chave Pix) autoatendidos, sem
    // precisar chamar o financeiro no WhatsApp pra cadastrar.
    application.patch('/reseller/me/bank-data', ...authenticated, async (req: Request, res: Response) => {
      const { pixKey } = parseBody(updateResellerPixKeySchema, req.body);
      const updated = await this.resellerRepository.updatePixKey(req.resellerId!, pixKey);
      if (!updated) throw new NotFoundError('Revendedor não encontrado');
      res.json(200, { ...updated, referralLink: `${REFERRAL_LINK_BASE}${updated.code}` });
    });

    // REQ-5.
    application.get('/reseller/me/prospects', ...authenticated, async (req: Request, res: Response) => {
      const prospects = await this.prospectRepository.listByReseller(req.resellerId!);
      res.json(200, prospects);
    });

    // REQ-6.
    application.post('/reseller/me/prospects', ...authenticated, async (req: Request, res: Response) => {
      const input = parseBody(resellerProspectInputSchema, req.body);
      const prospect = await this.prospectRepository.create({ resellerId: req.resellerId!, ...input });
      res.json(201, prospect);
    });

    // plan.md decisão 2 — só enquanto `em_prospeccao`.
    application.patch('/reseller/me/prospects/:id', ...authenticated, async (req: Request, res: Response) => {
      const input = parseBody(resellerProspectInputSchema, req.body);
      const updated = await this.prospectRepository.update(req.params.id, req.resellerId!, input);
      if (!updated) throw new NotFoundError('Prospect não encontrado, ou já convertido (não pode mais ser editado)');
      res.json(200, updated);
    });

    application.del('/reseller/me/prospects/:id', ...authenticated, async (req: Request, res: Response) => {
      const deleted = await this.prospectRepository.delete(req.params.id, req.resellerId!);
      if (!deleted) throw new NotFoundError('Prospect não encontrado, ou já convertido (não pode mais ser excluído)');
      res.send(204);
    });

    // REQ-7 — clientes efetivados, com o nome do restaurante resolvido.
    application.get('/reseller/me/clients', ...authenticated, async (req: Request, res: Response) => {
      const clients = await this.clientRepository.listByReseller(req.resellerId!);
      const restaurants = await Promise.all(clients.map((client) => this.restaurantRepository.findById(client.restaurantId)));
      res.json(200, clients.map((client, index) => ({
        id: client.id,
        restaurantId: client.restaurantId,
        restaurantName: restaurants[index]?.name ?? null,
        origin: client.origin,
        createdAt: client.createdAt,
      })));
    });

    // specs/0205-comissao-revendedor REQ-12 — comissões do revendedor logado + totais.
    application.get('/reseller/me/commissions', ...authenticated, async (req: Request, res: Response) => {
      res.json(200, await buildCommissionsSummary(req.resellerId!, this.commissionRepository, this.restaurantRepository));
    });

    // REQ-8 — restaurantes ainda sem revendedor, pra escolher na conversão manual.
    application.get('/reseller/me/convertible-restaurants', ...authenticated, async (req: Request, res: Response) => {
      const search = typeof req.query?.search === 'string' ? req.query.search.trim().toLowerCase() : '';
      const [all, claimedIds] = await Promise.all([
        this.restaurantRepository.listAll(),
        this.clientRepository.listClaimedRestaurantIds(),
      ]);
      const available = all
        .filter((restaurant) => !claimedIds.has(restaurant.id))
        .filter((restaurant) => !search || restaurant.name.toLowerCase().includes(search))
        .slice(0, CONVERTIBLE_RESTAURANTS_LIMIT);
      res.json(200, available.map((restaurant) => ({ id: restaurant.id, name: restaurant.name })));
    });

    // REQ-8 — marca o prospect como convertido e cria o vínculo de cliente efetivado (origem
    // `manual`); 409 se o restaurante escolhido já tiver outro revendedor (plan.md decisão 3).
    application.patch('/reseller/me/prospects/:id/convert', ...authenticated, async (req: Request, res: Response) => {
      const { restaurantId } = parseBody(convertProspectSchema, req.body);
      const restaurant = await this.restaurantRepository.findById(restaurantId);
      if (!restaurant) throw new NotFoundError('Restaurante não encontrado');

      const existingClient = await this.clientRepository.findByRestaurantId(restaurantId);
      if (existingClient) {
        throw existingClient.resellerId === req.resellerId!
          ? new ConflictError('Este restaurante já é cliente efetivado seu')
          : new ConflictError('Este restaurante já é cliente efetivado de outro revendedor');
      }

      const prospect = await this.prospectRepository.markConverted(req.params.id, req.resellerId!, restaurantId);
      if (!prospect) throw new NotFoundError('Prospect não encontrado, ou já convertido');

      const client = await this.clientRepository.create({ resellerId: req.resellerId!, restaurantId, origin: 'manual' });
      res.json(200, { prospect, client });
    });
  }
}
