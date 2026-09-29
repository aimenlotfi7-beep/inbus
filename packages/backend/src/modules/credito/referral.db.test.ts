import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { eventi, prenotazioni, utenti } from '../../db/schema.js';
import { creditoService } from './credito.service.js';
import { prenotazioniService } from '../prenotazioni/prenotazioni.service.js';
import { creaCliente, fraGiorni, impostazione, riga, scenarioBase, svuotaDatabase } from '../../../test/dati.js';

// "Invita un amico" (proprietario, settembre 2026): il bonus di chi
// invita arriva solo DOPO il primo viaggio davvero fatto dall'amico, e
// torna indietro se quel viaggio viene rimborsato.

beforeEach(svuotaDatabase);

/** Invitante, amico invitato e una prenotazione dell'amico già pagata. */
async function scenarioInvito() {
  await impostazione('credito_referral_invitante', 10);
  const invitante = await creaCliente();
  const { evento, tragitto, roma } = await scenarioBase();
  const amico = await creaCliente({ invitatoDaUtenteId: invitante.id });
  const p = await prenotazioniService.crea(riga({ eventoId: evento.id, tragittoId: tragitto.id, fermataId: roma.id }, amico), amico.id);
  await db.update(prenotazioni).set({ saldoPagato: true }).where(eq(prenotazioni.id, p.id));
  return { invitante, amico, evento, prenotazioneId: p.id };
}

const credito = async (utenteId: string) =>
  Number((await db.select({ c: utenti.creditoDisponibile }).from(utenti).where(eq(utenti.id, utenteId)))[0].c);
const bonusDato = async (utenteId: string) =>
  (await db.select({ b: utenti.bonusReferralInvitanteErogato }).from(utenti).where(eq(utenti.id, utenteId)))[0].b;

/** Sposta l'evento a ieri: il viaggio risulta fatto. */
async function viaggioFatto(eventoId: string) {
  await db.update(eventi).set({ data: fraGiorni(-1) }).where(eq(eventi.id, eventoId));
}

describe('bonus "invita un amico" a chi invita', () => {
  it('non arriva finché il viaggio dell\'amico non è avvenuto', async () => {
    const { invitante, prenotazioneId } = await scenarioInvito();

    expect(await creditoService.maturaBonusReferralViaggiConclusi()).toEqual({ pagati: 0 });
    expect(await creditoService.maturaBonusReferralInvitanteSeAmicoNuovo(prenotazioneId)).toBe(false);
    expect(await credito(invitante.id)).toBe(0);
  });

  it('arriva dopo il viaggio, una volta sola', async () => {
    const { invitante, amico, evento, prenotazioneId } = await scenarioInvito();
    await viaggioFatto(evento.id);

    expect(await creditoService.maturaBonusReferralViaggiConclusi()).toEqual({ pagati: 1 });
    expect(await credito(invitante.id)).toBe(10);
    expect(await bonusDato(amico.id)).toBe(true);

    // Il giro del giorno dopo, e una chiamata diretta, non lo raddoppiano.
    expect(await creditoService.maturaBonusReferralViaggiConclusi()).toEqual({ pagati: 0 });
    expect(await creditoService.maturaBonusReferralInvitanteSeAmicoNuovo(prenotazioneId)).toBe(false);
    expect(await credito(invitante.id)).toBe(10);
  });

  it('due giri insieme lo danno una volta sola', async () => {
    const { invitante, evento, prenotazioneId } = await scenarioInvito();
    await viaggioFatto(evento.id);

    await Promise.all([
      creditoService.maturaBonusReferralInvitanteSeAmicoNuovo(prenotazioneId),
      creditoService.maturaBonusReferralInvitanteSeAmicoNuovo(prenotazioneId),
    ]);
    expect(await credito(invitante.id)).toBe(10);
  });

  it('non arriva se il viaggio non è stato pagato per intero', async () => {
    const { invitante, evento, prenotazioneId } = await scenarioInvito();
    await viaggioFatto(evento.id);
    await db.update(prenotazioni).set({ saldoPagato: false }).where(eq(prenotazioni.id, prenotazioneId));

    expect(await creditoService.maturaBonusReferralViaggiConclusi()).toEqual({ pagati: 0 });
    expect(await credito(invitante.id)).toBe(0);
  });
});

describe('rimborso del viaggio con cui è scattato il bonus', () => {
  it('toglie il bonus a chi invita e rimette l\'amico "in sospeso"', async () => {
    const { invitante, amico, evento, prenotazioneId } = await scenarioInvito();
    await viaggioFatto(evento.id);
    await creditoService.maturaBonusReferralViaggiConclusi();

    await creditoService.revocaBonusReferralSePresente(prenotazioneId);
    expect(await credito(invitante.id)).toBe(0);
    expect(await bonusDato(amico.id)).toBe(false);

    // Ripetuta (due amministratori insieme) non toglie due volte.
    await creditoService.revocaBonusReferralSePresente(prenotazioneId);
    expect(await credito(invitante.id)).toBe(0);
  });

  it('non porta il saldo di chi invita sotto zero se il bonus è già stato speso', async () => {
    const { invitante, evento, prenotazioneId } = await scenarioInvito();
    await viaggioFatto(evento.id);
    await creditoService.maturaBonusReferralViaggiConclusi();
    await db.update(utenti).set({ creditoDisponibile: '4.00' }).where(eq(utenti.id, invitante.id));

    await creditoService.revocaBonusReferralSePresente(prenotazioneId);
    expect(await credito(invitante.id)).toBe(0);
  });

  it('la revoca del credito fedeltà dell\'amico non tocca il bonus di chi invita', async () => {
    await impostazione('credito_per_passeggero', 2);
    const { invitante, amico, evento, prenotazioneId } = await scenarioInvito();
    await viaggioFatto(evento.id);
    await creditoService.maturaCreditoSubito(prenotazioneId);
    await creditoService.maturaBonusReferralViaggiConclusi();
    const creditoAmico = await credito(amico.id);

    await creditoService.revocaCreditoSePresente(prenotazioneId);
    expect(await credito(amico.id)).toBe(creditoAmico - 2);
    expect(await credito(invitante.id)).toBe(10);
  });
});
