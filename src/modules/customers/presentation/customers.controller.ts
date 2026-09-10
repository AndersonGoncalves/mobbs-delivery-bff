import type { Request, Response, Server } from 'restify';
import { BadRequestError, NotFoundError } from 'restify-errors';
import * as admin from 'firebase-admin';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { ensureFirebaseAdminInitialized } from '../../../shared/config/firebase-admin';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { IEmailService } from '../../../shared/email/i-email-service';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { buildCustomerDataExport } from '../domain/build-data-export';
import { IAddress } from '../domain/entities/customer.entity';
import { IAddressRepository } from '../domain/repositories/address.repository.interface';
import { ICustomerRepository } from '../domain/repositories/customer.repository.interface';
import { IFavoriteRepository } from '../domain/repositories/favorite.repository.interface';
import {
  acceptTermsSchema,
  addFavoriteSchema,
  listFavoritesQuerySchema,
  saveAddressSchema,
  updateCustomerProfileSchema,
} from './customers.schemas';

/**
 * specs/0011-perfil-cliente — todas as rotas resolvem `customerId` do UID do Firebase no token
 * (nunca por parâmetro de rota), mesmo padrão de isolamento já usado em `specs/0010` (lá pra
 * `restaurantId`, aqui pra `customerId`). Sem `restaurantOperatorMiddleware`: perfil/endereço são
 * do cliente, não escopados a restaurante nenhum (`docs/architecture/data-model.md`, nota
 * "Customer e Address NÃO são escopados por restaurante").
 */
export class CustomersController extends BaseRouter {
  constructor(
    private readonly customerRepository: ICustomerRepository,
    private readonly addressRepository: IAddressRepository,
    private readonly favoriteRepository: IFavoriteRepository,
    /** specs/0023-portabilidade-dados REQ-2 — agregação da exportação de dados. */
    private readonly orderRepository: IOrderRepository,
    private readonly emailService: IEmailService,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    // REQ-1: sem `Customer` persistido ainda (1º acesso — `signInWithGoogle` nunca chama o BFF),
    // sintetiza o perfil a partir do próprio token, sem persistir nada.
    application.get('/customers/me', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const existing = await this.customerRepository.findById(req.user!.uid);
      if (existing) {
        res.json(200, existing);
        return;
      }
      res.json(200, {
        id: req.user!.uid,
        name: req.user!.name ?? '',
        email: req.user!.email ?? '',
        photoUrl: req.user!.picture,
      });
    });

