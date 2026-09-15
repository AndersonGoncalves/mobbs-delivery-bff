/**
 * specs/0029-ajustes-carrinho-perfil-restaurante-diversos REQ-4 — algoritmo padrão de dígito
 * verificador de CNPJ, não só formato/máscara. Mesmo raciocínio de `isValidCpf`
 * (`modules/customers/domain/cpf-validator.ts`): nunca confiar só na validação do lado cliente
 * pra uma regra de negócio.
 */
export function isValidCnpj(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const checkDigit = (base: string, weights: number[]): number => {
    const total = base.split('').reduce((sum, char, index) => sum + Number(char) * weights[index], 0);
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const firstWeights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const secondWeights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  if (checkDigit(digits.slice(0, 12), firstWeights) !== Number(digits[12])) return false;
  if (checkDigit(digits.slice(0, 13), secondWeights) !== Number(digits[13])) return false;

  return true;
}
