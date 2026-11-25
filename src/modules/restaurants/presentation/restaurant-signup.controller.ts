import type { Request, Response, Server } from 'restify';
import { ConflictError, ForbiddenError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { IRestaurantRepository } from '../domain/repositories/restaurant.repository.interface';
import { IRestaurantOperatorRepository } from '../../restaurant-operators/domain/repositories/restaurant-operator.repository.interface';
import { IMenuCategoryRepository } from '../../catalog/domain/repositories/menu-category.repository.interface';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { IAdditionalGroupTemplateRepository } from '../../additional-group-templates/domain/repositories/additional-group-template.repository.interface';
import { generateUniqueSlug } from '../domain/generate-unique-slug';
import { seedDefaultCatalog } from '../domain/seed-default-catalog';
import { buildNewRestaurantInput } from '../domain/build-new-restaurant-input';
import { IReferralRepository } from '../../referrals/domain/repositories/referral.repository.interface';
import { IReferralCodeRepository } from '../../referrals/domain/repositories/referral-code.repository.interface';
import { REFERRAL_REWARD_CENTS } from '../../referrals/domain/entities/referral.entity';
import { signupSchema } from './restaurants.schemas';
import { IRawMaterialRepository } from '../../raw-materials/domain/repositories/raw-material.repository.interface';
import { IResellerRepository } from '../../resellers/domain/repositories/reseller.repository.interface';
import { IResellerClientRepository } from '../../resellers/domain/repositories/reseller-client.repository.interface';

/**
 * specs/0038-autocadastro-restaurante — cria o restaurante e o primeiro operador (papel `dono`)
 * automaticamente, sem passo manual. Só `firebaseAuthMiddleware` (sem
 * `restaurantOperatorMiddleware`, que exigiria um operador já existente — esta rota cria o
 * primeiro). Controller dedicado, não dentro de `RestaurantsController`, pra não precisar
 * injetar `IRestaurantOperatorRepository` em toda rota já existente de `/restaurants/...`.
 */
export class RestaurantSignupController extends BaseRouter {
  constructor(
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly restaurantOperatorRepository: IRestaurantOperatorRepository,
    private readonly menuCategoryRepository: IMenuCategoryRepository,
    private readonly productRepository: IProductRepository,
    private readonly additionalGroupTemplateRepository: IAdditionalGroupTemplateRepository,
    // specs/0110 REQ-4 — vínculo de indicação de cliente, só quando o `?ref=` é válido.
    private readonly referralRepository: IReferralRepository,
    private readonly referralCodeRepository: IReferralCodeRepository,
    // Matérias-primas padrão do autocadastro (`DEFAULT_RAW_MATERIALS`).
    private readonly rawMaterialRepository: IRawMaterialRepository,
    // specs/0189-painel-revenda REQ-10 — vínculo automático de cliente efetivado, só quando o
    // `?revenda=` é de um revendedor ativo.
    private readonly resellerRepository: IResellerRepository,
    private readonly resellerClientRepository: IResellerClientRepository,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.post('/restaurants/signup', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const { name, ownerName, whatsapp, businessType } = parseBody(signupSchema, req.body);
      const email = req.user!.email;
      if (!email) {
        throw new ForbiddenError('Conta sem e-mail associado');
      }

      // REQ-4 (AC-4) — checa todo vínculo (ativo ou não), não só `findActiveOperatorByEmail`,
      // pra não permitir reabrir cadastro reativando um e-mail já usado num restaurante diferente.
      const existingOperator = await this.restaurantOperatorRepository.findByEmail(email);
      if (existingOperator) {
        throw new ConflictError('Este e-mail já está associado a um restaurante');
      }

      const slug = await generateUniqueSlug(name, this.restaurantRepository);
      // specs/0110 REQ-4/REQ-5 — `?ref=` opcional, código de um cliente do app. Código inválido ou
      // inexistente não bloqueia o cadastro: só não cria indicação nenhuma.
      const refCode = typeof req.query?.ref === 'string' ? req.query.ref.trim().toUpperCase() : '';
      const referrerCustomerId = refCode ? await this.referralCodeRepository.findCustomerIdByCode(refCode) : null;
      // specs/0189-painel-revenda REQ-10/REQ-11 — `?revenda=` opcional, código de um revendedor;
      // espaço de código SEPARADO do `?ref=` acima (plan.md/spec — evita colisão entre os dois
      // atores). Código inválido/inexistente/de revendedor inativo não bloqueia o cadastro, só
      // não cria vínculo nenhum (mesmo racional do `?ref=`).
      const revendaCode = typeof req.query?.revenda === 'string' ? req.query.revenda.trim().toUpperCase() : '';
      const reseller = revendaCode ? await this.resellerRepository.findByCode(revendaCode) : null;
      // Defaults de restaurante recém-criado — ver `buildNewRestaurantInput` (domain/).
      const restaurant = await this.restaurantRepository.create(buildNewRestaurantInput({ name, slug, phone: whatsapp, businessType }));
      await this.restaurantOperatorRepository.create(restaurant.id, email, 'dono', ownerName);
      if (referrerCustomerId) {
        await this.referralRepository.create({
          referrerCustomerId,
          referredRestaurantId: restaurant.id,
          rewardCents: REFERRAL_REWARD_CENTS,
        });
      }
      // REQ-10 — restaurante recém-criado nunca tem vínculo prévio, então não há colisão possível
      // aqui (diferente da conversão manual, que checa explicitamente — plan.md decisão 3).
      if (reseller && reseller.isActive) {
        await this.resellerClientRepository.create({ resellerId: reseller.id, restaurantId: restaurant.id, origin: 'link' });
      }
      // REQ-9 — catálogo inicial típico do tipo de negócio, sem imagem, pronto pro dono editar.
      await seedDefaultCatalog(restaurant.id, businessType, {
        menuCategoryRepository: this.menuCategoryRepository,
        productRepository: this.productRepository,
        additionalGroupTemplateRepository: this.additionalGroupTemplateRepository,
        rawMaterialRepository: this.rawMaterialRepository,
      });

      res.json(201, { restaurantId: restaurant.id, slug: restaurant.slug });
    });
  }
}
