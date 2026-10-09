import pino from 'pino';

import { IPlatformWhatsAppConnectionService } from '../domain/services/i-platform-whatsapp-connection.service';
import { toWhatsAppJidCandidates } from '../domain/whatsapp-jid';
import { loadBaileys } from './load-baileys';
import { clearWhatsAppSession, useMongoAuthState } from './mongo-auth-state';
import { WhatsAppSessionModel } from './models/whatsapp-session.mongoose.model';

type BaileysModule = typeof import('@whiskeysockets/baileys');
type WASocket = ReturnType<BaileysModule['makeWASocket']>;

/** specs/0124-campanha-whatsapp-prospects — chave fixa da sessão de plataforma no
 * `whatsapp_session` (mesma coleção das sessões por restaurante, `WhatsAppSessionModel`), mesmo
 * padrão de singleton de `BILLING_SETTINGS_SINGLETON_ID`. */
export const PLATFORM_WHATSAPP_SESSION_ID = 'platform';

interface SessionEntry {
  socket: WASocket;
  qr: string | null;
  connected: boolean;
  /** `true` depois do primeiro `open` — distingue queda de uma sessão viva de um QR abandonado. */
  everConnected: boolean;
}

const logger = pino({ level: 'silent' });

/**
 * specs/0124-campanha-whatsapp-prospects — implementação separada de `WhatsAppConnectionService`
 * (specs/0013) de propósito: aquele serviço persiste o estado "conectado" em `Restaurant`
 * (`setWhatsappConnected`), o que pressupõe um `restaurantId` real — chamar com um ID de
 * sentinela (`PLATFORM_WHATSAPP_SESSION_ID`) quebraria essa escrita (nenhum restaurante tem esse
 * `_id`). Aqui não existe `Restaurant` nenhum envolvido — só uma sessão em memória (não um
 * `Map`, já que só existe uma) e as credenciais persistidas em Mongo (`useMongoAuthState`), igual
 * ao padrão original.
 */
export class PlatformWhatsAppConnectionService implements IPlatformWhatsAppConnectionService {
  private entry: SessionEntry | null = null;

  async startPairing(): Promise<string | null> {
    if (this.entry?.connected) return null;
    if (this.entry?.qr) return this.entry.qr;

    await this.connect();
    return this.waitForQr();
  }

  async getConnectionStatus(): Promise<boolean> {
    return this.entry?.connected ?? false;
  }

  async disconnect(): Promise<void> {
    if (this.entry) {
      await this.entry.socket.logout().catch(() => undefined);
      this.entry = null;
    }
    await clearWhatsAppSession(PLATFORM_WHATSAPP_SESSION_ID);
  }

  async sendMessage(phone: string, text: string): Promise<void> {
    if (!this.entry?.connected) {
      throw new Error('WhatsApp da plataforma não conectado');
    }
    const jid = await this.resolveRecipientJid(this.entry.socket, phone);
    await this.entry.socket.sendMessage(jid, { text });
    console.log(`[whatsapp-platform] mensagem enviada para ${jid}`);
  }

  async sendImageMessage(phone: string, imageUrl: string, caption: string): Promise<void> {
    if (!this.entry?.connected) {
      throw new Error('WhatsApp da plataforma não conectado');
    }
    const jid = await this.resolveRecipientJid(this.entry.socket, phone);
    await this.entry.socket.sendMessage(jid, { image: { url: imageUrl }, caption });
    console.log(`[whatsapp-platform] imagem enviada para ${jid}`);
  }

  /** specs/0068 — mesma resolução de JID candidato usada pela sessão por restaurante (número sem
   * o nono dígito ainda é comum em contas antigas). */
  private async resolveRecipientJid(socket: WASocket, phone: string): Promise<string> {
    const candidates = toWhatsAppJidCandidates(phone);
    let results: Array<{ jid: string; exists: boolean }> | undefined;
    try {
      results = await socket.onWhatsApp(...candidates);
    } catch (error) {
      console.warn('[whatsapp-platform] onWhatsApp falhou; usando o JID padrão:', error);
      return candidates[0];
    }
    const found = results?.find((result) => result.exists);
    if (!found) {
      throw new Error(`O número ${candidates[0].split('@')[0]} não está registrado no WhatsApp`);
    }
    return found.jid;
  }

  async restoreConnectedSession(): Promise<void> {
    const exists = await WhatsAppSessionModel.exists({ _id: PLATFORM_WHATSAPP_SESSION_ID });
    if (!exists) return;
    try {
      await this.connect();
      console.log('[whatsapp-platform] sessão da plataforma reaberta no boot');
    } catch (error) {
      console.error('[whatsapp-platform] falha ao reabrir a sessão da plataforma:', error);
    }
  }

  /** Espera o primeiro QR (evento assíncrono do Baileys) chegar, com um teto de tempo — não tem
   * como devolver o QR de forma síncrona. */
  private async waitForQr(timeoutMs = 15_000): Promise<string | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (this.entry?.qr) return this.entry.qr;
      if (this.entry?.connected) return null;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return null;
  }

  private async connect(): Promise<void> {
    const { makeWASocket, makeCacheableSignalKeyStore, DisconnectReason } = await loadBaileys();
    const { state, saveCreds } = await useMongoAuthState(PLATFORM_WHATSAPP_SESSION_ID);

    const socket = makeWASocket({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      logger,
    });

    const entry: SessionEntry = { socket, qr: null, connected: false, everConnected: false };
    this.entry = entry;

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
      if (update.qr) {
        entry.qr = update.qr;
      }

      if (update.connection === 'open') {
        entry.connected = true;
        entry.everConnected = true;
        entry.qr = null;
      }

      if (update.connection === 'close') {
        entry.connected = false;
        // Mesma lógica de `WhatsAppConnectionService`: `disconnect()` já zerou `this.entry` antes
        // do `logout()` nesse caso — não há o que reconectar. Só limpa a própria entrada: um
        // reconector pode ter posto uma nova no meio tempo.
        const wasCurrent = this.entry === entry;
        if (wasCurrent) this.entry = null;

        const statusCode = (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
          ?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          await clearWhatsAppSession(PLATFORM_WHATSAPP_SESSION_ID);
          return;
        }
        if (!wasCurrent) return;

        // specs/0067 — depois de ler o QR o WhatsApp encerra o socket com `restartRequired` (515)
        // e exige abrir um novo com as credenciais recém-salvas. Uma queda de sessão que já
        // esteve conectada também reconecta; um QR que expirou sem ninguém ler não reconecta.
        if (statusCode !== DisconnectReason.restartRequired && !entry.everConnected) {
          return;
        }
        console.log(`[whatsapp-platform] conexão fechou (código ${statusCode}); reconectando`);
        try {
          await this.connect();
        } catch (error) {
          console.error('[whatsapp-platform] falha ao reconectar:', error);
        }
      }
    });
  }
}
