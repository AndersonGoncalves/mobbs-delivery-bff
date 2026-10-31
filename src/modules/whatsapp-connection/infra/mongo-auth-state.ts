import type { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys';

import { loadBaileys } from './load-baileys';
import { WhatsAppSessionModel } from './models/whatsapp-session.mongoose.model';

type KeysBlob = Partial<Record<string, Record<string, unknown>>>;

/**
 * Porta do `useMultiFileAuthState` (helper padrão do Baileys, baseado em arquivos) pra MongoDB —
 * specs/0013-notificacoes-whatsapp, decisão do usuário (2026-09-09): persistência da sessão em
 * Mongo, não em volume Docker, pra não depender de disco persistente do container.
 */
export async function useMongoAuthState(restaurantId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const { BufferJSON, initAuthCreds } = await loadBaileys();

  const existing = await WhatsAppSessionModel.findById(restaurantId).lean<{ credsJson: string; keysJson: string } | null>();

  const creds: AuthenticationCreds = existing
    ? (JSON.parse(existing.credsJson, BufferJSON.reviver) as AuthenticationCreds)
    : initAuthCreds();
  const keysBlob: KeysBlob = existing ? (JSON.parse(existing.keysJson, BufferJSON.reviver) as KeysBlob) : {};

  const writeNow = async (): Promise<void> => {
    await WhatsAppSessionModel.findByIdAndUpdate(
      restaurantId,
      {
        $set: {
          credsJson: JSON.stringify(creds, BufferJSON.replacer),
          keysJson: JSON.stringify(keysBlob, BufferJSON.replacer),
        },
      },
      { upsert: true },
    );
  };

  // Achado de auditoria (2026-10-31, crítico) — `keys.set` é chamado pelo Baileys com muita
  // frequência (toda troca de chave do protocolo Signal, por mensagem), e `writeNow()` acima faz
  // `JSON.stringify` SÍNCRONO do blob INTEIRO de `keysBlob` (que só cresce com o histórico de
  // contatos/chaves) a cada chamada — isso bloqueia o event loop do processo inteiro, compartilhado
  // por TODOS os restaurantes, não só o dono desta sessão. `persist()` agora agrupa (debounce)
  // chamadas próximas numa única escrita real: várias trocas de chave em sequência (comum, o
  // Baileys costuma processar um lote por vez) viram UMA serialização, não uma por chamada —
  // reduz a frequência do bloqueio sem mudar o formato armazenado nem o contrato esperado pelo
  // Baileys (`set`/`saveCreds` continuam devolvendo uma Promise normal).
  const PERSIST_DEBOUNCE_MS = 1_000;
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  let persistWaiters: { resolve: () => void; reject: (error: unknown) => void }[] = [];

  const persist = (): Promise<void> =>
    new Promise((resolve, reject) => {
      persistWaiters.push({ resolve, reject });
      if (persistTimer) return;
      persistTimer = setTimeout(() => {
        persistTimer = null;
        const waiters = persistWaiters;
        persistWaiters = [];
        writeNow().then(
          () => waiters.forEach((waiter) => waiter.resolve()),
          (error) => waiters.forEach((waiter) => waiter.reject(error)),
        );
      }, PERSIST_DEBOUNCE_MS);
    });

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const result: { [id: string]: SignalDataTypeMap[T] } = {};
          for (const id of ids) {
            const value = keysBlob[type]?.[id];
            if (value !== undefined) {
              result[id] = value as SignalDataTypeMap[T];
            }
          }
          return result;
        },
        set: async (data) => {
          for (const type of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
            keysBlob[type] = keysBlob[type] ?? {};
            const entries = data[type] ?? {};
            for (const id of Object.keys(entries)) {
              const value = entries[id];
              if (value === null || value === undefined) {
                delete keysBlob[type]![id];
              } else {
                keysBlob[type]![id] = value;
              }
            }
          }
          await persist();
        },
      },
    },
    saveCreds: persist,
  };
}

/** REQ-12 — chamado quando o Baileys reporta `DisconnectReason.loggedOut`, pra forçar um novo
 * pareamento por QR na próxima tentativa de conexão (sessão antiga não serve mais). */
export async function clearWhatsAppSession(restaurantId: string): Promise<void> {
  await WhatsAppSessionModel.deleteOne({ _id: restaurantId });
}
