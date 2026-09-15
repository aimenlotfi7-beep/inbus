import { describe, expect, it } from 'vitest';
import { palliniPartenze, statoCard, statoGenerale, statoInTappa, tappeDi, type Partenza } from './statiPartenze';

// Regola dei colori di Partenze (proprietario, settembre 2026): rosso tocca a
// noi, arancio si aspetta qualcun altro, verde fatto, viola percorso cambiato.

const fraGiorni = (giorni: number) => new Date(Date.now() + giorni * 24 * 3600 * 1000).toISOString();

function partenza(o: Partial<Partenza> = {}): Partenza {
  return {
    tragittoId: 't1', tragittoNome: 'Da Roma', stato: 'DA_CONFERMARE', postiTotali: 999999, totalePasseggeri: 0,
    postiSuiBus: 0, senzaPosto: 0, lineeDaConfermare: 0, cambioPercorso: null, preventivoCosto: null, fornitoreId: null,
    fermateCompilate: false, servizioNome: null, servizioId: null, richiestePreventivo: 0, rispostePreventivo: 0, proposteSenzaRichieste: 0, risposteBus: 0,
    evento: { id: 'e1', artista: 'Concerto', genere: 'Pop', data: fraGiorni(30), citta: 'Milano', luogo: 'Stadio', slug: 'concerto', immagineUrl: null },
    ...o,
  };
}

describe('Orari', () => {
  it('senza orari: rosso', () => {
    expect(statoInTappa(partenza(), 'fermate')).toEqual({ livello: 'da-fare', testo: 'Orari da impostare' });
  });
  it('con gli orari: verde', () => {
    expect(statoInTappa(partenza({ fermateCompilate: true }), 'fermate')?.livello).toBe('fatto');
  });
});

describe('Quotazione', () => {
  const conOrari = { fermateCompilate: true };
  it('nessuna richiesta: rosso', () => {
    expect(statoInTappa(partenza(conOrari), 'preventivi')).toEqual({ livello: 'da-fare', testo: 'Da richiedere' });
  });
  it('richieste inviate, nessuna risposta: arancio', () => {
    expect(statoInTappa(partenza({ ...conOrari, richiestePreventivo: 3 }), 'preventivi')).toEqual({ livello: 'attesa', testo: 'Richieste inviate' });
  });
  it('risposte arrivate: rosso, tocca a noi scegliere', () => {
    expect(statoInTappa(partenza({ ...conOrari, richiestePreventivo: 3, rispostePreventivo: 2 }), 'preventivi')).toEqual({ livello: 'da-fare', testo: '2 risposte da valutare' });
  });
  it('accettato o registrato: verde', () => {
    expect(statoInTappa(partenza({ ...conOrari, fornitoreId: 'f1', preventivoCosto: '1800' }), 'preventivi')).toEqual({ livello: 'fatto', testo: 'Scelta' });
    expect(statoInTappa(partenza({ ...conOrari, preventivoCosto: '1800' }), 'preventivi')).toEqual({ livello: 'fatto', testo: 'Registrata' });
  });
  it('percorso cambiato: viola, sopra tutto', () => {
    expect(statoInTappa(partenza({ ...conOrari, fornitoreId: 'f1', preventivoCosto: '1800', cambioPercorso: 'da_richiedere' }), 'preventivi')?.livello).toBe('percorso-cambiato');
  });
});

describe('Prezzi', () => {
  it('preventivo senza prezzi di vendita: rosso', () => {
    expect(statoInTappa(partenza({ preventivoCosto: '1800' }), 'da-prezzare')).toEqual({ livello: 'da-fare', testo: 'Da prezzare' });
  });
  it('in vendita: verde', () => {
    expect(statoInTappa(partenza({ preventivoCosto: '1800', stato: 'PREZZATO' }), 'da-prezzare')?.livello).toBe('fatto');
  });
});

