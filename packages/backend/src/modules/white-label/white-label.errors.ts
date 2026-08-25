import { ErroreApplicativo } from '../../shared/errors.js';

export class WhiteLabelNonTrovata extends ErroreApplicativo {
  constructor() { super('White Label non trovata', 404, 'WHITE_LABEL_NOT_FOUND'); }
}
export class WhiteLabelDisattivata extends ErroreApplicativo {
  constructor() { super('Questa White Label è stata disattivata — non accetta più nuove vendite', 403, 'WHITE_LABEL_DISABLED'); }
}
export class EventoNonDisponibile extends ErroreApplicativo {
  constructor() { super('Questo evento non è più disponibile', 409, 'EVENT_NOT_AVAILABLE'); }
}
export class OrganizzatoreNonAutorizzato extends ErroreApplicativo {
  constructor() { super('Questo evento non è associato a te', 403, 'ORGANIZER_NOT_AUTHORIZED'); }
}
export class OrigineNonValida extends ErroreApplicativo {
  constructor() { super('Dominio di provenienza non autorizzato per questa White Label', 403, 'INVALID_ORIGIN'); }
}
export class AssociazioneGiaEsistente extends ErroreApplicativo {
  constructor() { super('Esiste già una White Label per questo organizzatore e questo evento', 409, 'WHITE_LABEL_ALREADY_EXISTS'); }
}
