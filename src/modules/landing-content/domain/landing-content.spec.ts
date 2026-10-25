import { extractYoutubeId } from './landing-content';

describe('extractYoutubeId - 0183', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ?t=10',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'https://youtube.com/shorts/dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x',
  ])('extrai o id de %s', (url) => {
    expect(extractYoutubeId(url)).toBe('dQw4w9WgXcQ');
  });

  it.each([
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=curto',
    'https://www.youtube.com/',
    'javascript:alert(1)',
    'não é url',
  ])('rejeita %s', (url) => {
    expect(extractYoutubeId(url)).toBeNull();
  });
});
