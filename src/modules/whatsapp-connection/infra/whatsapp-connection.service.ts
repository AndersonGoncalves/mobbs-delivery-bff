import pino from 'pino';

import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IWhatsAppConnectionService } from '../domain/services/i-whatsapp-connection.service';
import { toWhatsAppJid } from '../domain/whatsapp-jid';
import { loadBaileys } from './load-baileys';
import { clearWhatsAppSession, useMongoAuthState } from './mongo-auth-state';

type BaileysModule = typeof import('@whiskeysockets/baileys');
type WASocket = ReturnType<BaileysModule['makeWASocket']>;

interface SessionEntry {
  socket: WASocket;
  qr: string | null;
  connected: boolean;
}

const logger = pino({ level: 'silent' });

/**
 * specs/0013-notificacoes-whatsapp — implementação real via Baileys (decisão do usuário,
 * 2026-09-09). Uma instância de socket por restaurante, mantida em memória
 * (`Map<restaurantId, SessionEntry>`) enquanto o processo do BFF estiver de pé; credenciais
 * persistidas em MongoDB (`useMongoAuthState`) pra sobreviver a reinícios/deploys sem exigir
 * reconectar toda vez.
 *
 * **Não testável de ponta a ponta neste ambiente** (não há um número/aparelho real pra escanear
 * o QR) — implementado contra a API documentada do Baileys; ver `specs/0013-notificacoes-
 * whatsapp/plan.md`, "Riscos e alternativas consideradas".
 */
export class WhatsAppConnectionService implements IWhatsAppConnectionService {
  private readonly sessions = new Map<string, SessionEntry>();

  constructor(private readonly restaurantRepository: IRestaurantRepository) {}

  async startPairing(restaurantId: string): Promise<string | null> {
    const existing = this.sessions.get(restaurantId);
    if (existing?.connected) return null;
    if (existing?.qr) return existing.qr;

    await this.connect(restaurantId);
    return this.waitForQr(restaurantId);
  }

  async getConnectionStatus(restaurantId: string): Promise<boolean> {
    return this.sessions.get(restaurantId)?.connected ?? false;
  }

  async disconnect(restaurantId: string): Promise<void> {
    const entry = this.sessions.get(restaurantId);
    if (entry) {
      await entry.socket.logout().catch(() => undefined);
      this.sessions.delete(restaurantId);
    }
    await clearWhatsAppSession(restaurantId);
    await this.restaurantRepository.setWhatsappConnected(restaurantId, false);
  }

  async sendMessage(restaurantId: string, phone: string, text: string): Promise<void> {
    const entry = this.sessions.get(restaurantId);
    if (!entry?.connected) {
      throw new Error(`WhatsApp não conectado para o restaurante ${restaurantId}`);
    }
    await entry.socket.sendMessage(toWhatsAppJid(phone), { text });
  }

  /** Espera o primeiro QR (evento assíncrono do Baileys) chegar, com um teto de tempo — não tem
   * como devolver o QR de forma síncrona. */
  private async waitForQr(restaurantId: string, timeoutMs = 15_000): Promise<string | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const entry = this.sessions.get(restaurantId);
      if (entry?.qr) return entry.qr;
      if (entry?.connected) return null;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return null;
  }

  private async connect(restaurantId: string): Promise<void> {
    const { makeWASocket, makeCacheableSignalKeyStore, DisconnectReason } = await loadBaileys();
    const { state, saveCreds } = await useMongoAuthState(restaurantId);

    const socket = makeWASocket({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      logger,
    });

    const entry: SessionEntry = { socket, qr: null, connected: false };
    this.sessions.set(restaurantId, entry);

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
      if (update.qr) {
        entry.qr = update.qr;
      }

      if (update.connection === 'open') {
        entry.connected = true;
        entry.qr = null;
        await this.restaurantRepository.setWhatsappConnected(restaurantId, true);
      }

      if (update.connection === 'close') {
        entry.connected = false;
        this.sessions.delete(restaurantId);
        await this.restaurantRepository.setWhatsappConnected(restaurantId, false);

        const statusCode = (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
          ?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          await clearWhatsAppSession(restaurantId);
        }
      }
    });
  }
}
