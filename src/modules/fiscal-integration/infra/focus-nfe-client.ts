/**
 * specs/0091-integracao-fiscal-focusnfe — cliente HTTP pra API da FocusNFe (`fetch` nativo, mesmo
 * padrão de `AsaasClient`/`IFoodClient`). Contrato conferido na documentação oficial
 * (doc.focusnfe.com.br) em 2026-10-28:
 * - Autenticação: HTTP Basic (RFC 7617) — token da empresa como usuário, senha vazia
 *   (`doc.focusnfe.com.br/reference/autenticacao`).
 * - Ambientes: homologação `https://homologacao.focusnfe.com.br`, produção
 *   `https://api.focusnfe.com.br` (`doc.focusnfe.com.br/reference/ambiente`) — resolvidos em
 *   `FiscalEmissionService`, nunca hardcoded aqui (o cliente só recebe a `baseUrl` já escolhida).
 * - Emissão: `POST {baseUrl}/v2/nfce?ref={ref}`, síncrona (autorizada ou rejeitada na mesma
 *   chamada) — `doc.focusnfe.com.br/reference/emitir_nfce`.
 * - Consulta: `GET {baseUrl}/v2/nfce/{ref}` — `doc.focusnfe.com.br/reference/consultar_nfce`.
 * - Cancelamento: `DELETE {baseUrl}/v2/nfce/{ref}`, corpo `{ justificativa }` (15-255
 *   caracteres), só aceito até 30 min após a emissão — `doc.focusnfe.com.br/reference/
 *   cancelar_nfce`.
 * - Webhook: a doc pública (`doc.focusnfe.com.br/docs/webhooks`) não publica o schema exato do
 *   payload, só diz que a notificação de autorização "contém os mesmos dados da consulta GET do
 *   documento" — por isso `FocusNfeWebhookPayload` abaixo reaproveita `FocusNfeDocumentResult`
 *   (suposição documentada, não confirmada contra um webhook real — sem conta de testes da
 *   FocusNFe disponível nesta sessão pra validar). O header/segredo do webhook é configurado por
 *   NÓS ao registrar o hook (`POST /v2/hooks`, campos `authorization`/`authorization_header`) —
 *   `registerWebhook` abaixo existe pronto pro cadastro, mas NÃO é chamado automaticamente ainda
 *   (ver `docs/FOCUSNFE.md`, "registro do webhook é passo manual nesta v1").
 *
 * NFCe (modelo 65) é o único documento implementado (`emitNfce`/`getNfceStatus`/`cancelNfce`).
 * CFe/SAT e NFe modelo 55 (`emitCfe`/`emitNfe`) têm assinatura reservada mas lançam erro
 * explícito — fora de escopo da v1 (spec.md, "Fora de escopo"), depende do regime
 * tributário/estado de cada restaurante.
 */
export interface FocusNfeItemInput {
  numero_item: number;
  codigo_ncm: string;
  codigo_produto: string;
  descricao: string;
  quantidade_comercial: number;
  quantidade_tributavel: number;
  cfop: string;
  valor_unitario_comercial: number;
  valor_unitario_tributavel: number;
  valor_bruto: number;
  unidade_comercial: string;
  unidade_tributavel: string;
  icms_origem: string;
  icms_situacao_tributaria: string;
}

export interface FocusNfePaymentInput {
  forma_pagamento: string;
  valor_pagamento: number;
}

export interface EmitNfceInput {
  cnpj_emitente: string;
  data_emissao: string;
  presenca_comprador: string;
  modalidade_frete: string;
  local_destino: string;
  natureza_operacao: string;
  items: FocusNfeItemInput[];
  formas_pagamento: FocusNfePaymentInput[];
  nome_destinatario?: string;
  cpf_destinatario?: string;
  cnpj_destinatario?: string;
}

export interface FocusNfeDocumentResult {
  ref?: string;
  status: 'autorizado' | 'erro_autorizacao' | 'denegado' | 'processando_autorizacao' | 'cancelado';
  status_sefaz?: string;
  mensagem_sefaz?: string;
  chave_nfe?: string;
  numero?: string;
  serie?: string;
  caminho_xml_nota_fiscal?: string;
  caminho_danfe?: string;
  qrcode_url?: string;
  url_consulta_nf?: string;
  erros?: { mensagem: string; campo?: string }[];
}

/** Ver nota no cabeçalho do arquivo — suposição documentada, não confirmada contra webhook real. */
export type FocusNfeWebhookPayload = FocusNfeDocumentResult;

export class FocusNfeApiClient {
  constructor(
    private readonly token: string,
    private readonly baseUrl: string,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${this.token}:`).toString('base64')}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();

    // Diferente de `AsaasClient`/`IFoodClient`: um 4xx da FocusNFe costuma trazer um corpo JSON
    // de NEGÓCIO (rejeição da SEFAZ, erro de validação por campo — `erros`) que o chamador
    // precisa interpretar, não uma falha de transporte. Só lança erro em falha real (>=500 ou
    // corpo que nem chega a ser JSON válido); 4xx com corpo decodificável devolve normalmente.
    if (!response.ok && (response.status >= 500 || !text)) {
      throw new Error(`FocusNFe API (${method} ${path}) respondeu ${response.status}: ${text}`);
    }

    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** `POST /v2/nfce?ref={ref}` (REQ-2) — `ref` é escolhido por quem chama (`Order.id`). */
  async emitNfce(ref: string, input: EmitNfceInput): Promise<FocusNfeDocumentResult> {
    return this.request<FocusNfeDocumentResult>('POST', `/v2/nfce?ref=${encodeURIComponent(ref)}`, input);
  }

  /** `GET /v2/nfce/{ref}` — usado pela reemissão manual e por uma consulta futura caso a
   * emissão volte `processando_autorizacao`. */
  async getNfceStatus(ref: string): Promise<FocusNfeDocumentResult> {
    return this.request<FocusNfeDocumentResult>('GET', `/v2/nfce/${encodeURIComponent(ref)}`);
  }

  /** `DELETE /v2/nfce/{ref}` (REQ-6) — `justificativa` precisa ter 15-255 caracteres. */
  async cancelNfce(ref: string, justificativa: string): Promise<FocusNfeDocumentResult> {
    return this.request<FocusNfeDocumentResult>('DELETE', `/v2/nfce/${encodeURIComponent(ref)}`, { justificativa });
  }

  /** `POST /v2/hooks` — registro do webhook de retorno. Pronto pra uso, mas não chamado
   * automaticamente nesta v1 (ver cabeçalho do arquivo e `docs/FOCUSNFE.md`). */
  async registerWebhook(webhookUrl: string, authorizationHeader: string, authorizationValue: string): Promise<void> {
    await this.request('POST', '/v2/hooks', {
      url: webhookUrl,
      authorization_header: authorizationHeader,
      authorization: authorizationValue,
    });
  }

  async emitCfe(): Promise<never> {
    throw new Error('Emissão de CFe/SAT ainda não implementada (specs/0091, fora de escopo da v1) — documentType "cfe" não deve ser emitido.');
  }

  async emitNfe(): Promise<never> {
    throw new Error('Emissão de NFe modelo 55 ainda não implementada (specs/0091, fora de escopo da v1) — documentType "nfe" não deve ser emitido.');
  }
}
