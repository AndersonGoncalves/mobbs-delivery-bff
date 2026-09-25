/**
 * specs/0072 — texto de compartilhamento do cardápio usado quando o restaurante não configurou o
 * dele (`Restaurant.shareMessage`). O app cliente envia "<texto>\n\n<link>", então o texto termina
 * apontando pro link que vem logo abaixo.
 */
export function buildDefaultShareMessage(restaurantName: string): string {
  return `Olha só o que eu encontrei: o cardápio do ${restaurantName}! 😋\nEscolha seus favoritos e faça seu pedido pelo app, de um jeito rápido e prático. Vem conferir 👇`;
}
