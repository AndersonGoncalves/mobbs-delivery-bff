import restify, { Server as RestifyServer } from 'restify';

import { environment } from '../config/environment';
import { MongooseConnection } from '../database/mongoose.connection';
import type { BaseRouter } from '../router/base.router';
import { BUILD_VERSION } from '../../buildInfo';
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
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      // Achado da auditoria pré-produção (31/10/2026) — "listas carregam tudo de uma vez;
      // paginação só no front": `X-Total-Count` (total de registros, nunca o total da página)
      // pros endpoints paginados (produtos, clientes, financeiro); sem isto, o CORS bloqueia o
      // JavaScript do navegador de LER um header customizado da resposta, mesmo ele estando lá
      // ("CORS-safelisted" cobre só Content-Type/Content-Length/etc., nunca um header próprio).
      res.header('Access-Control-Expose-Headers', 'X-Total-Count');
      return next();
    });

    // mobbs-delivery-web (browser) faz preflight OPTIONS antes de qualquer request autenticado
    // (ex.: Authorization header) — sem uma rota OPTIONS real, o Restify responde 404 sem os
    // headers de CORS e o navegador bloqueia a request real com "preflight doesn't pass access
    // control check", mesmo com os headers acima no `pre()`. O app Flutter nunca disparou esse
    // bug porque requisição nativa não faz preflight de navegador.
    this.application.opts('/*', (_req, res, next) => {
      res.send(204);
      return next();
    });

    this.application.on('restifyError', handleError);
  }

  /**
   * `migrations` (specs/0021-papeis-operador REQ-7/T002) rodam sempre depois de conectar ao
   * Mongo e sempre ANTES de qualquer rota ser registrada — nenhuma requisição chega a um
   * documento ainda não migrado.
   */
  async bootstrap(routers: BaseRouter[], migrations: Array<() => Promise<void>> = []): Promise<void> {
    await MongooseConnection.getInstance().connect();

    for (const migration of migrations) {
      await migration();
    }

    routers.forEach((router) => router.initializeRoutes(this.application));

    this.application.listen(environment.server.port, () => {
      // eslint-disable-next-line no-console
      console.log(`mobbs-delivery-bff ouvindo na porta ${environment.server.port}`);
      // eslint-disable-next-line no-console
      console.log(`mobbs-delivery-bff — versão ${BUILD_VERSION}`);
    });
  }
}