    // REQ-1/REQ-11: upsert — cria no primeiro PUT (mesma regra de "sem Customer persistido"
    // acima), atualiza depois. `name`/`email`/`photoUrl` sempre resolvidos com um valor (nunca
    // undefined), porque o schema do Mongoose exige os obrigatórios mesmo no insert do upsert.
    application.put('/customers/me', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const patch = parseBody(updateCustomerProfileSchema, req.body);
      const existing = await this.customerRepository.findById(req.user!.uid);

      const customer = await this.customerRepository.upsertProfile(req.user!.uid, {
        name: patch.name ?? existing?.name ?? req.user!.name ?? '',
        email: existing?.email ?? req.user!.email ?? '',
        photoUrl: existing?.photoUrl ?? req.user!.picture,
        phone: patch.phone ?? existing?.phone,
        document: patch.document ?? existing?.document,
      });

      res.json(200, customer);
    });

    application.get('/customers/me/addresses', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const addresses = await this.addressRepository.listByCustomer(req.user!.uid);
      res.json(200, addresses);
    });

    application.post('/customers/me/addresses', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const input = parseBody(saveAddressSchema, req.body);
      const address = await this.addressRepository.create(req.user!.uid, input);
      res.json(201, address);
    });

    application.put(
      '/customers/me/addresses/:id',
      firebaseAuthMiddleware,
      async (req: Request, res: Response) => {
        const input = parseBody(saveAddressSchema, req.body);
        await this.findOwnedAddress(req.params.id, req.user!.uid);
        const address = await this.addressRepository.update(req.params.id, input);
        res.json(200, address);
      },
    );

    // REQ-5/REQ-7: devolve a lista já com o padrão reatribuído (se era o caso), pra retaguarda/
    // app não precisarem de uma segunda chamada.
    application.del(
      '/customers/me/addresses/:id',
      firebaseAuthMiddleware,
      async (req: Request, res: Response) => {
        await this.findOwnedAddress(req.params.id, req.user!.uid);
        const addresses = await this.addressRepository.remove(req.params.id);
        res.json(200, addresses);
      },
    );

    // REQ-6: idem — devolve a lista com só um padrão.
    application.patch(
      '/customers/me/addresses/:id/default',
      firebaseAuthMiddleware,
      async (req: Request, res: Response) => {
        await this.findOwnedAddress(req.params.id, req.user!.uid);
        const addresses = await this.addressRepository.setDefault(req.user!.uid, req.params.id);
        res.json(200, addresses);
      },
    );

    // REQ-3 (specs/0012-favoritos) — restaurantId por query param (não implícito por contexto,
    // que exigiria um interceptor/header novo inexistente hoje — mesmo padrão explícito de
    // `CatalogApiService`, `GET /restaurants/:id/menu-categories`).
    application.get('/customers/me/favorites', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const { restaurantId } = parseBody(listFavoritesQuerySchema, req.query);
      const favorites = await this.favoriteRepository.listByRestaurant(req.user!.uid, restaurantId);
      res.json(200, favorites);
    });

    // REQ-1 — upsert idempotente (`FavoriteMongooseRepository.add`), sem checar `isFavorite`
    // antes: o app decide add/remove a partir do próprio estado local (`ToggleFavoriteUseCase`).
    application.post('/customers/me/favorites', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const { restaurantId, productId } = parseBody(addFavoriteSchema, req.body);
      const favorite = await this.favoriteRepository.add(req.user!.uid, restaurantId, productId);
      res.json(201, favorite);
    });

    // REQ-2 — remove pelo par (customerId, productId); sem checagem de dono (a chave já é
    // escopada pelo próprio customerId do token, diferente de endereço que usa um `id` opaco).
    application.del(
      '/customers/me/favorites/:productId',
      firebaseAuthMiddleware,
      async (req: Request, res: Response) => {
        await this.favoriteRepository.remove(req.user!.uid, req.params.productId);
        res.send(204);
      },
    );

    // REQ-2/REQ-4 (specs/0017-lgpd-privacidade) — grava o aceite; REQ-4 (tratar versão antiga
    // como não aceita) é decidido pelo cliente comparando `termsVersionAccepted` com a versão
    // vigente, não aqui (esta rota só registra o que foi aceito).
    application.patch(
      '/customers/me/terms-acceptance',
      firebaseAuthMiddleware,
      async (req: Request, res: Response) => {
        const { version } = parseBody(acceptTermsSchema, req.body);
        const customer = await this.customerRepository.acceptTerms(req.user!.uid, version);
        res.json(200, customer);
      },
    );

    // specs/0023-portabilidade-dados REQ-2/REQ-3/REQ-4/REQ-5 — exportação de dados (LGPD).
    // Resolve o e-mail do mesmo jeito que `GET /customers/me` sintetiza o perfil (REQ-1) — sem
    // isso, um cliente Google autenticado que nunca deu `PUT` (sem `Customer` persistido ainda)
    // cairia no 400 de "sem e-mail" por engano, mesmo tendo e-mail de verdade no token.
    application.post(
      '/customers/me/data-export',
      firebaseAuthMiddleware,
      async (req: Request, res: Response) => {
        const uid = req.user!.uid;
        const existing = await this.customerRepository.findById(uid);
        const customer = existing ?? {
          id: uid,
          name: req.user!.name ?? '',
          email: req.user!.email ?? '',
          photoUrl: req.user!.picture,
        };

        // REQ-3 — sessão de visitante (specs/0019-checkout-visitante) nunca tem e-mail; orienta
        // a cadastrar um antes, em vez de tentar enviar pra um endereço vazio.
        if (!customer.email) {
          throw new BadRequestError('Cadastre um e-mail antes de solicitar a exportação dos seus dados.');
        }

        const [addresses, orders, favorites] = await Promise.all([
          this.addressRepository.listByCustomer(uid),
          this.orderRepository.findManyByCustomer(uid),
          this.favoriteRepository.listByCustomer(uid),
        ]);

        const dataExport = buildCustomerDataExport({ customer, addresses, orders, favorites });

        // REQ-4/REQ-5 — fire-and-forget, mesmo padrão `void promise.catch(...)` já estabelecido
        // em `specs/0013` (`OrdersController`): a resposta HTTP 200 nunca espera o e-mail
        // realmente sair; falha no envio só é logada, nunca propaga pro cliente.
        void this.emailService
          .send({
            to: customer.email,
            subject: 'Seus dados no mobbs delivery',
            html: `<p>Olá${customer.name ? `, ${customer.name}` : ''}! Em anexo está um arquivo JSON com todos os dados que guardamos sobre você: perfil, endereços, pedidos e favoritos.</p>`,
            attachments: [
              {
                filename: 'meus-dados.json',
                content: JSON.stringify(dataExport, null, 2),
                contentType: 'application/json',
              },
            ],
          })
          .catch((error) => {
            console.error(`[email] falha ao enviar exportação de dados do cliente ${uid}:`, error);
          });

        res.json(200, { email: customer.email });
      },
    );

    // REQ-6/REQ-7: anonimiza o Customer + apaga os Address (a), depois exclui a conta no
    // Firebase Auth (b) — nessa ordem (não o inverso): se (b) falhar depois de (a) já ter
    // gravado, o pior caso é uma conta anonimizada com o Firebase Auth ainda ativo (cliente
    // consegue logar de novo vendo perfil vazio) em vez de perder o Firebase mas manter PII.
    // `Order`s do cliente não são tocados (REQ-7) — só têm `customerId`, sem outra referência a
    // limpar aqui.
    application.del('/customers/me', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const uid = req.user!.uid;
      await this.customerRepository.anonymize(uid);
      await this.addressRepository.removeAllByCustomer(uid);

      ensureFirebaseAdminInitialized();
      await admin.auth().deleteUser(uid);

      res.send(204);
    });
  }

  private async findOwnedAddress(id: string, customerId: string): Promise<IAddress> {
    const address = await this.addressRepository.findById(id);
    if (!address || address.customerId !== customerId) {
      throw new NotFoundError('Endereço não encontrado');
    }
    return address;
  }
}
