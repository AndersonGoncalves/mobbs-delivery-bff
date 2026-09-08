import mongoose from 'mongoose';

import { environment } from '../config/environment';

export class MongooseConnection {
  private static instance: MongooseConnection;

  private constructor() {}

  static getInstance(): MongooseConnection {
    if (!MongooseConnection.instance) {
      MongooseConnection.instance = new MongooseConnection();
    }
    return MongooseConnection.instance;
  }

  async connect(): Promise<void> {
    await mongoose.connect(environment.db.url);
  }
}
