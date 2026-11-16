import { IOrder, PaymentMethod } from '../../orders/domain/entities/order.entity';
import { IRestaurant } from '../../restaurants/domain/entities/restaurant.entity';
import { ICustomer } from '../../customers/domain/entities/customer.entity';
import { stripAccents } from '../../../shared/utils/strip-accents';
import { ReceiptLine } from './build-receipt-lines';

function money(value: number): string {
  return `R$${value.toFixed(2).replace('.', ',')}`;
}

function formatOrderDateTime(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Chave de acesso da NFCe é impressa em 11 grupos de 4 dígitos, convenção padrão do DANFCE
 * oficial — mais fácil de conferir manualmente contra o QR code do que uma string corrida de 44
 * dígitos. */
function formatAccessKey(key: string): string {
  return key.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

/** XX.XXX.XXX/XXXX-XX — máscara padrão de CNPJ (14 dígitos), aplicada aqui porque o XML devolve
 * só os dígitos crus (`<CNPJ>07456684000180</CNPJ>`). */
function formatCnpj(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 14) return raw;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/** XXX.XXX.XXX-XX — máscara padrão de CPF (11 dígitos), pra seção "CONSUMIDOR" quando o cliente
 * tem documento cadastrado (`Customer.document`); CNPJ (14 dígitos) usa `formatCnpj`. */
function formatDocument(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 14) return formatCnpj(digits);
  if (digits.length !== 11) return raw;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** XXXXX-XXX — máscara padrão de CEP (8 dígitos), mesmo motivo de `formatCnpj` (XML devolve cru). */
function formatCep(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 8) return raw;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/** (XX) XXXXX-XXXX (celular, 11 dígitos) ou (XX) XXXX-XXXX (fixo, 10 dígitos) — `<fone>` do XML
 * vem só com DDD + número, sem o "55" do país (diferente do padrão E.164 usado em
 * `normalizePhoneNumber` em outros módulos). */
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return raw;
}

/** Pedido explícito do usuário (16/11/2026) — rótulos no mesmo estilo da FocusNFe (ex.
 * "Pagamento Instantâneo (PIX)"), diferentes dos rótulos do ticket normal (`build-receipt-lines.ts`
 * tem os seus próprios, mais informais — "Cartao de Credito Maquininha" etc.). */
const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Dinheiro',
  pix: 'Pagamento Instantaneo (PIX)',
  creditCard: 'Cartao de Credito',
  creditCardOnline: 'Cartao de Credito (pago online)',
  debitCard: 'Cartao de Debito',
};

/**
 * Pedido explícito do usuário (16/11/2026) — cupom fiscal simplificado, impresso automaticamente
 * pela bridge junto do ticket do pedido (`ReceiptLine[]`, mesmo mecanismo de `buildReceiptLines`,
 * fila separada). Não é o DANFE completo (HTML hospedado pela FocusNFe, `Order.fiscal.
 * documentUrl`) — a bridge só imprime texto ESC/POS, nunca renderiza página web. Em vez disso,
 * reproduz a estrutura de um DANFCE simplificado real (cabeçalho do emitente, itens, totais,
 * forma de pagamento, identificação da nota, protocolo, chave de acesso, QR code de consulta),
 * validada campo a campo contra uma emissão real em produção (pedido #181, 16/11/2026).
 *
 * Só chamado quando `order.fiscal?.status === 'emitido'` (ver `findPendingFiscalPrint`) — os
 * campos de `IOrderFiscal` usados aqui só existem nesse caso. `customer` é opcional/pode ser
 * `null` — nunca enviamos CPF/CNPJ do cliente pra FocusNFe (a nota em si sempre sai anônima,
 * `FiscalEmissionService.buildEmitInput` nunca popula `cpf_destinatario`), então a seção
 * "CONSUMIDOR" aqui é só informativa no papel, nunca reflete o documento fiscal oficial.
 */