describe('Da confermare e Confermate', () => {
  it('in vendita senza bus e sotto il pareggio: arancio, si aspettano le prenotazioni', () => {
    expect(statoInTappa(partenza({ stato: 'PREZZATO', totalePasseggeri: 12 }), 'da-confermare')).toEqual({ livello: 'attesa', testo: 'Sotto il pareggio' });
  });
  it('proposta nata e preventivi del bus non ancora chiesti: rosso', () => {
    expect(statoInTappa(partenza({ stato: 'PREZZATO', lineeDaConfermare: 1, proposteSenzaRichieste: 1 }), 'da-confermare')).toEqual({ livello: 'da-fare', testo: 'Bus da richiedere' });
    expect(statoInTappa(partenza({ stato: 'CONFERMATO', lineeDaConfermare: 2, proposteSenzaRichieste: 2, postiSuiBus: 50, totalePasseggeri: 60 }), 'confermato')).toEqual({ livello: 'da-fare', testo: '2 bus da richiedere' });
  });
  it('preventivi del bus chiesti, nessuna risposta: arancio', () => {
    expect(statoInTappa(partenza({ stato: 'PREZZATO', lineeDaConfermare: 1 }), 'da-confermare')).toEqual({ livello: 'attesa', testo: 'Preventivi bus inviati' });
  });
  it('risposte dei fornitori per il bus: rosso, tocca a noi scegliere', () => {
    expect(statoInTappa(partenza({ stato: 'PREZZATO', lineeDaConfermare: 1, risposteBus: 2 }), 'da-confermare')).toEqual({ livello: 'da-fare', testo: '2 preventivi bus da valutare' });
  });
  it('passeggeri che non entrano nei bus (anche con posti liberi, se i gruppi non ci stanno): rosso', () => {
    expect(statoInTappa(partenza({ stato: 'CONFERMATO', postiSuiBus: 60, totalePasseggeri: 56, senzaPosto: 14 }), 'confermato')).toEqual({ livello: 'da-fare', testo: '14 senza posto' });
  });
  it('bus confermati e tutti con un posto: verde', () => {
    expect(statoInTappa(partenza({ stato: 'CONFERMATO', postiSuiBus: 50, totalePasseggeri: 40 }), 'da-confermare')).toEqual({ livello: 'fatto', testo: 'Confermata' });
    expect(statoInTappa(partenza({ stato: 'CONFERMATO', postiSuiBus: 50, totalePasseggeri: 40 }), 'confermato')).toEqual({ livello: 'fatto', testo: '' });
  });
  it('fuori da Partenze (scheda in Eventi): da prezzare è rosso', () => {
    expect(statoGenerale(partenza()).livello).toBe('da-fare');
  });
});

describe('card con più tragitti', () => {
  it('uno pronto e uno da fare: rosso, con quanti sono pronti', () => {
    expect(statoCard([{ livello: 'fatto', testo: 'Orari impostati' }, { livello: 'da-fare', testo: 'Orari da impostare' }])).toEqual({ livello: 'da-fare', testo: '1/2 pronti' });
  });
  it('uno in attesa e uno pronto: arancio', () => {
    expect(statoCard([{ livello: 'fatto', testo: 'Scelta' }, { livello: 'attesa', testo: 'Richieste inviate' }]).livello).toBe('attesa');
  });
  it('tutti pronti con la stessa etichetta: verde con quell\'etichetta', () => {
    expect(statoCard([{ livello: 'fatto', testo: 'In vendita' }, { livello: 'fatto', testo: 'In vendita' }])).toEqual({ livello: 'fatto', testo: 'In vendita' });
  });
  it('tutti da fare con etichette diverse: quanti sono', () => {
    expect(statoCard([{ livello: 'da-fare', testo: 'Da richiedere' }, { livello: 'da-fare', testo: '1 risposta da valutare' }])).toEqual({ livello: 'da-fare', testo: '2 da completare' });
  });
});

describe('voci e pallini del menu', () => {
  it('un evento passato va solo in Passate e non accende pallini', () => {
    const passata = partenza({ evento: { ...partenza().evento, data: fraGiorni(-3) } });
    expect(tappeDi(passata)).toEqual(['passate']);
    expect(palliniPartenze([passata]).perVoce.fermate).toBe(0);
  });

  it('contano gli eventi con almeno un tragitto rosso, non i tragitti', () => {
    const elenco = [
      partenza({ tragittoId: 'a' }), // Orari rosso
      partenza({ tragittoId: 'b' }), // stesso evento, Orari rosso
      partenza({ tragittoId: 'c', fermateCompilate: true, richiestePreventivo: 2, evento: { ...partenza().evento, id: 'e2' } }), // Preventivi arancio
      partenza({ tragittoId: 'd', fermateCompilate: true, richiestePreventivo: 2, rispostePreventivo: 1, evento: { ...partenza().evento, id: 'e3' } }), // Preventivi rosso
      partenza({ tragittoId: 'e', fermateCompilate: true, preventivoCosto: '900', stato: 'CONFERMATO', postiSuiBus: 50, totalePasseggeri: 51, senzaPosto: 1, evento: { ...partenza().evento, id: 'e4' } }),
      partenza({ tragittoId: 'f', fermateCompilate: true, preventivoCosto: '900', stato: 'PREZZATO', totalePasseggeri: 5, cambioPercorso: 'in_attesa', evento: { ...partenza().evento, id: 'e5' } }),
    ];
    const { perVoce, percorsiCambiati } = palliniPartenze(elenco);
    expect(perVoce.fermate).toBe(1);
    expect(perVoce.preventivi).toBe(1);
    expect(perVoce['da-prezzare']).toBe(0);
    // Posti mancanti: rosso sia in Da confermare sia in Confermate.
    expect(perVoce['da-confermare']).toBe(1);
    expect(perVoce.confermato).toBe(1);
    expect(percorsiCambiati).toBe(1);
  });
});
