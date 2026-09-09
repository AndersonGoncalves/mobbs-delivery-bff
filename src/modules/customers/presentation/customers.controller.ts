import type { Request, Response, Server } from 'restify';
import { NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { IAddress } from '../domain/entities/customer.entity';
import { IAddressRepository } from '../domain/repositories/address.repository.interface';
import { ICustomerRepository } from '../domain/repositories/customer.repository.interface';
import { saveAddressSchema, updateCustomerProfileSchema } from './customers.schemas';

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
  }

  private async findOwnedAddress(id: string, customerId: string): Promise<IAddress> {
    const address = await this.addressRepository.findById(id);
    if (!address || address.customerId !== customerId) {
      throw new NotFoundError('Endereço não encontrado');
    }
    return address;
  }
}
