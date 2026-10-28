import { RestaurantOperatorModel } from '../models/restaurant-operator.mongoose.model';

/**
 * Achado real (pedido explícito do usuário) — a exclusividade "um e-mail só pode estar ativo
 * como operador em UM restaurante por vez" só era garantida no código (`POST
 * /restaurants/me/operators` e `POST /restaurants/signup`, ambos checam antes de criar), nunca
 * no banco: o índice único era `(restaurantId, email)`, não `email` sozinho, então nada impedia
 * duas (ou mais) ativações simultâneas por qualquer caminho fora desses dois endpoints (seed,
 * migração futura, edição manual). Quando isso acontece, `findActiveOperatorByEmail` (sem
 * `.sort()`) devolve um dos vínculos de forma não-determinística — web/comanda/KDS podiam
 * resolver o restaurante errado pro mesmo operador.
 *
 * Roda a cada início do servidor (mesmo racional de `migrateOperatorRolesToDono`): pra cada
 * e-mail com mais de um vínculo `isActive: true`, mantém só o mais recente (`createdAt` maior) e
 * desativa os demais. Precisa rodar ANTES do índice único parcial (`email` + `isActive: true`,
 * ver `restaurant-operator.mongoose.model.ts`) poder ser criado sem erro de chave duplicada.
 * Idempotente: sem duplicata ativa, não acha nada pra desativar.
 */
export async function deactivateDuplicateActiveOperators(): Promise<void> {
  const duplicates = await RestaurantOperatorModel.aggregate<{ _id: string; ids: string[] }>([
    { $match: { isActive: true } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$email', ids: { $push: '$_id' } } },
    { $match: { 'ids.1': { $exists: true } } },
  ]);

  for (const duplicate of duplicates) {
    const [, ...staleIds] = duplicate.ids;
    await RestaurantOperatorModel.updateMany({ _id: { $in: staleIds } }, { $set: { isActive: false } });
  }
}
