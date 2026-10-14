import type { Request, Response, Server } from 'restify';
import { NotFoundError, UnprocessableEntityError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { buildReceiptLines } from '../domain/build-receipt-lines';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0139-impressao-automatica-bridge — duas famílias de rotas:
 * - `/restaurants/me/print-queue/...`: autenticadas pelo bridge local (`printApiKeyMiddleware`,
 *   header `X-Print-Api-Key`, REQ-2/REQ-3), listam e confirmam a impressão de pedidos.
 * - `/restaurants/me/auto-print/...`: autenticadas pelo operador logado (REQ-5/REQ-6/REQ-7),
 *   configuração visível na retaguarda ("Impressão automática").
 */
export class AutoPrintController extends BaseRouter {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly customerRepository: ICustomerRepository,
    private readonly printApiKeyMiddleware: AsyncHandler,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const bridgeAuthenticated: AsyncHandler[] = [this.printApiKeyMiddleware];
    const operatorAuthenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
    ];

    // REQ-2/REQ-4 — lista os pedidos pendentes já no formato pronto pra imprimir (`ReceiptLine[]`),
    // junto do intervalo de consulta configurado (REQ-5) pra o bridge ajustar o próprio loop sem
    // precisar de uma segunda chamada.
    application.get('/restaurants/me/print-queue/pending', ...bridgeAuthenticated, async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.findById(req.restaurantId!);

      // specs/0143-correcao-gatilho-impressao-automatica T004 — achado testando em produção: o
      // switch "Impressão automática" (REQ-5 de specs/0139) estava salvo mas nunca checado aqui,
      // então desligar o switch não parava nada. Desligado -> fila sempre vazia, sem erro (o
      // bridge continua rodando e consultando no intervalo configurado; volta a receber pedidos
      // assim que o operador ligar de novo, sem precisar reiniciar o bridge).
      if (!restaurant!.autoPrintEnabled) {
        res.json(200, { pollIntervalSeconds: restaurant!.autoPrintIntervalSeconds, orders: [] });
        return;
      }

      const orders = await this.orderRepository.findPendingAutoPrint(req.restaurantId!);

      const pending = await Promise.all(
        orders.map(async (order) => {
          const customer = await this.customerRepository.findById(order.customerId);
          return { orderId: order.id, lines: buildReceiptLines(order, restaurant!, customer) };
        }),
      );

      res.json(200, { pollIntervalSeconds: restaurant!.autoPrintIntervalSeconds, orders: pending });
    });

    // REQ-3 — idempotente: confirmar de novo o mesmo pedido não dá erro nem reimprime.
    application.post('/restaurants/me/print-queue/:orderId/printed', ...bridgeAuthenticated, async (req: Request, res: Response) => {
      await this.orderRepository.markAutoPrinted(req.params.orderId, req.restaurantId!);
      res.send(204);
    });

    // REQ-6/REQ-7 — regenerar invalida a chave anterior (a antiga simplesmente não casa mais com
    // nenhum restaurante em `findByAutoPrintApiKey`).
    application.post('/restaurants/me/auto-print/regenerate-key', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.regenerateAutoPrintApiKey(req.restaurantId!);
      res.json(200, { autoPrintApiKey: restaurant.autoPrintApiKey });
    });

    // specs/0147-impressao-manual-direta-bridge REQ-1/REQ-2/REQ-3 — mesmas linhas da fila
    // automática, só que sob demanda pra um pedido específico: o botão "Imprimir" da retaguarda
    // usa isso pra mandar pro bridge local imprimir na hora, em vez de abrir o diálogo do
    // navegador. Só delivery/pickup (mesmo escopo de `buildReceiptLines`) — mesa/balcão tem um
    // formato de totais diferente, fora de escopo aqui.
    application.get('/restaurants/me/orders/:orderId/receipt-lines', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const order = await this.orderRepository.findById(req.params.orderId);
      if (!order || order.restaurantId !== req.restaurantId) {
        throw new NotFoundError('Pedido não encontrado');
      }
      if (order.orderType === 'table') {
        throw new UnprocessableEntityError('Impressão direta não suporta pedido de mesa/balcão');
      }

      const restaurant = await this.restaurantRepository.findById(req.restaurantId!);
      const customer = await this.customerRepository.findById(order.customerId);
      res.json(200, { lines: buildReceiptLines(order, restaurant!, customer) });
    });
  }
}
