/**
 * specs/0020-pix-no-app REQ-1 — payload EMV/BR Code (padrão Bacen, "Manual de Padrões para
 * Iniciação do Pix") estático, gerado direto a partir da chave Pix cadastrada pelo restaurante
 * (`Restaurant.pixKey`/`pixBeneficiaryName`/`address.city`) + valor exato do pedido. Domain puro
 * (sem I/O), testável sem mocks — mesma abordagem de `order-receipt-message-builder.ts`
 * (specs/0013).
 *
 * Sem gateway/PSP: o "copia-e-cola" devolvido aqui é decodificável por qualquer app de banco,
 * mas a confirmação de recebimento é 100% manual (REQ-4/REQ-5) — este módulo só monta o payload,
 * nunca fala com nenhum serviço externo.
 *
 * Campos EMV/BR Code implementados (ids do padrão QRCPS-MPM/Bacen):
 * - 00 Payload Format Indicator ("01")
 * - 26 Merchant Account Information — GUI `br.gov.bcb.pix` (subcampo 00) + chave Pix (01)
 * - 52 Merchant Category Code ("0000" — genérico, não classificado)
 * - 53 Transaction Currency ("986" — BRL)
 * - 54 Transaction Amount — valor exato do pedido (REQ-1), sempre presente (nunca "código sem
 *   valor fixo": o cliente já sabe o total antes de pagar)
 * - 58 Country Code ("BR")
 * - 59 Merchant Name (nome do beneficiário, máx. 25 caracteres)
 * - 60 Merchant City (cidade do restaurante, máx. 15 caracteres)
 * - 62 Additional Data Field Template — subcampo 05 (Reference Label/txid)
 * - 63 CRC16 — calculado sobre todo o payload anterior, incluindo o próprio id+tamanho do campo
 *   63 ("6304"), mas não o valor do CRC em si
 */

export interface BuildPixBrCodeInput {
  /** Chave Pix cadastrada pelo restaurante (`Restaurant.pixKey`) — telefone, CPF/CNPJ, e-mail ou aleatória. */
  pixKey: string;
  /** `Restaurant.pixBeneficiaryName` (fallback pro nome do restaurante já é responsabilidade de quem chama). */
  merchantName: string;
  /** `Restaurant.address.city`. */
  merchantCity: string;
  /** Valor exato do pedido (`Order.total`), em reais (mesma unidade usada no resto do domínio `Order`). */
  amount: number;
  /** Identificador do pedido (`Order.id`), usado como referência (campo 05 do template 62). */
  txId: string;
}

const GUI_PIX = 'br.gov.bcb.pix';
const MERCHANT_CATEGORY_CODE = '0000';
const CURRENCY_CODE_BRL = '986';
const COUNTRY_CODE_BR = 'BR';
const MERCHANT_NAME_MAX_LENGTH = 25;
const MERCHANT_CITY_MAX_LENGTH = 15;
const TX_ID_MAX_LENGTH = 25;
const NO_TX_ID_PLACEHOLDER = '***';

/** Campo 59/60 do BR Code exige texto ASCII (sem acentos) — remove diacríticos e qualquer caractere fora do intervalo imprimível. */
function toAscii(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

/** Campo 05 (txid) aceita só alfanumérico (Bacen) — remove hífens de UUID etc. */
function toAlphanumeric(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '');
}

function tlv(id: string, value: string): string {
  const length = value.length.toString().padStart(2, '0');
  return `${id}${length}${value}`;
}

/**
 * CRC16/CCITT-FALSE — polinômio `0x1021`, valor inicial `0xFFFF`, sem reflect/xorout. Verificado
 * contra o exemplo oficial do Manual de Padrões para Iniciação do Pix (Bacen): o payload
 * `00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-42665544000052040000530398658\
 * 02BR5913Fulano de Tal6008BRASILIA62070503***6304` produz CRC `1D3D` com este algoritmo — ver
 * `pix-br-code-builder.spec.ts`.
 */
export function crc16CcittFalse(payload: string): string {
  let crc = 0xffff;
  const polynomial = 0x1021;

  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ polynomial) & 0xffff : (crc << 1) & 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function buildPixBrCode(input: BuildPixBrCodeInput): string {
  const merchantName = toAscii(input.merchantName).slice(0, MERCHANT_NAME_MAX_LENGTH) || 'NA';
  const merchantCity = toAscii(input.merchantCity).slice(0, MERCHANT_CITY_MAX_LENGTH) || 'BRASIL';
  const txId = toAlphanumeric(input.txId).slice(0, TX_ID_MAX_LENGTH) || NO_TX_ID_PLACEHOLDER;
  const amount = input.amount.toFixed(2);

  const merchantAccountInformation = tlv('00', GUI_PIX) + tlv('01', input.pixKey);
  const additionalDataField = tlv('05', txId);

  const payloadWithoutCrc =
    tlv('00', '01') +
    tlv('26', merchantAccountInformation) +
    tlv('52', MERCHANT_CATEGORY_CODE) +
    tlv('53', CURRENCY_CODE_BRL) +
    tlv('54', amount) +
    tlv('58', COUNTRY_CODE_BR) +
    tlv('59', merchantName) +
    tlv('60', merchantCity) +
    tlv('62', additionalDataField) +
    '6304';

  return `${payloadWithoutCrc}${crc16CcittFalse(payloadWithoutCrc)}`;
}
