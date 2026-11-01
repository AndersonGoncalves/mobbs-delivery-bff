import { CustomerModel } from '../../../src/modules/customers/infra/models/customer.mongoose.model';
import { AddressModel } from '../../../src/modules/customers/infra/models/address.mongoose.model';
import { Prng } from '../prng';
import { LOAD_TEST_CONFIG, BATCH_SIZE } from '../config';
import { FIRST_NAMES, LAST_NAMES, NEIGHBORHOODS, CITIES_WITH_STATE } from '../fixtures';

// Firebase Auth UIDs são strings alfanuméricas de 28 chars — formato só pra parecer real,
// nenhum código do app valida o shape (ver comentário no customer.mongoose.model.ts: "nunca
// gerado aqui", o app sempre recebe isto já pronto do Firebase).
function fakeFirebaseUid(rng: Prng, index: number): string {
  const base = `lt${index.toString(36)}`;
  const padding = rng.hex(28 - base.length);
  return (base + padding).slice(0, 28);
}

export async function generateCustomers(rng: Prng, onProgress: (done: number, total: number) => void): Promise<string[]> {
  const total = LOAD_TEST_CONFIG.customers.total;
  const customerIds: string[] = [];
  let batch: unknown[] = [];

  for (let i = 0; i < total; i++) {
    const id = fakeFirebaseUid(rng, i);
    customerIds.push(id);
    const name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
    batch.push({
      _id: id,
      name,
      email: `loadtest.cliente${i}@example.com`,
      phone: `${rng.int(11, 99)}9${rng.int(10000000, 99999999)}`,
      document: String(rng.int(10000000000, 99999999999)),
    });

    if (batch.length >= BATCH_SIZE) {
      await CustomerModel.insertMany(batch, { ordered: false });
      batch = [];
    }
    onProgress(i + 1, total);
  }
  if (batch.length > 0) await CustomerModel.insertMany(batch, { ordered: false });

  return customerIds;
}

export async function generateAddresses(rng: Prng, customerIds: string[], onProgress: (done: number, total: number) => void): Promise<void> {
  // addressesPerCustomerAvg = 1.5: metade dos clientes tem 1 endereço, metade tem 2.
  let batch: unknown[] = [];
  let done = 0;
  const total = customerIds.length;

  for (const customerId of customerIds) {
    const addressCount = rng.bool(0.5) ? 1 : 2;
    const location = rng.pick(CITIES_WITH_STATE);
    for (let a = 0; a < addressCount; a++) {
      batch.push({
        _id: `${customerId}-addr-${a}`,
        customerId,
        label: a === 0 ? 'Casa' : 'Trabalho',
        street: `Rua ${rng.pick(LAST_NAMES)}`,
        number: String(rng.int(1, 2000)),
        neighborhood: rng.pick(NEIGHBORHOODS),
        city: location.city,
        state: location.state,
        zipCode: `${rng.int(10000, 99999)}${rng.int(100, 999)}`,
        isDefault: a === 0,
      });
    }

    if (batch.length >= BATCH_SIZE) {
      await AddressModel.insertMany(batch, { ordered: false });
      batch = [];
    }
    done++;
    onProgress(done, total);
  }
  if (batch.length > 0) await AddressModel.insertMany(batch, { ordered: false });
}
