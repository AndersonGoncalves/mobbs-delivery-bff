#!/bin/bash
# Backup diário do MongoDB de produção — achado real da auditoria pré-produção de 06/11/2026
# (relatório apontou "nenhuma rotina de backup"; na verdade já existia, rodando via cron na EC2
# desde antes daquela auditoria, só nunca tinha sido commitado — por isso o relatório não achou).
#
# Roda via crontab do usuário `ubuntu` na instância EC2 (`crontab -l`), hoje apontando pro arquivo
# solto `/home/ubuntu/backup-mongo.sh` (fora do clone do repo — por isso nunca tinha sido
# versionado). Este arquivo aqui é a fonte de verdade: ao editar, copie o conteúdo pro servidor
# (`scp`/`ssh` + `cat >`) — ver docs/BACKUP-MONGODB.md pro procedimento e pra ideia de, numa
# próxima melhoria, apontar o cron direto pro clone (`/home/ubuntu/mobbs-delivery-bff/scripts/
# backup-mongo.sh`) e eliminar esse passo manual de sincronização.
#
# O que faz: `mongodump` do banco `mobbs-delivery` de dentro do container (nunca sai como arquivo
# no disco do host — stream direto `docker exec | aws s3 cp -`), salvo em
# s3://mobbs-delivery-images/backups/mongodb/mobbs-delivery_<timestamp>.archive.gz.
#
# Retenção (ajuste 09/11/2026, pedido explícito do usuário — a versão anterior só mantinha os 5
# mais recentes, ~5 dias de histórico, sem nenhuma camada de longo prazo):
#   - diário: todo backup dos últimos 14 dias fica.
#   - mensal: pra backups com mais de 14 dias, mantém só o mais antigo de cada mês (primeiro
#     backup daquele mês, já que roda 1x/dia — ordenação lexicográfica do nome == cronológica).
#   - além de 12 meses: também é removido (nem a camada mensal cresce pra sempre).
#
# Restaurar: ver docs/BACKUP-MONGODB.md (passo a passo + teste de restore já realizado em
# 09/11/2026, sem tocar no banco de produção).
set -euo pipefail

TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
S3_DIR="s3://mobbs-delivery-images/backups/mongodb/"
S3_PATH="${S3_DIR}mobbs-delivery_${TIMESTAMP}.archive.gz"

echo "[backup-mongo $(date -Iseconds)] iniciando -> $S3_PATH"
docker exec mobbs-delivery-bff-mongo-1 sh -c \
  'mongodump --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db mobbs-delivery --archive --gzip' \
  | aws s3 cp - "$S3_PATH"
echo "[backup-mongo $(date -Iseconds)] concluído: $S3_PATH"

echo "[backup-mongo $(date -Iseconds)] aplicando retenção (14 dias diários + 1 por mês até 12 meses)..."

DAILY_CUTOFF=$(date -u -d '14 days ago' +%Y-%m-%d)
MONTHLY_CUTOFF=$(date -u -d '12 months ago' +%Y-%m)

# Mais antigo primeiro — ordenação lexicográfica do nome (mobbs-delivery_YYYY-MM-DD_HH-MM-SS...)
# é cronológica, então o primeiro arquivo visto em cada mês é sempre o mais antigo daquele mês.
mapfile -t FILES < <(aws s3 ls "$S3_DIR" | grep 'mobbs-delivery_.*\.archive\.gz$' | awk '{print $4}' | sort)

declare -A MONTH_KEPT
for file in "${FILES[@]}"; do
  file_date=$(echo "$file" | sed -E 's/mobbs-delivery_([0-9]{4}-[0-9]{2}-[0-9]{2})_.*/\1/')
  file_month=${file_date:0:7}

  if [[ "$file_date" > "$DAILY_CUTOFF" || "$file_date" == "$DAILY_CUTOFF" ]]; then
    continue # dentro da janela diária (14 dias), mantém
  fi

  if [[ "$file_month" < "$MONTHLY_CUTOFF" ]]; then
    echo "[backup-mongo $(date -Iseconds)] removendo (além de 12 meses): $file"
    aws s3 rm "${S3_DIR}${file}"
    continue
  fi

  if [[ -z "${MONTH_KEPT[$file_month]:-}" ]]; then
    MONTH_KEPT[$file_month]=1 # primeiro (mais antigo) backup deste mês fora da janela diária — mantém
    continue
  fi

  echo "[backup-mongo $(date -Iseconds)] removendo (diário fora da janela de 14 dias, mês já tem o mensal): $file"
  aws s3 rm "${S3_DIR}${file}"
done

echo "[backup-mongo $(date -Iseconds)] retenção aplicada."
