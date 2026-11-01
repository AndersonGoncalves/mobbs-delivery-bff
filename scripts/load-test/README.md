# Teste de carga

## RESUMO

### Fase A — popular o banco (sempre que quiser uma base "fresca")

```bash
cd mobbs-delivery-bff

# garante que o container do mongo está com memória suficiente pro load de ~2,7M docs
docker compose -f docker-compose.yml -f docker-compose.loadtest.yml up -d mongo

# apaga e repopula (pede confirmação digitando "APAGAR")
npm run loadtest:seed
```

Isso sozinho já te dá um banco no tamanho real de 1 ano de uso (~500 restaurantes, 300k
clientes, ~2,7M pedidos, ~6,6min). Se é só isso que você quer medir (tamanho/forma do banco),
pode parar aqui.

### Fase B — tráfego de verdade contra a API (3 terminais)

**Terminal 1** — emulador do Firebase (autenticação dos clientes sintéticos, 100% local):

```bash
npm run loadtest:emulator
```

**Terminal 2** — uma instância da API apontada pra esse emulador (porta 3099, separada da API
normal do docker-compose que fica na 3001 — essa roda direto no host, não em container):

```bash
npm run loadtest:api
```

**Terminal 3** — gera a amostra de restaurantes/clientes + os tokens de autenticação (precisa do
Terminal 1 já rodando):

```bash
npm run loadtest:fixtures
```

Depois disso, roda o k6 de fato (ainda no terminal 3, ou um 4º):

```bash
# validação rápida antes da rodada de verdade (3 usuários virtuais, 15s)
docker run --rm --network=host -e SMOKE=1 -e API_BASE_URL=http://localhost:3099 \
  -v "$PWD/scripts/load-test/k6":/work -w /work grafana/k6 run scenario.js

# rodada completa (sobe até 50 usuários virtuais simultâneos, ~4 minutos)
docker run --rm --network=host -e API_BASE_URL=http://localhost:3099 \
  -v "$PWD/scripts/load-test/k6":/work -w /work grafana/k6 run scenario.js
```

No final o k6 imprime latência (p95), taxa de erro e se passou nos thresholds (hoje: erro <1%,
p95 <800ms).

Dica: antes da rodada completa, rode sempre primeiro a validação rápida (`SMOKE=1`) — confirma
em segundos que auth/endpoints estão certos, sem esperar os ~4 minutos do perfil completo.

O resto deste documento detalha cada passo (o porquê de cada decisão, o que é limpo/populado,
limitações conhecidas, números medidos).

# Teste de carga — Fase A (seed)

Popula a base LOCAL com ~1 ano de movimentação sintética, na escala combinada em 2026-10-31
(ver `config.ts`). Serve pra deixar o banco no tamanho/formato que ele teria em produção depois
de 1 ano de uso, antes de rodar tráfego de verdade contra a API (Fase B, ainda não
implementada).

## Toda vez que eu quiser rodar o teste de carga, preciso popular de novo?

**Sim.** O script não é incremental — ele **sempre apaga e recria do zero** as coleções que
gerencia (ver "O que é limpo" abaixo). É assim de propósito: pra cada rodada do teste de carga
partir de uma base no mesmo estado conhecido (reprodutível, comparável entre rodadas).

## Como rodar

```bash
npm run loadtest:seed
```

Pede confirmação (digitar `APAGAR`) antes de limpar. Pra pular a confirmação (ex.: automação):

```bash
npm run loadtest:seed -- --yes
```

A seed do gerador de números aleatórios é fixa por padrão (banco reproduzível entre rodadas).
Pra gerar uma variação diferente:

```bash
npm run loadtest:seed -- --yes --seed=42
```

Antes de rodar, confirme que o `mongo` local está com os limites de memória do teste de carga
aplicados (ver próxima seção) — sem isso o seed de ~2,7M de pedidos pode ficar bem mais lento ou
o container reiniciar por OOM.

## Limites de memória do container `mongo`

O `docker-compose.yml` da raiz mantém os limites calibrados pra EC2 de produção (300MB/350MB,
ver comentários lá) — **nunca editar aquele arquivo** pra isso. Pra aplicar os limites maiores
(`mem_limit: 4g`, `wiredTigerCacheSizeGB: 2`) ao container local:

```bash
docker compose -f docker-compose.yml -f docker-compose.loadtest.yml up -d mongo
```

Isso recria o container `mongo` (dados em disco/volume são preservados, só o processo reinicia
com o novo limite). **Atenção**: se depois disso você rodar um `docker compose up` normal (sem
o override), o próximo restart do serviço `mongo` volta aos limites de produção.

## O que é limpo/populado

