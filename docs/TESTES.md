# Testes do `mobbs-delivery-bff`

Guia de como rodar os testes automatizados do BFF. Para subir o BFF em si, veja o
[`README.md`](./README.md) e `../mobbs-delivery-app/rodar-local/README.md`.

## Visão geral

| Item | Valor |
|---|---|
| Framework | **Jest 29** + **ts-jest** (TypeScript direto, sem build prévio) |
| Config | [`jest.config.js`](./jest.config.js) — `testEnvironment: node`, `testMatch: **/*.spec.ts` |
| Onde ficam os testes | `*.spec.ts` ao lado do código (`src/modules/<modulo>/{domain,infra,presentation}/`) |
| Tamanho atual | ~91 arquivos / ~950 testes, ≈ 1,5 min |
| Dependências externas | **Nenhuma** — Mongo, Firebase e AWS são mockados. Não precisa de Docker, `.env` nem `firebase-service-account.json` |

Pré-requisito: `npm install` (Node 20).

## Rodando pelo terminal

```bash
cd mobbs-delivery-bff

npm test                                   # todos os testes (jest --passWithNoTests)
npx jest src/modules/orders                # só uma pasta/módulo
npx jest src/modules/auto-print/presentation/auto-print.controller.spec.ts   # um arquivo
npx jest -t "AC-3"                         # só testes cujo nome contém "AC-3"
npx jest --watch                           # re-roda ao salvar (só os arquivos afetados pelo git diff)
npx jest --verbose                         # lista cada teste
npx jest --runInBand                       # um processo só (útil pra depurar ou em máquina fraca)
npx jest --listTests                       # só lista os arquivos de teste, sem rodar
```

### Cobertura

O Jest já traz cobertura embutida (a pasta `coverage/` está no `.gitignore`):

```bash
npx jest --coverage                                   # tabela por arquivo + coverage/lcov-report/index.html
npx jest src/modules/orders --coverage --coverageReporters=text-summary   # só um resumo
```

### Gates antes de abrir PR (os mesmos do dia a dia)

```bash
npm run lint && npm test && npm run build
```

## Rodando pelo VS Code (painel **Testing**, igual ao do Flutter)

O painel *Testing* do VS Code é genérico: o Flutter/Dart aparece nele pela extensão do Dart, e o
Jest aparece por uma extensão própria.

1. Instale a extensão **Jest** (`orta.vscode-jest`).
2. Abra a pasta `mobbs-delivery-bff` (ou, num workspace com várias pastas, configure a raiz do Jest
   em `.vscode/settings.json` — a pasta `.vscode/` é ignorada pelo Git, é só da sua máquina):

   ```json
   {
     "jest.rootPath": "/home/anderson/DevPrograms/Projetos/delivery/mobbs-delivery-bff",
     "jest.jestCommandLine": "npx jest",
     "jest.runMode": "on-demand"
   }
   ```

   `on-demand` roda só quando você clica (com ~950 testes, o modo automático é pesado).
3. Os testes aparecem no painel *Testing* em árvore (`src/modules/...`), com ▶ por teste/arquivo/
   pasta, ícones de ✔/✖ e *Debug Test*. Também aparece o ▶ em cima de cada `it(...)`/`describe(...)`
   dentro do arquivo `.spec.ts`.

## Melos?

**Não.** O Melos é uma ferramenta do ecossistema **Dart/Flutter** (lê `pubspec.yaml`) e não
enxerga projetos Node. Aqui o equivalente é o próprio `npm` (scripts do `package.json`), e para
rodar os 4 projetos de uma vez veja a seção "Resumo" de
`../mobbs-delivery-app/rodar-local/README.md`.

## Como os testes são escritos

- Controllers são testados com os **repositórios mockados** (`jest.fn()`), chamando a cadeia de
  middlewares da rota — sem subir servidor HTTP nem banco.
- Exceção deliberada: repositórios Mongoose só têm spec quando a query em si precisa ser validada
  (ex.: `order.mongoose.repository.spec.ts`), mockando o `Model`.
- Nomes dos testes citam a spec e o critério de aceite (`specs/0164 AC-1: ...`) — facilita rodar
  por `-t "specs/0164"`.
- Convenções gerais e fluxo SDD: `../mobbs-delivery-app/specs/README.md`.

## Problemas comuns

| Sintoma | Causa / solução |
|---|---|
| Teste passa sozinho e falha na suíte inteira | Estado compartilhado entre testes — confira `jest.clearAllMocks()`/`restoreAllMocks` e `jest.useRealTimers()` no `afterEach` |
| `console.error` no meio da saída verde | Esperado em testes que cobrem o caminho de erro (ex.: falha de WhatsApp/financeiro "fire-and-forget"); só é problema se o teste falhar |
| Lentidão no 1º run | ts-jest compila e guarda cache; os runs seguintes são mais rápidos |
