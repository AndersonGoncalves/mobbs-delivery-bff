/**
 * REQ-11 (`specs/0011-perfil-cliente`) — algoritmo padrão de dígito verificador de CPF, não só
 * formato/máscara. Mesma regra replicada no app (`isValidCpf`, `modules/auth` do lado Flutter) —
 * nunca confiar só na validação do cliente pra uma regra de negócio.
 */
export function isValidCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const checkDigit = (base: string, startFactor: number): number => {
    let total = 0;
    let factor = startFactor;
    for (const char of base) {
      total += Number(char) * factor;
      factor -= 1;
    }
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  if (checkDigit(digits.slice(0, 9), 10) !== Number(digits[9])) return false;
  if (checkDigit(digits.slice(0, 10), 11) !== Number(digits[10])) return false;

  return true;
}