Só as coleções que este seeder gerencia (`reset.ts`) — nenhuma outra coleção do banco (ex.:
configuração, feature flags) é tocada:

- `restaurant`, `menuCategory`, `product`, `rawMaterial`
- `customer`, `address`
- `order`, `payment`, `order_counter`

`order_counter` é escrito com o `seq` final de cada restaurante ao fim do seed, pra pedidos
novos feitos pelo app de verdade depois continuarem a numeração sem colidir com os sintéticos.

## Tempo e tamanho medidos (2026-10-31, nesta máquina)

- ~6,6 min
- 500 restaurantes, 300.000 clientes, ~2,74 milhões de pedidos
- dataSize 3,37 GB / storageSize 1,49 GB / indexSize 1,10 GB (~2,6 GB em disco)

## Limitações conhecidas (v1)

- `Product.additionalGroups` sempre vazio (simplificação deliberada, não afeta tamanho/formato
  do banco de forma relevante).
- Não gera coleções secundárias que a estimativa original considerava (stock movements,
  cashback, cupons, notificações, mensagens WhatsApp) — por isso o banco ficou menor que a
  faixa de 9-12GB estimada originalmente. Pode ser estendido depois se precisar bater aquele
  tamanho.
- Restaurantes sintéticos são gerados com `businessHours` aberto 24/7 (senão
  `isRestaurantOpenNow()` rejeitaria qualquer pedido sintético da Fase B com 409).

# Teste de carga — Fase B (k6)

Gera tráfego HTTP concorrente contra a API do BFF (resolver restaurante, ver cardápio, criar
pedido, listar meus pedidos, rastrear pedido), medindo latência/erro sob carga.

## Por que precisa de um emulador do Firebase

Toda rota de cliente (`firebaseAuthMiddleware`) exige um ID token real do Firebase. Os clientes
sintéticos da Fase A não existem no Firebase de verdade, então não dá pra autenticar como eles
pelo fluxo normal. A solução (depois de testada e confirmada ponta a ponta): o **Firebase Auth
Emulator**, 100% local — zero custo, zero efeito no projeto Firebase real. O Admin SDK detecta a
variável `FIREBASE_AUTH_EMULATOR_HOST` e redireciona `createCustomToken`/`verifyIdToken` pro
emulador automaticamente, sem mudar nenhum código do BFF.

## Passo a passo

Precisa de 3 processos rodando ao mesmo tempo (deixe cada um no seu terminal, ou em background):

```bash
# 1. Emulador de Auth (só precisa rodar uma vez, pode ficar de pé entre rodadas)
npm run loadtest:emulator

# 2. Uma instância da API apontada pro emulador, em porta separada da do docker-compose
#    (não sobe em container — reusa o .env normal, só sobrescreve SERVER_PORT/
#    FIREBASE_AUTH_EMULATOR_HOST)
npm run loadtest:api

# 3. Gera a amostra de restaurantes/produtos (lida do banco já populado na Fase A) + o pool de
#    ID tokens válidos (precisa do emulador já rodando)
npm run loadtest:fixtures
```

Isso grava `scripts/load-test/k6/fixtures.json` (não commitado — está no `.gitignore`).

## Rodando o k6

Instalar o binário (`sudo apt install k6` ou baixar do GitHub releases) OU, sem instalar nada,
via Docker (imagem oficial `grafana/k6`):

```bash
# validação rápida (3 VUs, 15s) — confirma que auth/endpoints estão certos antes da rodada de verdade
docker run --rm --network=host -e SMOKE=1 -e API_BASE_URL=http://localhost:3099 \
  -v "$PWD/scripts/load-test/k6":/work -w /work grafana/k6 run scenario.js

# rodada completa (perfil de stages em scenario.js: ramp até 50 VUs por ~4min)
docker run --rm --network=host -e API_BASE_URL=http://localhost:3099 \
  -v "$PWD/scripts/load-test/k6":/work -w /work grafana/k6 run scenario.js
```

`--network=host` deixa o container do k6 alcançar a API que está rodando direto no host (porta
3099, fora de container). Resultado final: `http_req_duration` (p95), taxa de erro, e os
thresholds definidos em `scenario.js` (hoje: erro <1%, p95 <800ms — ajuste conforme a realidade
medida).

## Limitações conhecidas (Fase B, v1)

- Amostra só 50 restaurantes e 300 clientes (de 500/300mil) pra gerar tokens/fixtures — amostra
  suficiente pra gerar carga concorrente real, não testa TODOS os registros.
- Cobre só 4 rotas (`resolve`, `menu-categories`, `POST /orders`, `GET /orders`, `track`) — as
  mais representativas do fluxo do cliente, não a API inteira (painel do operador, KDS, totem
  etc. ficam fora por ora).
