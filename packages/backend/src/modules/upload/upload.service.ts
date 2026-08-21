import crypto from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../../config/env.js';
import { ErroreApplicativo } from '../../shared/errors.js';

let client: S3Client | null = null;

function configurato() {
  return !!(env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET_NAME && env.R2_PUBLIC_URL);
}

function getClient() {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
    });
  }
  return client;
}

/** Tipi di file accettati — immagini per foto eventi/biglietto/email, PDF
 *  per eventuali documenti. Aggiungerne altri qui se serve in futuro. */
const TIPI_AMMESSI: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

export const uploadService = {
  attivo: configurato,

  /** Carica un file su R2 e torna il link pubblico — pronto da salvare
   *  ovunque nel gestionale si salvi oggi un "URL" (immagini evento,
   *  intestazione biglietto, immagini nelle email). */
  async carica(buffer: Buffer, mimeType: string): Promise<string> {
    if (!configurato()) {
      throw new ErroreApplicativo('Caricamento file non configurato — servono le variabili R2 su Railway.');
    }
    const estensione = TIPI_AMMESSI[mimeType];
    if (!estensione) {
      throw new ErroreApplicativo(`Tipo di file non ammesso: ${mimeType}. Sono ammessi: immagini (JPG/PNG/WEBP/GIF) e PDF.`);
    }

    const nomeFile = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${estensione}`;
    await getClient().send(new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME!,
      Key: nomeFile,
      Body: buffer,
      ContentType: mimeType,
    }));

    const base = env.R2_PUBLIC_URL!.replace(/\/$/, '');
    return `${base}/${nomeFile}`;
  },
};