export function buildFiscalReceiptLines(order: IOrder, restaurant: IRestaurant, customer: ICustomer | null): ReceiptLine[] {
  const fiscal = order.fiscal!;
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const lines: ReceiptLine[] = [];

  // Pedido explícito do usuário (16/11/2026) — cabeçalho inteiro vem do XML da nota (dados reais
  // do emitente cadastrados no painel da FocusNFe), nunca do nosso `Restaurant`/`FiscalConfig` —
  // os dois podem divergir do que foi cadastrado de fato pra emissão fiscal. Nome/CNPJ caem no
  // fallback de `Restaurant` só se o XML não puder ser lido (nunca existia fallback pros outros
  // campos — IE/endereço/telefone — por isso esses somem juntos nesse caso, sem substituto).
  const emitterName = fiscal.emitterName ?? restaurant.name;
  lines.push({ text: stripAccents(emitterName).toUpperCase(), bold: true });

  const emitterCnpj = fiscal.emitterCnpj ?? restaurant.document;
  if (emitterCnpj) {
    const cnpjLine = `CNPJ: ${formatCnpj(emitterCnpj)}` + (fiscal.emitterIe ? `  IE: ${fiscal.emitterIe}` : '');
    lines.push({ text: cnpjLine });
  }
  const address = fiscal.emitterAddress;
  if (address?.street) {
    lines.push({ text: `${stripAccents(address.street).toUpperCase()}, ${address.number ?? 'S/N'} - ${stripAccents(address.neighborhood ?? '').toUpperCase()}` });
  }
  if (address?.zipCode || fiscal.emitterPhone) {
    const cepPart = address?.zipCode ? `CEP: ${formatCep(address.zipCode)}` : '';
    const phonePart = fiscal.emitterPhone ? `Tel.: ${formatPhone(fiscal.emitterPhone)}` : '';
    lines.push({ text: [cepPart, phonePart].filter(Boolean).join(' - ') });
  }
  if (address?.city) {
    lines.push({ text: `${stripAccents(address.city)} - ${address.state ?? ''}` });
  }
  lines.push({ text: 'DANFE NFC-e - Documento Auxiliar da', bold: true });
  lines.push({ text: 'Nota Fiscal de Consumidor Eletronica', bold: true });
  // Pedido explícito do usuário (16/11/2026) — texto fixo presente em todo DANFCE real, faltava.
  lines.push({ text: 'Nao permite aproveitamento de credito de ICMS' });
  // Pedido explícito do usuário (16/11/2026) — linha em branco entre o cabeçalho e os itens.
  lines.push({ text: '' });
  lines.push({ text: '', divider: true });

  lines.push({ text: `ITENS (${itemCount})` });
  for (const item of order.items) {
    lines.push({ text: `# ${item.quantity}x ${stripAccents(item.productName)} ${money(item.unitPrice * item.quantity)}` });
  }
  if (order.deliveryFee > 0) {
    lines.push({ text: `# Taxa de entrega ${money(order.deliveryFee)}` });
  }
  lines.push({ text: '', divider: true });
  // Pedido explícito do usuário (16/11/2026) — "Qtd. Total de Itens", presente no DANFCE real,
  // faltava (só mostrávamos o valor total, nunca a quantidade).
  lines.push({ text: `Qtd. Total de Itens: ${itemCount}` });
  lines.push({ text: `TOTAL: ${money(order.total)}`, bold: true });
  // Pedido explícito do usuário (16/11/2026) — tributos aproximados (Lei 12.741/2012) + split
  // Federal/Estadual + fonte, extraídos do XML da nota (nunca no JSON da FocusNFe) — ver
  // `FocusNfeApiClient.fetchNfceXmlFields`. O split/fonte são texto livre no XML (`<infCpl>`),
  // por isso podem ficar ausentes mesmo com `approxTaxAmount` presente.
  if (fiscal.approxTaxAmount !== undefined) {
    lines.push({ text: `Tributos aprox. (Lei 12.741/2012): ${money(fiscal.approxTaxAmount)}` });
  }
  if (fiscal.approxTaxFederal !== undefined && fiscal.approxTaxState !== undefined) {
    lines.push({ text: `Trib. aprox: ${money(fiscal.approxTaxFederal)} Federal; ${money(fiscal.approxTaxState)} Estadual` });
  }
  if (fiscal.approxTaxSource) {
    lines.push({ text: `Fonte: ${stripAccents(fiscal.approxTaxSource)}` });
  }
  lines.push({ text: '' });

  // Pedido explícito do usuário (16/11/2026) — forma de pagamento + valor pago + troco, ausente
  // antes (nem mostrávamos qual foi a forma de pagamento) — dados já existem no pedido, não
  // precisam do XML.
  lines.push({ text: 'Forma de pagamento' });
  lines.push({ text: `- ${PAYMENT_LABELS[order.paymentMethod]} ${money(order.total)}` });
  if (order.paymentMethod === 'cash' && order.cashChangeFor !== undefined) {
    lines.push({ text: `Troco: ${money(Math.max(0, order.cashChangeFor - order.total))}` });
  }
  lines.push({ text: '' });

  lines.push({ text: `NFC-e no ${fiscal.number ?? '-'} Serie ${fiscal.series ?? '-'}` });
  lines.push({ text: `Emissao: ${formatOrderDateTime(fiscal.emittedAt ?? order.createdAt)} - Via Consumidor` });
  lines.push({ text: '' });

  // Pedido explícito do usuário (16/11/2026) — ordem invertida pra bater com o DANFCE real:
  // consulta primeiro, "CHAVE DE ACESSO" + a chave em si depois (antes estava ao contrário).
  lines.push({ text: 'Consulte pela Chave de Acesso em' });
  // Pedido explícito do usuário (16/11/2026) — URL de consulta real do estado do emitente
  // (`url_consulta_nf`, já devolvida pela FocusNFe) em vez da genérica federal fixa; só cai no
  // fallback se a FocusNFe não devolver (nunca aconteceu nos testes reais, mas defesa barata).
  lines.push({ text: fiscal.consultaUrl ?? 'www.nfce.fazenda.gov.br' });
  lines.push({ text: '' });

  if (fiscal.accessKey) {
    lines.push({ text: 'CHAVE DE ACESSO' });
    // Pedido explícito do usuário (16/11/2026) — mesma linha, em negrito, fonte B (condensada):
    // 44 dígitos + 10 espaços = 54 caracteres, maior que os 48 da fonte normal (por isso quebrava
    // em duas linhas antes) — a fonte B cabe mais caracteres na mesma largura física do papel.
    lines.push({ text: formatAccessKey(fiscal.accessKey), bold: true, small: true });
    lines.push({ text: '' });
  }

  // Pedido explícito do usuário (16/11/2026) — seção "CONSUMIDOR": identifica pelo CPF/CNPJ do
  // cliente SÓ quando cadastrado no nosso banco (`Customer.document`) — nunca reflete o que foi
  // enviado à FocusNFe (a nota em si sempre sai anônima, ver docstring da função).
  lines.push({ text: 'CONSUMIDOR' });
  if (customer?.document) {
    lines.push({ text: `CPF: ${formatDocument(customer.document)}` });
    lines.push({ text: stripAccents(customer.name).toUpperCase() });
  } else {
    lines.push({ text: 'CONSUMIDOR NAO IDENTIFICADO' });
  }
  lines.push({ text: '' });

  lines.push({ text: 'Consulta via Leitor de QR Code' });
  if (fiscal.qrCode) {
    lines.push({ text: '', qr: fiscal.qrCode });
  }
  lines.push({ text: '' });
  // Pedido explícito do usuário (16/11/2026) — protocolo de autorização da SEFAZ, ausente antes
  // (comentário anterior dizia, errado, que a FocusNFe nunca devolvia isso) — ver
  // `IOrderFiscal.protocol`.
  if (fiscal.protocol) {
    lines.push({ text: `Protocolo de autorizacao: ${fiscal.protocol}` });
  }
  lines.push({ text: '-- BsDelivery --' });

  return lines;
}
