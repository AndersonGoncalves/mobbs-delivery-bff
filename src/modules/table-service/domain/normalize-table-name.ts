export function normalizeTableName(name: string): string {
  return name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}
