import { Server } from './shared/http/server';

const server = new Server();

server.bootstrap([]).catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Falha ao iniciar o servidor:', error);
  process.exit(1);
});
