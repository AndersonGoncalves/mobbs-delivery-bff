import type { IBillingPayer, IBillingPayerAddress } from '../entities/billing-payer.entity';
import type { IBillingPayerRepository } from '../repositories/billing-payer.repository.interface';

export interface PlatformAsaasCustomerClient {
  createCustomer(name: string, cpfCnpj: string): Promise<{ id: string }>;
}

export interface CompletePayerInput {
  legalName: string;
  document: string;
  email: string;
  phone: string;
  address: IBillingPayerAddress;
}

/**
 * specs/0175-cobranca-assinatura-asaas REQ-1/REQ-3/REQ-4 — cadastra/reusa o restaurante como
 * CLIENTE (`customer`) da conta Asaas da plataforma. Validação de campos exigidos (nome/CPF-CNPJ/
 * demais) fica na presentation (schema zod, mesmo padrão de `createAsaasSubaccountSchema`,
 * specs/0101) — por isso aqui `input` já chega completo/válido.
 *
 * REQ-3 — "falha do Asaas não deve... duplicar": se já existe um `IBillingPayer` local, reusa o
 * `asaasCustomerId` já persistido, nunca chama `createCustomer` de novo. Limitação conhecida e
 * aceita (documentada, não escondida): se a criação no Asaas tiver sucesso mas a gravação LOCAL
 * falhar ANTES de persistir (janela estreita, sem solução limpa — o Asaas não oferece busca de
 * cliente por referência externa, diferente de pagamento/`findPaymentByExternalReference`), uma
 * retentativa cria um 2º cliente órfão no Asaas — inofensivo (não duplica cobrança nem bloqueia),
 * só uma sobra de dado lá, fora do escopo resolver sem esse recurso do provedor.
 */
export class BillingPayerService {
  constructor(
    private readonly deps: {
      billingPayerRepository: IBillingPayerRepository;
      asaasClient: PlatformAsaasCustomerClient;
    },
  ) {}

  async completePayer(restaurantId: string, input: CompletePayerInput, now: Date): Promise<IBillingPayer> {
    const existing = await this.deps.billingPayerRepository.findByRestaurantId(restaurantId);
    const asaasCustomerId = existing?.asaasCustomerId ?? (await this.deps.asaasClient.createCustomer(input.legalName, input.document)).id;

    return this.deps.billingPayerRepository.save(restaurantId, {
      asaasCustomerId,
      legalName: input.legalName,
      document: input.document,
      email: input.email,
      phone: input.phone,
      address: input.address,
      completedAt: now,
    });
  }
}
