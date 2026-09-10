import { RestaurantOperatorModel } from '../models/restaurant-operator.mongoose.model';

/**
 * specs/0021-papeis-operador REQ-7/T002 — operadores cadastrados antes desta spec não têm
 * `role` no documento (schema não tinha o campo). Roda a cada início do servidor
 * (`Server.bootstrap`, `main.ts`), sempre ANTES das rotas aceitarem tráfego e antes de `role`
 * virar `required: true` valer pra qualquer novo `save()`/`update` desses documentos — senão um
 * documento antigo sem `role` falharia validação no primeiro update (plan.md, "Riscos e
 * alternativas consideradas").
 *
 * Idempotente: a segunda chamada em diante (e todo próximo boot) não encontra nenhum documento
 * com `role` inexistente, então o `updateMany` não altera nada — seguro rodar sempre, sem
 * controle externo de "já rodou".
 */
export async function migrateOperatorRolesToDono(): Promise<void> {
  await RestaurantOperatorModel.updateMany({ role: { $exists: false } }, { $set: { role: 'dono' } });
}
