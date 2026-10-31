import { loadBaileys } from './load-baileys';
import { WhatsAppSessionModel } from './models/whatsapp-session.mongoose.model';
import { useMongoAuthState } from './mongo-auth-state';

jest.mock('./load-baileys');
jest.mock('./models/whatsapp-session.mongoose.model');

// Achado de auditoria (2026-10-31, crítico) — `mongo-auth-state.ts` não tinha teste próprio (o
// spec de `WhatsAppConnectionService` mocka este módulo inteiro); por isso o bug passou
// despercebido. `keys.set` é chamado pelo Baileys com muita frequência (toda troca de chave do
// protocolo Signal) e `persist()` fazia `JSON.stringify` SÍNCRONO do blob inteiro a cada chamada,
// bloqueando o event loop compartilhado por todos os restaurantes. A correção agrupa (debounce)
// chamadas próximas numa única escrita real — estes testes provam isso sem depender do Baileys
// de verdade (mockado) nem do Mongo de verdade (model mockado).
describe('useMongoAuthState — debounce de persist (achado de auditoria 2026-10-31)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    (loadBaileys as jest.Mock).mockResolvedValue({
      BufferJSON: {
        replacer: (_key: string, value: unknown) => value,
        reviver: (_key: string, value: unknown) => value,
      },
      initAuthCreds: jest.fn().mockReturnValue({ fake: 'creds' }),
    });
    (WhatsAppSessionModel.findById as jest.Mock) = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    (WhatsAppSessionModel.findByIdAndUpdate as jest.Mock) = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('agrupa várias chamadas de keys.set em sequência numa única escrita real no Mongo', async () => {
    const { state } = await useMongoAuthState('r-1');

    const write1 = state.keys.set({ 'app-state-sync-key': { 'id-1': { value: 1 } } } as never);
    const write2 = state.keys.set({ 'app-state-sync-key': { 'id-2': { value: 2 } } } as never);
    const write3 = state.keys.set({ 'app-state-sync-key': { 'id-3': { value: 3 } } } as never);

    // Nenhuma escrita ainda — as 3 chamadas caíram dentro da mesma janela de debounce.
    expect(WhatsAppSessionModel.findByIdAndUpdate).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1_000);
    await Promise.all([write1, write2, write3]);

    expect(WhatsAppSessionModel.findByIdAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('chamadas em janelas de debounce diferentes geram escritas separadas', async () => {
    const { state } = await useMongoAuthState('r-1');

    const firstWrite = state.keys.set({ 'pre-key': { 'id-1': { value: 1 } } } as never);
    await jest.advanceTimersByTimeAsync(1_000);
    await firstWrite;
    expect(WhatsAppSessionModel.findByIdAndUpdate).toHaveBeenCalledTimes(1);

    const secondWrite = state.keys.set({ 'pre-key': { 'id-2': { value: 2 } } } as never);
    await jest.advanceTimersByTimeAsync(1_000);
    await secondWrite;
    expect(WhatsAppSessionModel.findByIdAndUpdate).toHaveBeenCalledTimes(2);
  });

  it('saveCreds (creds.update) também passa pelo mesmo debounce de persist', async () => {
    const { saveCreds } = await useMongoAuthState('r-1');

    const write1 = saveCreds();
    const write2 = saveCreds();
    expect(WhatsAppSessionModel.findByIdAndUpdate).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1_000);
    await Promise.all([write1, write2]);

    expect(WhatsAppSessionModel.findByIdAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('todas as chamadas agrupadas rejeitam juntas quando a escrita real falha', async () => {
    (WhatsAppSessionModel.findByIdAndUpdate as jest.Mock).mockRejectedValueOnce(new Error('Mongo fora do ar'));
    const { state } = await useMongoAuthState('r-1');

    // `Promise.allSettled` prende um handler em cada promise JÁ na criação (síncrono) — evita a
    // janela de "unhandled rejection" que existiria se só anexássemos `.rejects` depois do
    // `advanceTimersByTimeAsync`, quando a rejeição real já teria acontecido.
    const settled = Promise.allSettled([
      state.keys.set({ 'pre-key': { 'id-1': { value: 1 } } } as never),
      state.keys.set({ 'pre-key': { 'id-2': { value: 2 } } } as never),
    ]);

    await jest.advanceTimersByTimeAsync(1_000);

    const results = await settled;
    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
  });
});
