/**
 * specs/0105-modulo-ajuda-retaguarda — manual de ajuda da retaguarda, organizado na mesma ordem
 * do menu lateral (`moduleKey`/`moduleOrder` batem com `key`/posição de `nav-items.tsx`), um
 * artigo por item de menu (REQ-1/REQ-2). `audience: 'cliente'` é reservado pro manual do app
 * (specs/0104), fora do escopo desta implementação.
 */
export interface HelpArticleStep {
  text: string;
  /** REQ-4 — captura de tela real da página, nunca ilustração/mockup. Vazio = passo sem imagem. */
  imageUrl?: string;
}

export const helpAudiences = ['retaguarda', 'cliente'] as const;
export type HelpAudience = (typeof helpAudiences)[number];

export interface HelpArticle {
  id: string;
  audience: HelpAudience;
  /** Bate com `key` do grupo em `nav-items.tsx` (ex. 'restaurante'). */
  moduleKey: string;
  /** Rótulo do grupo (ex. 'Restaurante') — evita o BFF duplicar `nav-items.tsx`. */
  moduleLabel: string;
  /** Posição do grupo no menu lateral — ordena as seções do manual (REQ-1). */
  moduleOrder: number;
  /** Rótulo do item de menu (ex. 'Formas de Pagamento'). */
  itemLabel: string;
  /** Posição do item dentro do grupo. */
  itemOrder: number;
  /** Rota real da retaguarda que este artigo explica (REQ-6), ex. '/settings/payment-methods'. */
  linkTo: string;
  title: string;
  /** Passo a passo numerado pela posição no array (REQ-3). */
  steps: HelpArticleStep[];
  createdAt: Date;
  updatedAt: Date;
}

export type NewHelpArticle = Omit<HelpArticle, 'id' | 'createdAt' | 'updatedAt'>;

export interface IHelpArticleRepository {
  /** Ordenado por (moduleOrder, itemOrder) — ordem de exibição do manual (REQ-1/REQ-2). */
  list(audience: HelpAudience): Promise<HelpArticle[]>;
  findById(id: string): Promise<HelpArticle | null>;
  create(input: NewHelpArticle): Promise<HelpArticle>;
  update(id: string, input: NewHelpArticle): Promise<HelpArticle | null>;
  delete(id: string): Promise<boolean>;
}
