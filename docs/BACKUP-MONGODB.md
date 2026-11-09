# Backup do MongoDB de produção

> Achado real da auditoria pré-produção de 06/11/2026: o relatório apontou "nenhuma rotina de
> backup" porque uma auditoria de código não enxerga o que só existe no servidor. A rotina já
> rodava via `crontab` na EC2 antes daquela data — só nunca tinha sido commitada neste repositório
> nem documentada. Este arquivo + `scripts/backup-mongo.sh` fecham essa lacuna.

## O que roda e onde

Instância EC2 de produção (`54.87.117.64`), usuário `ubuntu`, crontab:

```
0 3 * * * /home/ubuntu/backup-mongo.sh >> /home/ubuntu/backup-mongo.log 2>&1
```

O cron aponta hoje pro arquivo solto `/home/ubuntu/backup-mongo.sh`, **fora** do clone do repo em
`/home/ubuntu/mobbs-delivery-bff` — por isso o script nunca tinha sido versionado antes. Este
arquivo (`scripts/backup-mongo.sh`) é a fonte de verdade a partir de agora: qualquer alteração
precisa ser copiada manualmente pro servidor depois (`scp` ou `ssh ... "cat > ..."`). Melhoria
futura óbvia: trocar a linha do cron pra apontar direto pro clone
(`/home/ubuntu/mobbs-delivery-bff/scripts/backup-mongo.sh`), eliminando esse passo manual — não
feito agora pra não mexer em mais infra de produção do que o necessário nesta rodada.

Todo dia às 3h (horário do servidor, UTC), `scripts/backup-mongo.sh`:

1. Roda `mongodump --db mobbs-delivery --archive --gzip` dentro do container
   `mobbs-delivery-bff-mongo-1` e envia o resultado direto pro S3 via stream
   (`docker exec ... | aws s3 cp -`) — nunca grava o dump em disco no host.
2. Salva em `s3://mobbs-delivery-images/backups/mongodb/mobbs-delivery_<timestamp>.archive.gz`.
3. Aplica retenção: todo backup dos últimos 14 dias fica; depois disso, só o mais antigo de cada
   mês (a "foto" mensal) é mantido, e só até 12 meses atrás — o resto é removido.

A instância precisa de uma IAM role (ou credenciais no `~/.aws` do usuário `ubuntu`) com
`s3:PutObject`/`s3:GetObject`/`s3:ListBucket`/`s3:DeleteObject` no bucket
`mobbs-delivery-images`, prefixo `backups/mongodb/*` — já configurado na instância atual.

## Configurar num servidor novo

Depois de clonar/atualizar o repo em `/home/ubuntu/mobbs-delivery-bff` no servidor:

```bash
chmod +x /home/ubuntu/mobbs-delivery-bff/scripts/backup-mongo.sh
crontab -e
# adicionar a linha:
# 0 3 * * * /home/ubuntu/mobbs-delivery-bff/scripts/backup-mongo.sh >> /home/ubuntu/backup-mongo.log 2>&1
```

Rodar uma vez manualmente pra confirmar que não tem erro antes de confiar no cron:

```bash
/home/ubuntu/mobbs-delivery-bff/scripts/backup-mongo.sh
tail -f /home/ubuntu/backup-mongo.log
```

## Restaurar um backup

**Nunca restaure direto por cima do container de produção** (`mobbs-delivery-bff-mongo-1`) sem
necessidade real — `mongorestore` sem `--drop` mescla em vez de substituir, o que pode deixar o
banco num estado inconsistente. Pra testar/auditar um backup, restaure num container descartável
primeiro (passo a passo abaixo). Só restaure por cima da produção numa recuperação de desastre de
verdade, com o time ciente.

```bash
# 1. Baixa o backup desejado do S3 (listar: aws s3 ls s3://mobbs-delivery-images/backups/mongodb/)
aws s3 cp s3://mobbs-delivery-images/backups/mongodb/mobbs-delivery_<timestamp>.archive.gz /tmp/restore.archive.gz

# 2. Sobe um Mongo descartável, isolado da produção (sem publicar porta, sem volume nomeado)
docker run -d --rm --name mongo-restore-check mongo:7

# 3. Copia o dump pro container e restaura
docker cp /tmp/restore.archive.gz mongo-restore-check:/tmp/restore.archive.gz
docker exec mongo-restore-check mongorestore --archive=/tmp/restore.archive.gz --gzip

# 4. Confere (ajuste a coleção/contagem esperada conforme o que você sabe que deveria estar lá)
docker exec mongo-restore-check mongosh --quiet mobbs-delivery --eval \
  'db.getCollectionNames().length + " coleções, " + db.restaurant.countDocuments() + " restaurante(s)"'

# 5. Derruba o container descartável (--rm já remove ao parar) e limpa o arquivo local
docker stop mongo-restore-check
rm /tmp/restore.archive.gz
```

Pra restaurar de verdade por cima da produção (recuperação de desastre), troque o passo 2 por
apontar pro Mongo real (`docker exec mobbs-delivery-bff-mongo-1 mongorestore --drop ...` com as
credenciais do `.env`) — com o BFF parado antes (`docker compose stop api`) pra ninguém escrever
no banco durante a restauração.

## Teste de restore já realizado

09/11/2026 — restaurado o backup `mobbs-delivery_2026-11-09_03-00-01.archive.gz` (o mais recente
na época) num container `mongo:7` descartável, isolado, sem tocar na produção. Contagem de
documentos por coleção bateu com o que o próprio log do `mongodump` daquele dia reportou
(`backup-mongo.log`). Backup confirmado restaurável.
