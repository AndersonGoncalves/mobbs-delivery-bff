/**
 * specs/0200-build-number-automatico-deploy — sobrescrito pelo CI
 * (`.github/workflows/publish-image.yml`) a cada publicação, com a versão do `package.json` +
 * a contagem de commits como build number. O valor abaixo só aparece em desenvolvimento local
 * (`npm run dev`/`npm start` sem passar pelo CI).
 */
export const BUILD_VERSION = '0.1.0+dev';
