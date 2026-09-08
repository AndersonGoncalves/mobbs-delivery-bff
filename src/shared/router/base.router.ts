import type { Server } from 'restify';
import { NotFoundError } from 'restify-errors';

export abstract class BaseRouter {
  abstract initializeRoutes(application: Server): void;

  protected render<T>(data: T | null | undefined): T {
    if (data === null || data === undefined) {
      throw new NotFoundError('Registro não encontrado');
    }
    return data;
  }
}
