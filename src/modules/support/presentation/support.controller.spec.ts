import type { Server } from 'restify';
import { environment } from '../../../shared/config/environment';
import { SupportController } from './support.controller';

describe('SupportController', () => {
  afterEach(() => jest.restoreAllMocks());

  it('GET /support/public usa configuração e expõe apenas os cinco campos públicos, sem autenticação', async () => {
    const support = {
      whatsapp: '5511999999999',
      email: 'support@example.com',
      businessHours: 'Segunda a sexta, 9h–18h',
      trainingPriceCents: 12345,
      trainingUnlimitedItems: false,
    };
    jest.replaceProperty(environment, 'support', support);
    const get = jest.fn();
    new SupportController().initializeRoutes({ get } as unknown as Server);
    expect(get).toHaveBeenCalledWith('/support/public', expect.any(Function));
    const json = jest.fn();
    await get.mock.calls[0][1]({}, { json });
    expect(json).toHaveBeenCalledWith(200, support);
  });

  it('não inventa contatos quando a configuração pública está vazia', async () => {
    jest.replaceProperty(environment, 'support', {
      whatsapp: '', email: '', businessHours: '', trainingPriceCents: 0, trainingUnlimitedItems: false,
    });
    const get = jest.fn();
    new SupportController().initializeRoutes({ get } as unknown as Server);
    const json = jest.fn();
    await get.mock.calls[0][1]({}, { json });
    expect(json).toHaveBeenCalledWith(200, {
      whatsapp: '', email: '', businessHours: '', trainingPriceCents: 0, trainingUnlimitedItems: false,
    });
  });
});
