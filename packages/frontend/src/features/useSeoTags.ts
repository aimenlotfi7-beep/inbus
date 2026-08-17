import { useEffect } from 'react';

interface SeoTags {
  title: string;
  description: string;
  image?: string;
  url: string;
}

function impostaMeta(nome: string, contenuto: string, attributo: 'name' | 'property' = 'name') {
  let tag = document.querySelector<HTMLMetaElement>(`meta[${attributo}="${nome}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attributo, nome);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', contenuto);
}

/**
 * Imposta title, description e Open Graph/Twitter Card per la pagina
 * corrente — utile per la condivisione sui social e per Google.
 *
 * Limite da sapere: essendo un sito che genera le pagine nel browser
 * (React), questi tag li vede bene Google (esegue il codice prima di
 * leggerli) ma NON i robot di anteprima di Facebook/WhatsApp/Twitter,
 * che leggono l'HTML "grezzo" senza eseguire nulla — per avere anche lì
 * un'anteprima con titolo/immagine giusti serve generare l'HTML in
 * anticipo (pre-rendering), un passo successivo a parte.
 */
export function useSeoTags({ title, description, image, url }: SeoTags) {
  useEffect(() => {
    const titoloPrecedente = document.title;
    document.title = title;

    impostaMeta('description', description);
    impostaMeta('og:title', title, 'property');
    impostaMeta('og:description', description, 'property');
    impostaMeta('og:url', url, 'property');
    impostaMeta('og:type', 'website', 'property');
    if (image) impostaMeta('og:image', image, 'property');
    impostaMeta('twitter:card', image ? 'summary_large_image' : 'summary');
    impostaMeta('twitter:title', title);
    impostaMeta('twitter:description', description);
    if (image) impostaMeta('twitter:image', image);

    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);

    return () => { document.title = titoloPrecedente; };
  }, [title, description, image, url]);
}
