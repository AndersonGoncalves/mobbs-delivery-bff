import { SupplierModel } from '../models/supplier.mongoose.model';
import { SupplierMongooseRepository } from './supplier.mongoose.repository';

const address = { zipCode: '60000000', street: 'Rua Central', number: '10', complement: 'Sala 1', neighborhood: 'Centro', city: 'Fortaleza', state: 'CE' };
const doc = { _id: 's1', restaurantId: 'r1', name: 'Fornecedor', isActive: true, address };

describe('SupplierMongooseRepository endereço', () => {
  afterEach(() => jest.restoreAllMocks());

  it('modelo preserva todos os campos do endereço e aceita cadastro legado', () => {
    expect(new SupplierModel(doc).toObject().address).toEqual(address);
    expect(new SupplierModel({ restaurantId: 'r1', name: 'Legado' }).validateSync()).toBeUndefined();
  });

  it('retorna endereço salvo ao recuperar cadastro', async () => {
    const query = SupplierModel.findById('s1');
    jest.spyOn(query, 'lean').mockResolvedValue(doc);
    jest.spyOn(SupplierModel, 'findById').mockReturnValue(query);
    await expect(new SupplierMongooseRepository().findById('s1')).resolves.toMatchObject({ id: 's1', address });
  });

  it('edição persiste endereço completo e recupera valores', async () => {
    const query = SupplierModel.findByIdAndUpdate('s1', {});
    jest.spyOn(query, 'lean').mockResolvedValue(doc);
    const update = jest.spyOn(SupplierModel, 'findByIdAndUpdate').mockReturnValue(query);
    await expect(new SupplierMongooseRepository().update('s1', { name: 'Fornecedor', address })).resolves.toMatchObject({ address });
    expect(update).toHaveBeenCalledWith('s1', { $set: { name: 'Fornecedor', address } }, { new: true });
  });
});
