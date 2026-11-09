import mongoose from 'mongoose';

import { environment } from '../config/environment';

export class MongooseConnection {
  private static instance: MongooseConnection;
  private listenersRegistered = false;

  private constructor() {}

  static getInstance(): MongooseConnection {
    if (!MongooseConnection.instance) {
      MongooseConnection.instance = new MongooseConnection();
    }
    return MongooseConnection.instance;
  }

  async connect(): Promise<void> {
    this.registerConnectionListeners();
    // Achado de auditoria (06/11/2026) — sem timeout explícito, uma queda do Mongo deixava
    // requisições penduradas por ~30s (default do driver) antes de falhar. serverSelectionTimeoutMS
    // cobre a conexão inicial/reconexão (falha rápido se o banco estiver fora do ar);
    // socketTimeoutMS cobre uma query em andamento numa conexão que já estava boa.
    await mongoose.connect(environment.db.url, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 20000,
    });
  }

  // Achado de auditoria (06/11/2026) — nenhum listener em 'error'/'disconnected' significava
  // nenhum log avisando "perdi conexão com o banco" quando isso acontecia.
  private registerConnectionListeners(): void {
    if (this.listenersRegistered) return;
    this.listenersRegistered = true;

    mongoose.connection.on('error', (error) => {
      console.error('[mongo] erro na conexão:', error);
    });
    mongoose.connection.on('disconnected', () => {
      console.warn('[mongo] conexão perdida — tentando reconectar...');
    });
    mongoose.connection.on('reconnected', () => {
      console.log('[mongo] conexão reestabelecida');
    });
  }
}
