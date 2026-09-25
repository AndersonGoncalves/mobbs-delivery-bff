import { buildDefaultShareMessage } from './default-share-message';

describe('buildDefaultShareMessage (specs/0072)', () => {
  it('cita o nome do restaurante e termina apontando pro link que o app anexa embaixo', () => {
    const message = buildDefaultShareMessage('Meu Restaurante');

    expect(message).toContain('o cardápio do Meu Restaurante!');
    expect(message.endsWith('👇')).toBe(true);
    expect(message).not.toContain('http');
  });
});
