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
