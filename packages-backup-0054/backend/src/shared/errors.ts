// Errori applicativi "conosciuti": chi li lancia sa già che messaggio e
// status code mostrare al client. Tutto il resto (bug, errori del
// database...) viene intercettato dal middleware generico e loggato.

export class ErroreApplicativo extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
    public code: string = 'ERRORE_GENERICO'
  ) {
    super(message);
    this.name = 'ErroreApplicativo';
  }
}

export class NonTrovato extends ErroreApplicativo {
  constructor(entita: string) {
    super(`${entita} non trovato/a`, 404, 'NON_TROVATO');
  }
}

export class NonAutorizzato extends ErroreApplicativo {
  constructor(message = 'Non autorizzato') {
    super(message, 401, 'NON_AUTORIZZATO');
  }
}

export class VietatoDaiPermessi extends ErroreApplicativo {
  constructor(message = 'Il tuo ruolo non può eseguire questa azione') {
    super(message, 403, 'PERMESSI_INSUFFICIENTI');
  }
}

export class ConflittoDati extends ErroreApplicativo {
  constructor(message: string) {
    super(message, 409, 'CONFLITTO');
  }
}
