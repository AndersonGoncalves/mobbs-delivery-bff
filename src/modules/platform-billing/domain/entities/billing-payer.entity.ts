/**
 * specs/0175-cobranca-assinatura-asaas REQ-1/REQ-3/REQ-4 — cadastro do restaurante como CLIENTE
 * (`customer`) da conta Asaas da PLATAFORMA (conta mãe, `environment.asaas.apiKey`) — nunca a
 * subconta dele (`payments-asaas`/specs/0101, que é pra receber pagamento de PEDIDO, não pra
 * pagar a assinatura). Um por restaurante, criado/completado na página de planos/regularização.
 */
export interface IBillingPayerAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface IBillingPayer {
  id: string;
  restaurantId: string;
  asaasCustomerId: string;
  legalName: string;
  /** CPF ou CNPJ, só dígitos. */
  document: string;
  email: string;
  phone: string;
  address: IBillingPayerAddress;
  /** Preenchido quando os dados exigidos pelo Asaas pra cobrar estão completos (REQ-4). */
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
