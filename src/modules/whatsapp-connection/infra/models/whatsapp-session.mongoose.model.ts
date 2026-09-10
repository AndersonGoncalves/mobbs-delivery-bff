import { Schema, model } from 'mongoose';

/**
 * specs/0013-notificacoes-whatsapp REQ-11/REQ-12 — uma sessão pareada do Baileys por restaurante.
 * `_id` é o próprio `restaurantId` (não um id gerado), já que é uma relação 1:1. `credsJson`/
 * `keysJson` guardam os blobs de `AuthenticationCreds`/chaves do Signal serializados via
 * `BufferJSON` (do próprio Baileys) — como string opaca, não um objeto Mongo estruturado, pra não
 * lidar com chaves dinâmicas (tipo/id) que poderiam colidir com caracteres especiais do Mongo
 * (`.`/`$`) nem com a serialização de `Buffer`/classes internas do Signal.
 */
const whatsAppSessionSchema = new Schema(
  {
    _id: { type: String },
    credsJson: { type: String, required: true },
    keysJson: { type: String, required: true },
  },
  { _id: false, timestamps: true },
);

export const WhatsAppSessionModel = model('WhatsAppSession', whatsAppSessionSchema, 'whatsapp_session');
