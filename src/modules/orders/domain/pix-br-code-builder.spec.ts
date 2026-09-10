import { buildPixBrCode, crc16CcittFalse } from './pix-br-code-builder';

describe('crc16CcittFalse', () => {
  it('AC-1: bate com o exemplo oficial do Manual de Padrões para Iniciação do Pix (Bacen) — CRC "1D3D"', () => {
    // Exemplo publicado pelo Bacen (chave aleatória "123e4567-e12b-12d1-a456-426655440000",
    // beneficiário "Fulano de Tal", cidade "BRASILIA", sem valor fixo) — confirma que o
    // algoritmo (CRC16/CCITT-FALSE, polinômio 0x1021, inicial 0xFFFF) está correto antes de
    // usá-lo em `buildPixBrCode`. O "6304" (id + tamanho do próprio campo do CRC) entra no
    // cálculo — erro comum é calcular só até o campo 62.
    const officialPayloadWithoutCrc =
      '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-42665544000052040000' +
      '53039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';

    expect(crc16CcittFalse(officialPayloadWithoutCrc)).toBe('1D3D');
  });
});

describe('buildPixBrCode', () => {
  it('AC-1: gera o payload EMV/BR Code completo e correto (todos os campos obrigatórios + CRC16 válido)', () => {
    const result = buildPixBrCode({
      pixKey: '11999999999',
      merchantName: 'Prime Pizza LTDA',
      merchantCity: 'São Paulo',
      amount: 30.5,
      txId: 'a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c',
    });

    // Valor calculado e conferido manualmente (mesmo algoritmo validado contra o exemplo oficial
    // do Bacen acima) — qualquer mudança nos campos/ordem quebra este teste.
    expect(result).toBe(
      '00020126330014br.gov.bcb.pix011111999999999520400005303986540530.505802BR5916Prime Pizza LTDA' +
        '6009Sao Paulo62290525a1b2c3d4e5f647a89b0c1d2e3630414DD',
    );

    // Confere campo a campo, pra ficar claro o que cada trecho do payload significa.
    expect(result).toContain('000201'); // Payload Format Indicator = "01"
    expect(result).toContain('0014br.gov.bcb.pix'); // GUI do arranjo Pix
    expect(result).toContain('011111999999999'); // chave Pix (subcampo 01, tamanho "11" + 11 dígitos)
    expect(result).toContain('52040000'); // Merchant Category Code genérico
    expect(result).toContain('5303986'); // moeda BRL (986)
    expect(result).toContain('540530.50'); // valor exato do pedido
    expect(result).toContain('5802BR'); // país
    expect(result).toContain('5916Prime Pizza LTDA'); // beneficiário
    expect(result).toContain('6009Sao Paulo'); // cidade (acento removido)
    expect(result).toMatch(/6304[0-9A-F]{4}$/); // CRC16 de 4 dígitos hexadecimais maiúsculos no final
  });

  it('AC-1: usa o valor exato do pedido (não arredonda nem trunca casas decimais)', () => {
    const result = buildPixBrCode({
      pixKey: 'chave@restaurante.com',
      merchantName: 'Restaurante',
      merchantCity: 'Recife',
      amount: 123.4,
      txId: 'o-42',
    });

    expect(result).toContain('5406123.40');
  });

  it('remove acentos do nome/cidade (campo EMV exige ASCII) e trunca nos limites do Bacen (25/15 caracteres)', () => {
    const result = buildPixBrCode({
      pixKey: 'restaurante@example.com',
      merchantName: 'Açaí & Cia Ltda - Matriz Centro Histórico Completo',
      merchantCity: 'Brasília',
      amount: 9.9,
      txId: '###',
    });

    expect(result).toBe(
      '00020126450014br.gov.bcb.pix0123restaurante@example.com52040000530398654049.90' +
        '5802BR5925Acai & Cia Ltda - Matriz 6008Brasilia62070503***63040725',
    );
    expect(result).not.toMatch(/[çãáéíóúÇÃÁÉÍÓÚ]/);
  });

  it('usa "***" como referência quando o txid não sobra nenhum caractere alfanumérico', () => {
    const result = buildPixBrCode({
      pixKey: 'chave@restaurante.com',
      merchantName: 'Restaurante',
      merchantCity: 'Recife',
      amount: 10,
      txId: '###',
    });

    expect(result).toContain('0503***');
  });

  it('trunca o txid em 25 caracteres alfanuméricos (limite do campo 05 do Bacen)', () => {
    const result = buildPixBrCode({
      pixKey: 'chave@restaurante.com',
      merchantName: 'Restaurante',
      merchantCity: 'Recife',
      amount: 10,
      txId: 'a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c-extra-caracteres-demais',
    });

    expect(result).toContain('0525a1b2c3d4e5f647a89b0c1d2e3');
  });
});
