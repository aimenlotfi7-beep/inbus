// Genera una versione statica dell'HTML per ogni pagina evento (dentro
// dist/eventi/<slug>/index.html), con i meta tag già scritti dentro —
// non un popup di React, un file vero.
//
// Perché serve: i robot che generano l'anteprima quando condividi un
// link su WhatsApp/Facebook/Twitter leggono l'HTML "grezzo" della
// pagina, SENZA eseguire il codice JavaScript del sito — quindi non
// vedono mai i meta tag che React scrive dopo, quando la pagina si
// carica nel browser. Con questo file statico pronto in anticipo,
// quei robot trovano titolo/immagine/descrizione corretti fin
// dall'inizio. Una volta che un utente vero apre il link, il sito
// funziona esattamente come sempre (React prende il controllo).
//
// Gira in automatico dopo ogni "npm run build" (vedi package.json).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(__dirname, '..', 'dist');
const apiUrl = process.env.VITE_API_URL || 'http://localhost:4000';
const siteUrl = process.env.VITE_SITE_URL || 'https://inbus-eosin.vercel.app';

function escapeHtml(testo) {
  return String(testo).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function prezzoMinimo(evento) {
  const prezzi = [];
  const tuttiITragitti = [...(evento.tragitti ?? []), ...(evento.servizi ?? []).flatMap((s) => s.tragitti ?? [])];
  for (const tragitto of tuttiITragitti) {
    for (const f of tragitto.fermate ?? []) {
      if (f.prezzo) prezzi.push(Number(f.prezzo));
    }
  }
  if (prezzi.length > 0) return Math.min(...prezzi);
  return evento.prezzo ? Number(evento.prezzo) : null;
}

function costruisciHtml(template, evento) {
  const prezzo = prezzoMinimo(evento);
  const url = `${siteUrl}/eventi/${evento.slug}`;
  const titolo = `${evento.artista} — ${evento.luogo}, ${evento.citta} | INBUS`;
  const descrizione = `Bus per ${evento.artista} il ${new Date(evento.data).toLocaleDateString('it-IT')} a ${evento.citta}${prezzo !== null ? ` — a partire da €${prezzo.toFixed(2)}` : ''}. Prenota il tuo posto con INBUS.`;
  const immagine = evento.immagini?.[0]?.url;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: evento.artista,
    startDate: evento.data,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: { '@type': 'Place', name: evento.luogo, address: { '@type': 'PostalAddress', addressLocality: evento.citta, addressCountry: 'IT' } },
    ...(immagine && { image: [immagine] }),
    ...(prezzo !== null && { offers: { '@type': 'Offer', price: prezzo.toFixed(2), priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url } }),
  };

  let html = template;
  html = html.replace(/<title>.*?<\/title>/s, `<title>${escapeHtml(titolo)}</title>`);
  html = html.replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escapeHtml(descrizione)}">`);
  html = html.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escapeHtml(titolo)}">`);
  html = html.replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escapeHtml(descrizione)}">`);
  html = html.replace(/<meta property="og:type"[^>]*>/, `<meta property="og:type" content="website">\n<meta property="og:url" content="${escapeHtml(url)}">${immagine ? `\n<meta property="og:image" content="${escapeHtml(immagine)}">` : ''}`);
  html = html.replace(/<meta name="twitter:card"[^>]*>/, `<meta name="twitter:card" content="${immagine ? 'summary_large_image' : 'summary'}">`);
  html = html.replace('</head>', `<link rel="canonical" href="${escapeHtml(url)}">\n<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n</head>`);
  return html;
}

async function main() {
  const templatePath = resolve(distDir, 'index.html');
  let template;
  try {
    template = readFileSync(templatePath, 'utf-8');
  } catch {
    console.log('Pre-rendering saltato: dist/index.html non trovato (esegui prima "vite build").');
    return;
  }

  let eventi;
  try {
    const risposta = await fetch(`${apiUrl}/api/eventi?soloFuturi=true&soloVisibili=true`);
    if (!risposta.ok) throw new Error(`Risposta ${risposta.status}`);
    eventi = await risposta.json();
  } catch (err) {
    console.log(`Pre-rendering saltato: impossibile contattare l'API (${apiUrl}) durante la build — ${err.message}. Il sito funziona comunque, solo le anteprime social di ogni evento restano quelle generiche invece che specifiche.`);
    return;
  }

  for (const evento of eventi) {
    if (!evento.slug) continue;
    const cartella = resolve(distDir, 'eventi', evento.slug);
    mkdirSync(cartella, { recursive: true });
    writeFileSync(resolve(cartella, 'index.html'), costruisciHtml(template, evento));
  }

  console.log(`Pre-rendering completato: ${eventi.length} pagine evento generate con meta tag propri.`);
}

main();
