import { fetchWithTimeout } from '../../../shared/utils/fetch-with-timeout';

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
  /** specs/0207-dados-fiscais-cadastro REQ-11 — só enviado quando o produto tem CEST cadastrado
   * (`Product.cestCode`); omitido pros demais (CEST só é obrigatório pra produto sujeito a
   * Substituição Tributária). */
  cest?: string;
  /** specs/0207-dados-fiscais-cadastro REQ-12 — `Product.gtin` quando cadastrado, senão
   * `"SEM GTIN"` (convenção padrão de NFe pra produto sem código de barras) — nunca omitido. */
  gtin?: string;
  gtin_tributavel?: string;
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

/** Pedido explícito do usuário (16/11/2026) — campos que a FocusNFe NUNCA devolve no JSON (nem na
 * emissão, nem na consulta) — só existem no XML da própria nota, confirmado contra uma emissão
 * real em produção (pedido #180, 16/11/2026): `vTotTrib` (tributos aproximados, Lei 12.741/2012,
 * sempre dentro de `<ICMSTot>`), e os dados do emitente — razão social, CNPJ, IE e endereço
 * completo, sempre dentro de `<emit>`/`<enderEmit>`. Usados só pra montar o cupom fiscal
 * simplificado (`buildFiscalReceiptLines`) — pedido explícito do usuário: o cabeçalho do cupom
 * passa a vir inteiro do XML (o documento fiscal de verdade), nunca do nosso `Restaurant`/
 * `FiscalConfig` — os dois podem divergir do que foi cadastrado de fato no painel da FocusNFe. */
export interface NfceXmlEmitterAddress {
  street?: string;
  number?: string;
  neighborhood?: string;
  zipCode?: string;
  city?: string;
  state?: string;
}

export interface NfceXmlFields {
  approxTaxAmount?: number;
  emitterName?: string;
  emitterCnpj?: string;
  emitterIe?: string;
  emitterPhone?: string;
  emitterAddress?: NfceXmlEmitterAddress;
}

/** Ver nota no cabeçalho do arquivo — suposição documentada, não confirmada contra webhook real. */
export type FocusNfeWebhookPayload = FocusNfeDocumentResult;

export class FocusNfeApiClient {
  constructor(
    private readonly token: string,
    private readonly baseUrl: string,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    // specs/0091 — emissão é síncrona e envolve um roundtrip real com a SEFAZ (pode legitimamente
    // demorar mais que uma chamada comum); 15s (teto da faixa recomendada) em vez do default.
    const response = await fetchWithTimeout(
      `${this.baseUrl}${path}`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${this.token}:`).toString('base64')}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      15_000,
    );

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

  /** Pedido explícito do usuário (16/11/2026) — baixa o XML da nota (confirmado real: URL pública,
   * sem autenticação, ~6,5KB, mesmo domínio de `caminho_danfe`) e extrai só os dois campos que o
   * JSON da FocusNFe nunca devolve (ver `NfceXmlFields`), via regex ancorada no bloco certo do XML
   * (nunca o primeiro `<vTotTrib>`/`<IE>` que aparecer — o documento tem um `vTotTrib` por item
   * além do total, e poderia ter uma segunda `IE` se o destinatário tivesse uma cadastrada).
   * Nunca lança: falha aqui é só o cupom simplificado sair sem esses dois campos, nunca motivo pra
   * reverter uma emissão já autorizada. */
  async fetchNfceXmlFields(xmlUrl: string): Promise<NfceXmlFields> {
    try {
      const response = await fetchWithTimeout(xmlUrl, {}, 10_000);
      if (!response.ok) return {};
      const xml = await response.text();
      const tag = (block: string, name: string): string | undefined => block.match(new RegExp(`<${name}>([^<]+)</${name}>`))?.[1];

      const totalBlock = xml.match(/<ICMSTot>([\s\S]*?)<\/ICMSTot>/)?.[1] ?? '';
      const emitBlock = xml.match(/<emit>([\s\S]*?)<\/emit>/)?.[1] ?? '';
      // `<enderEmit>` fica DENTRO de `<emit>` — pegar ancorado no bloco do emitente, nunca no XML
      // inteiro, pelo mesmo motivo do `<IE>`/`<CNPJ>`: o `<dest>` (destinatário) é irmão de
      // `<emit>`, nunca filho, mas mais vale a defesa explícita do que confiar nisso sem âncora.
      const enderBlock = emitBlock.match(/<enderEmit>([\s\S]*?)<\/enderEmit>/)?.[1] ?? '';

      const approxTaxAmount = tag(totalBlock, 'vTotTrib');
      const emitterAddress: NfceXmlEmitterAddress | undefined = enderBlock
        ? {
            street: tag(enderBlock, 'xLgr'),
            number: tag(enderBlock, 'nro'),
            neighborhood: tag(enderBlock, 'xBairro'),
            zipCode: tag(enderBlock, 'CEP'),
            city: tag(enderBlock, 'xMun'),
            state: tag(enderBlock, 'UF'),
          }
        : undefined;

      return {
        approxTaxAmount: approxTaxAmount ? Number(approxTaxAmount) : undefined,
        emitterName: tag(emitBlock, 'xNome'),
        emitterCnpj: tag(emitBlock, 'CNPJ'),
        emitterIe: tag(emitBlock, 'IE'),
        emitterPhone: tag(enderBlock, 'fone'),
        emitterAddress,
      };
    } catch (error) {
      console.error(`[fiscal-integration] erro inesperado baixando/lendo o XML da nota (${xmlUrl}):`, error);
      return {};
    }
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
