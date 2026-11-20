/**
 * `@whiskeysockets/baileys` é um pacote ESM-only (`"type": "module"` no `package.json` dele) —
 * este BFF compila pra CommonJS (`tsconfig.json`, `module: "commonjs"`). Um `import()` dinâmico
 * "normal" pareceria resolver isso, mas o TypeScript **reescreve** `import()` dinâmico pra
 * `Promise.resolve().then(() => require(...))` quando o alvo de compilação é `module:
 * "commonjs"` (confirmado direto no `dist/` gerado) — e `require()` de um pacote ESM-only lança
 * `ERR_REQUIRE_ESM` em runtime. `new Function('specifier', 'return import(specifier)')` é o
 * contorno padrão documentado pra esse cenário: o corpo da função é uma **string**, opaca pro
 * compilador — ele não enxerga o `import()` ali dentro pra reescrever. Em runtime, o Node.js
 * executa um `import()` de verdade.
 */
type BaileysModule = typeof import('@whiskeysockets/baileys');

// eslint-disable-next-line @typescript-eslint/no-implied-eval
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<BaileysModule>;

let baileysModulePromise: Promise<BaileysModule> | null = null;

export function loadBaileys(): Promise<BaileysModule> {
  baileysModulePromise ??= dynamicImport('@whiskeysockets/baileys');
  return baileysModulePromise;
}

/**
 * Achado real, pedido explícito do usuário (20/11/2026) — QR Code sempre renovando, nunca
 * conectando (nem WhatsApp normal nem Business, o protocolo é o mesmo pros dois): `makeWASocket`
 * nunca recebia `version`, então o Baileys usava o valor **fixo, embutido no pacote** desde que
 * foi publicado (`Defaults/index.js`, `WA_VERSION`). O WhatsApp muda a versão exigida do
 * protocolo com frequência, mais rápido do que o pacote recebe release no npm — com a versão
 * embutida desatualizada, o servidor recusa a conexão logo depois do QR ser lido, o socket cai
 * (`restartRequired`), o código já reconecta automaticamente nesse caso... gerando um QR novo e
 * caindo no mesmo problema de novo, em loop.
 *
 * `fetchLatestBaileysVersion()` (já parte do pacote, só nunca era chamada) busca a versão certa
 * no repositório oficial do Baileys em tempo real. Nunca lança — se a busca falhar (rede fora),
 * já cai sozinha de volta pro valor embutido (`isLatest: false`), então é seguro chamar sem
 * try/catch aqui. Cacheada por processo (mesmo padrão de `loadBaileys` acima): não faz sentido
 * buscar de novo a cada reconexão de cada restaurante — a versão não muda nesse intervalo, e
 * evita bater no GitHub repetidamente num reconector com backoff.
 */
let baileysVersionPromise: Promise<[number, number, number]> | null = null;

export function getBaileysVersion(): Promise<[number, number, number]> {
  baileysVersionPromise ??= loadBaileys().then(async ({ fetchLatestBaileysVersion }) => {
    const { version } = await fetchLatestBaileysVersion();
    return version as [number, number, number];
  });
  return baileysVersionPromise;
}
