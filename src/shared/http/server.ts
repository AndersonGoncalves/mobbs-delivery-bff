import restify, { Server as RestifyServer } from 'restify';

import { environment } from '../config/environment';
import { MongooseConnection } from '../database/mongoose.connection';
import type { BaseRouter } from '../router/base.router';
import { handleError } from './error.handler';

export class Server {
  private readonly application: RestifyServer;

  constructor() {
    this.application = restify.createServer({
      name: 'mobbs-delivery-bff',
      formatters: {
        'application/json': (_req, _res, body) => {
          if (body instanceof Error) {
            const err = body as Error & { toJSON?: () => unknown };
            return JSON.stringify(err.toJSON ? err.toJSON() : { message: err.message });
          }
          return JSON.stringify(body);
        },
      },
    });

    this.application.use(restify.plugins.acceptParser(this.application.acceptable));
    this.application.use(restify.plugins.queryParser());
    this.application.use(restify.plugins.bodyParser());

    this.application.pre((_req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return next();
    });

    this.application.on('restifyError', handleError);
  }

  async bootstrap(routers: BaseRouter[]): Promise<void> {
    await MongooseConnection.getInstance().connect();

    routers.forEach((router) => router.initializeRoutes(this.application));

    this.application.listen(environment.server.port, () => {
      // eslint-disable-next-line no-console
      console.log(`mobbs-delivery-bff ouvindo na porta ${environment.server.port}`);
    });
  }
}
