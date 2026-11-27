import { CustomerModel } from '../models/customer.mongoose.model';
import { CustomerMongooseRepository } from './customer.mongoose.repository';

// specs/0229 REQ-6 (opção A, decisão do usuário 27/11/2026) — telefone já cadastrado em "Novo
// cliente" só VINCULA o restaurante; nunca troca quem criou o cadastro.
describe('CustomerMongooseRepository.createByRestaurant (specs/0229 REQ-6)', () => {
  afterEach(() => jest.restoreAllMocks());

  const lean = <T>(value: T) => ({ lean: () => Promise.resolve(value) }) as never;

  it('AC-7: cliente do app existente — acrescenta o restaurante em linkedRestaurantIds, sem mexer em createdByRestaurantId', async () => {
    const appCustomer = { _id: 'firebase-uid-1', name: 'Cliente do app', email: 'c@gmail.com', phone: '5585999990000', createdByRestaurantId: 'r-outro' };
    jest.spyOn(CustomerModel, 'findOne').mockReturnValue(lean(appCustomer));
    const update = jest.spyOn(CustomerModel, 'findByIdAndUpdate').mockReturnValue(lean({ ...appCustomer, linkedRestaurantIds: ['r-1'] }));

    const result = await new CustomerMongooseRepository().createByRestaurant('r-1', 'Outro nome', '5585999990000');

    expect(update).toHaveBeenCalledWith('firebase-uid-1', { $addToSet: { linkedRestaurantIds: 'r-1' } }, { new: true });
    expect(result).toMatchObject({ id: 'firebase-uid-1', name: 'Cliente do app', createdByRestaurantId: 'r-outro', linkedRestaurantIds: ['r-1'] });
  });

  it('cliente já criado por este restaurante — não grava nada', async () => {
    const own = { _id: 'retaguarda_1', name: 'Cliente da loja', email: 'x@retaguarda.mobbs-delivery.local', phone: '5585999990000', createdByRestaurantId: 'r-1' };
    jest.spyOn(CustomerModel, 'findOne').mockReturnValue(lean(own));
    const update = jest.spyOn(CustomerModel, 'findByIdAndUpdate');

    const result = await new CustomerMongooseRepository().createByRestaurant('r-1', 'X', '5585999990000');

    expect(update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'retaguarda_1', createdByRestaurantId: 'r-1' });
  });
});
