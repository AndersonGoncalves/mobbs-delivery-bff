import { IRestaurantRepository } from './repositories/restaurant.repository.interface';

/**
 * specs/0038-autocadastro-restaurante plan.md "Caminhos reservados" / specs/0037-roteamento-por-caminho
 * plan.md — primeiros segmentos de path que o Nginx trata como algo diferente de slug de
 * restaurante; nenhum cadastro pode gerar um destes.
 */
const RESERVED_SLUGS: ReadonlySet<string> = new Set(['painel', 'signup', 'login', 'api', 'assets', 'r', 'www']);

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'restaurante';
}

/** specs/0038-autocadastro-restaurante REQ-3 (AC-3) — se o slug já existir (ou for um caminho
 * reservado), tenta `-2`, `-3`, ... até achar um livre, sem pedir escolha manual. */
export async function generateUniqueSlug(name: string, restaurantRepository: IRestaurantRepository): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let attempt = 1;
  while (RESERVED_SLUGS.has(candidate) || (await restaurantRepository.findBySlug(candidate)) !== null) {
    attempt += 1;
    candidate = `${base}-${attempt}`;
  }
  return candidate;
}
