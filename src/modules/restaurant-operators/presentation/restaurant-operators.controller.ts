import type { Request, Response, Server } from 'restify';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole, requireOwnerRole } from '../../../shared/http/require-operator-role.middleware';
import { IEmailService } from '../../../shared/email/i-email-service';
import { IRestaurantOperatorRepository } from '../domain/repositories/restaurant-operator.repository.interface';
import {
  addOperatorSchema,
  updateOperatorFullAccessSchema,
  updateOperatorProfileSchema,
  updateOperatorRoleSchema,
} from '../../restaurants/presentation/restaurants.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0010-configuracao-restaurante REQ-12/REQ-13 — gestão da allowlist de e-mails com acesso à
 * retaguarda do próprio restaurante (nunca de outro, `restaurantId` sempre do token via
 * `restaurantOperatorMiddleware`, nunca de parâmetro de rota).
 *
 * Dono e gerente podem administrar operadores, mas só o dono concede acesso total. A titularidade
 * não pode ser removida, e gerente não pode alterar o papel do dono ou promover outro operador.
 */
export class RestaurantOperatorsController extends BaseRouter {
  constructor(
    private readonly operatorRepository: IRestaurantOperatorRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
    // Pedido explícito do usuário (follow-up) — e-mail de aviso de novo login.
    private readonly emailService: IEmailService,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const authenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.restaurantOperatorMiddleware];
    const ownerAuthenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOwnerRole(),
    ];
    const operatorManagementAuthenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
    ];

    // specs/0021-papeis-operador T010 — qualquer operador logado sabe o próprio papel (usado
    // pela web pra decidir o que mostrar na navegação, REQ-5 UX — a barreira real continua sendo
    // o 403 de cada rota de módulo).
    application.get('/restaurants/me/operators/me', ...authenticated, async (req: Request, res: Response) => {
      const operator = await this.operatorRepository.findById(req.operatorId!);
      res.json(200, this.render(operator));
    });

    // Pedido explícito do usuário (follow-up) — e-mail de aviso ao operador a cada novo login na
    // retaguarda (web chama logo depois de um `signIn()`/`signInWithEmail()` bem-sucedido,
    // `AuthProvider.tsx`). Fire-and-forget (mesmo padrão de `CustomersController`, specs/0023):
    // a resposta HTTP nunca espera o envio terminar, e falha no SMTP não derruba o login real
    // (o aviso é só informativo, nunca bloqueia acesso).
    application.post(
      '/restaurants/me/operators/me/login-notification',
      ...authenticated,
      async (req: Request, res: Response) => {
        const forwarded = req.headers['x-forwarded-for'];
        const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'desconhecido';
        const userAgent = (Array.isArray(req.headers['user-agent']) ? req.headers['user-agent'][0] : req.headers['user-agent']) || 'desconhecido';
        const email = req.user!.email!;

        void this.emailService
          .send({
            to: email,
            subject: 'Novo login na sua conta mobbs delivery',
            html: [
              `<p>Olá! Segue o registro de um novo login na retaguarda do mobbs delivery.</p>`,
              `<p>E-mail do usuário: ${email}</p>`,
              `<p>Endereço IP: ${ip}</p>`,
              `<p>Dados do navegador: ${userAgent}</p>`,
              `<p>Se não foi você, troque sua senha o quanto antes.</p>`,
            ].join('\n'),
          })
          .catch((error) => {
            console.error(`[email] falha ao enviar aviso de novo login pra ${email}:`, error);
          });
        res.send(204);
      },
    );

    application.get('/restaurants/me/operators', ...operatorManagementAuthenticated, async (req: Request, res: Response) => {
      const operators = await this.operatorRepository.listByRestaurant(req.restaurantId!);
      res.json(200, operators);
    });

    // specs/0137-papeis-garcom-motoboy REQ-6 — seletor de motoboy do pedido (`OrdersController`,
    // `ActiveOrdersPanel` na web) precisa listar operadores `motoboy`, mas quem usa esse seletor é
    // `dono`/`gerente` (não só `dono`, como a listagem completa acima) — endpoint dedicado, mais
    // estreito, em vez de abrir `GET /restaurants/me/operators` (que devolve e-mail/papel de TODOS
    // os operadores, inclusive `dono`/`financeiro`) pra `gerente`.
    //
    // (ajuste, pedido explícito do usuário) — `name` agora é `operator.name || operator.email`
    // (antes era sempre o e-mail, campo `name` não existia): mostra o nome de verdade quando
    // cadastrado, sem quebrar quem já consumia este endpoint esperando sempre uma string em
    // `name` (o seletor de motoboy de `ActiveOrdersPanel` continua funcionando sem mudar nada lá).
    // `email` também vai junto, cru, pra quem precisar mostrar os dois juntos (ex. a página
    // "Cadastro de motoboys", agora só leitura, lista operadores `motoboy`).
    // `whatsapp` (ajuste, pedido explícito do usuário) — alimenta o ícone de WhatsApp da mesma
    // página; vem cru (com DDI, igual é salvo pelo BFF em `addOperator`/`updateOperatorProfile`),
    // undefined quando o motoboy não tem WhatsApp cadastrado.
    application.get(
      '/restaurants/me/operators/motoboys',
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente', 'financeiro'),
      async (req: Request, res: Response) => {
        const operators = await this.operatorRepository.listByRestaurant(req.restaurantId!);
        const motoboys = operators
          .filter((operator) => operator.role === 'motoboy' && operator.isActive)
          .map((operator) => ({
            id: operator.id,
            name: operator.name || operator.email,
            email: operator.email,
            whatsapp: operator.whatsapp,
          }));
        res.json(200, motoboys);
      },
    );

    // (ajuste, pedido explícito do usuário) — equivalente ao endpoint de motoboys acima, pra
    // alimentar a página "Cadastro de garçons" (agora só leitura, lista operadores `garcom`).
    application.get(
      '/restaurants/me/operators/waiters',
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente', 'financeiro'),
      async (req: Request, res: Response) => {
        const operators = await this.operatorRepository.listByRestaurant(req.restaurantId!);
        const waiters = operators
          .filter((operator) => operator.role === 'garcom' && operator.isActive)
          .map((operator) => ({ id: operator.id, name: operator.name || operator.email, email: operator.email }));
        res.json(200, waiters);
      },
    );

    application.post('/restaurants/me/operators', ...operatorManagementAuthenticated, async (req: Request, res: Response) => {
      const { email, role, name, whatsapp, photoUrl } = parseBody(addOperatorSchema, req.body);
      if (req.operatorRole === 'gerente' && role === 'dono') {
        throw new ForbiddenError('Gerentes não podem cadastrar operadores com papel de dono');
      }
      // specs/0095-isolamento-cadastro-operadores REQ-1 — um e-mail com vínculo ativo em outro
      // restaurante não pode ser adicionado aqui também (mesma regra do autocadastro, specs/0038).
      const activeElsewhere = await this.operatorRepository.findActiveByEmailInOtherRestaurant(email, req.restaurantId!);
      if (activeElsewhere) {
        throw new ConflictError('Este e-mail já está associado a outro restaurante');
      }
      const operator = await this.operatorRepository.create(req.restaurantId!, email, role, name, whatsapp, photoUrl);
      res.json(201, operator);
    });

    application.del(
      '/restaurants/me/operators/:id',
      ...operatorManagementAuthenticated,
      async (req: Request, res: Response) => {
        const target = await this.operatorRepository.findById(req.params.id);
        if (!target || target.restaurantId !== req.restaurantId) {
          throw new NotFoundError('Operador não encontrado');
        }
        if (target.role === 'dono') {
          throw new ForbiddenError('O operador dono não pode ser removido');
        }
        if (target.isActive) {
          const activeCount = await this.operatorRepository.countActiveByRestaurant(req.restaurantId!);
          // REQ-13: nunca deixar o restaurante sem nenhum operador ativo.
          if (activeCount <= 1) {
            throw new BadRequestError('Não é possível remover o único operador ativo do restaurante');
          }
        }
        await this.operatorRepository.deactivate(target.id);
        res.send(204);
      },
    );

    // specs/0021-papeis-operador REQ-8/REQ-9/T009 — troca de papel de um operador já cadastrado.
    // REQ-9: se `target` é o único `dono` ativo do restaurante e o novo papel não é mais `dono`,
    // bloqueia com 409 (nunca pode restar um restaurante sem nenhum `dono` ativo) — checado por
    // `target`, não só por "é o próprio operador logado", porque a regra é sobre o restaurante
    // nunca ficar sem dono, não sobre quem executa a ação.
    application.patch(
      '/restaurants/me/operators/:id/role',
      ...operatorManagementAuthenticated,
      async (req: Request, res: Response) => {
        const { role } = parseBody(updateOperatorRoleSchema, req.body);
        const target = await this.operatorRepository.findById(req.params.id);
        if (!target || target.restaurantId !== req.restaurantId) {
          throw new NotFoundError('Operador não encontrado');
        }
        if (
          req.operatorRole === 'gerente' &&
          (target.role === 'dono' || role === 'dono')
        ) {
          throw new ForbiddenError('Gerentes não podem alterar o papel de um dono nem promover outro operador a dono');
        }

        if (target.role === 'dono' && role !== 'dono' && target.isActive) {
          const activeOwners = await this.operatorRepository.countActiveByRestaurantAndRole(req.restaurantId!, 'dono');
          if (activeOwners <= 1) {
            throw new ConflictError('Não é possível rebaixar o único dono ativo do restaurante');
          }
        }

        await this.operatorRepository.updateRole(target.id, role);
        const updated = await this.operatorRepository.findById(target.id);
        res.json(200, this.render(updated));
      },
    );

    application.patch(
      '/restaurants/me/operators/:id/full-access',
      ...ownerAuthenticated,
      async (req: Request, res: Response) => {
        const { hasFullAccess } = parseBody(updateOperatorFullAccessSchema, req.body);
        const target = await this.operatorRepository.findById(req.params.id);
        if (!target || target.restaurantId !== req.restaurantId) {
          throw new NotFoundError('Operador não encontrado');
        }
        if (target.role !== 'gerente') {
          throw new BadRequestError('Acesso total só pode ser concedido a um gerente');
        }
        await this.operatorRepository.updateFullAccess(target.id, hasFullAccess);
        const updated = await this.operatorRepository.findById(target.id);
        res.json(200, this.render(updated));
      },
    );

    // (ajuste, pedido explícito do usuário) — editar nome/WhatsApp/foto de um operador já
    // cadastrado (ex. completar o nome de quem foi criado antes da specs/0161 exigir o campo).
    // Nunca o e-mail (pedido explícito: não pode ser alterado) — e-mail é o que casa com a conta
    // Firebase de login, mudar aqui quebraria esse vínculo sem o operador saber.
    application.patch(
      '/restaurants/me/operators/:id/profile',
      ...operatorManagementAuthenticated,
      async (req: Request, res: Response) => {
        const profile = parseBody(updateOperatorProfileSchema, req.body);
        const target = await this.operatorRepository.findById(req.params.id);
        if (!target || target.restaurantId !== req.restaurantId) {
          throw new NotFoundError('Operador não encontrado');
        }
        // Mesma proteção do papel/exclusão: gerente não edita o perfil do dono.
        if (req.operatorRole === 'gerente' && target.role === 'dono') {
          throw new ForbiddenError('Gerentes não podem editar o perfil de um dono');
        }
        await this.operatorRepository.updateProfile(target.id, profile);
        const updated = await this.operatorRepository.findById(target.id);
        res.json(200, this.render(updated));
      },
    );
  }
}
