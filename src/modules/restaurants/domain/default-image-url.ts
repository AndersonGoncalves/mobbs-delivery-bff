import { environment } from '../../../shared/config/environment';

/**
 * specs/0215-ambiente-homologacao T022 — endereço de uma foto padrão (`app-imagens/`, catálogo e
 * matérias-primas do autocadastro) montado a partir do bucket configurado (`S3_BUCKET_NAME`/
 * `AWS_REGION`), em vez de fixo no bucket de produção. Em produção o resultado é o mesmo de antes
 * (`mobbs-delivery-images`, `us-east-1`); na homologação aponta para `mobbs-delivery-images-hml`,
 * que tem a cópia das mesmas fotos, nas mesmas pastas.
 */
export function appImageUrl(fileName: string, s3: { bucket: string; region: string } = environment.s3): string {
  return `https://${s3.bucket}.s3.${s3.region}.amazonaws.com/app-imagens/${fileName}`;
}
