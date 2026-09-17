import { S3Client } from '@aws-sdk/client-s3';

import { environment } from '../config/environment';

/** specs/0036-migracao-imagens-s3 REQ-4 — sem `credentials` explícitas: o SDK resolve pela
 * cadeia padrão (IAM Role da instância EC2 em produção; `~/.aws/credentials`/variáveis de
 * ambiente em desenvolvimento local), nunca uma Access Key gravada em arquivo do projeto. */
export const s3Client = new S3Client({ region: environment.s3.region });
