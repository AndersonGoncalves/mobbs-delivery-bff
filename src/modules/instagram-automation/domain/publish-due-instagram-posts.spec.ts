import { PublishDueInstagramPostsService } from './publish-due-instagram-posts';
import { IInstagramPost } from './entities/instagram-post.entity';
import { IInstagramPostRepository } from './repositories/instagram-post.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IRestaurant } from '../../restaurants/domain/entities/restaurant.entity';
import { FacebookGraphClient } from '../infra/facebook-graph-client';

function buildPost(overrides: Partial<IInstagramPost> = {}): IInstagramPost {
  return {
    id: 'post-1',
    restaurantId: 'r-1',
    imageUrl: 'https://cdn.example.com/foto.jpg',
    caption: 'Promoção de hoje!',
    scheduledAt: '2026-10-27T12:00:00.000Z',
    status: 'agendado',
    createdAt: '2026-10-27T10:00:00.000Z',
    ...overrides,
  };
}

function buildRestaurant(overrides: Partial<IRestaurant> = {}): IRestaurant {
  return {
    id: 'r-1',
    name: 'Prime Pizza',
    slug: 'prime-pizza',
    isActive: true,
    businessHours: [],
    minimumOrderValue: 0,
    instagramAccessToken: 'page-token',
    instagramAccountId: 'ig-1',
    ...overrides,
  } as IRestaurant;
}

describe('PublishDueInstagramPostsService (follow-up — automação de postagens no Instagram)', () => {
  function setup() {
    const postRepository: jest.Mocked<IInstagramPostRepository> = {
      create: jest.fn(),
      findById: jest.fn(),
      listByRestaurant: jest.fn(),
      delete: jest.fn(),
      listDue: jest.fn().mockResolvedValue([]),
      markPublished: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findById: jest.fn().mockResolvedValue(buildRestaurant()),
    };
    const graphClient: Partial<FacebookGraphClient> = {
      createMediaContainer: jest.fn().mockResolvedValue('container-1'),
      publishMedia: jest.fn().mockResolvedValue('media-1'),
    };
    const service = new PublishDueInstagramPostsService(
      postRepository,
      restaurantRepository as IRestaurantRepository,
      graphClient as FacebookGraphClient,
    );
    return { postRepository, restaurantRepository, graphClient, service };
  }

  it('publica cada postagem vencida, criando o container e publicando em seguida', async () => {
    const { postRepository, graphClient, service } = setup();
    postRepository.listDue.mockResolvedValue([buildPost()]);

    await service.run(new Date('2026-10-27T12:05:00.000Z'));

    expect(graphClient.createMediaContainer).toHaveBeenCalledWith('page-token', 'ig-1', 'https://cdn.example.com/foto.jpg', 'Promoção de hoje!');
    expect(graphClient.publishMedia).toHaveBeenCalledWith('page-token', 'ig-1', 'container-1');
    expect(postRepository.markPublished).toHaveBeenCalledWith('post-1', expect.any(String));
    expect(postRepository.markFailed).not.toHaveBeenCalled();
  });

  it('marca como falhou (sem derrubar o processo) quando o restaurante não tem mais Instagram vinculado', async () => {
    const { postRepository, restaurantRepository, service } = setup();
    postRepository.listDue.mockResolvedValue([buildPost()]);
    (restaurantRepository.findById as jest.Mock).mockResolvedValue(buildRestaurant({ instagramAccessToken: undefined, instagramAccountId: undefined }));

    await service.run();

    expect(postRepository.markFailed).toHaveBeenCalledWith('post-1', expect.stringContaining('não está mais vinculado'));
    expect(postRepository.markPublished).not.toHaveBeenCalled();
  });

  it('marca como falhou quando a Graph API rejeita a publicação, com a mensagem do erro', async () => {
    const { postRepository, graphClient, service } = setup();
    postRepository.listDue.mockResolvedValue([buildPost()]);
    (graphClient.publishMedia as jest.Mock).mockRejectedValue(new Error('Graph API (POST /ig-1/media_publish) respondeu 400: token expirado'));

    await service.run();

    expect(postRepository.markFailed).toHaveBeenCalledWith('post-1', expect.stringContaining('token expirado'));
  });

  // Achado real esperado deste tipo de publicador em lote — um item ruim não pode travar os bons.
  it('uma postagem com falha não impede as demais de serem publicadas', async () => {
    const { postRepository, graphClient, service } = setup();
    postRepository.listDue.mockResolvedValue([buildPost({ id: 'post-1' }), buildPost({ id: 'post-2' })]);
    (graphClient.createMediaContainer as jest.Mock).mockRejectedValueOnce(new Error('falha na 1ª')).mockResolvedValueOnce('container-2');

    await service.run();

    expect(postRepository.markFailed).toHaveBeenCalledWith('post-1', expect.stringContaining('falha na 1ª'));
    expect(postRepository.markPublished).toHaveBeenCalledWith('post-2', expect.any(String));
  });
});
