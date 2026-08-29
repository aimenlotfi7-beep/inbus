import { Router, type Request, type Response } from 'express';
import { db } from '../../db/client.js';
import { eventi } from '../../db/schema.js';
import { eq, and, gte } from 'drizzle-orm';
import { urlSito } from '../../shared/email.service.js';

export const sitemapRouter = Router();

/** Sitemap.xml pubblica — elenca la home, le pagine fisse e ogni evento
 *  ancora visibile, così Google le trova tutte senza doverle scoprire a
 *  caso. Il file vive qui (sul backend) anche se le pagine sono sul
 *  sito: va bene lo stesso, i motori di ricerca seguono i link dentro,
 *  non guardano da dove è servito il file. */
sitemapRouter.get('/sitemap.xml', async (_req: Request, res: Response) => {
  const eventiVisibili = await db
    .select({ slug: eventi.slug, aggiornatoIl: eventi.aggiornatoIl })
    .from(eventi)
    .where(and(eq(eventi.visibileSito, true), gte(eventi.data, new Date())));

  const paginaFissa = (percorso: string, priorita: string) =>
    `<url><loc>${urlSito(percorso)}</loc><priority>${priorita}</priority></url>`;

  const vociEventi = eventiVisibili.map((e) =>
    `<url><loc>${urlSito(`/eventi/${e.slug}`)}</loc><lastmod>${e.aggiornatoIl.toISOString().slice(0, 10)}</lastmod><priority>0.8</priority></url>`
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paginaFissa('/', '1.0')}
${paginaFissa('/faq', '0.5')}
${vociEventi}
</urlset>`;

  res.type('application/xml').send(xml);
});
