# 07 — Verbale di collaudo tecnico

**Istituto:** ITSCG Primo Levi di Seregno  
**A.S.:** __________  
**Data:** __________  
**Repository:** `commissioneelettorale/Elezione_Levi`
**Commit sottoposto a collaudo:** ______________________________

## Soggetti presenti

- Dirigente/Delegato: __________________
- Presidente Commissione: __________________
- Segretario: __________________
- Assistente tecnico di riferimento (supporto, non componente della Commissione): __________________
- Responsabile tecnico/fornitore (se distinto): __________________
- Postazione PC laboratoriale designata dall’Istituto: __________________
- DPO/Referente privacy (se presente): __________________

La designazione del tecnico e della postazione deve risultare in un atto o verbale dell’Istituto. Il registro tecnico della piattaforma documenta i controlli eseguiti e non sostituisce la nomina, il collaudo formale o la sottoscrizione degli atti.

## Verifiche

| Test | Esito | Evidenza/note |
|---|---|---|
| login Commissione personale | ☐ OK ☐ KO | |
| login ruoli gestionali | ☐ OK ☐ KO | |
| timeout sessione | ☐ OK ☐ KO | |
| token errato rifiutato | ☐ OK ☐ KO | |
| doppia sessione token bloccata | ☐ OK ☐ KO | |
| voto fuori finestra rifiutato server-side | ☐ OK ☐ KO | |
| lista inesistente rifiutata | ☐ OK ☐ KO | |
| candidato non ammesso rifiutato | ☐ OK ☐ KO | |
| preferenze duplicate rifiutate | ☐ OK ☐ KO | |
| doppio voto rifiutato | ☐ OK ☐ KO | |
| urna priva di identificativi | ☐ OK ☐ KO | |
| urna priva di timestamp | ☐ OK ☐ KO | |
| nessun `vote_id_*` nei token | ☐ OK ☐ KO | |
| lettura diretta urne dal client negata | ☐ OK ☐ KO | |
| scrittura diretta urne dal client negata | ☐ OK ☐ KO | |
| risultati parziali nascosti | ☐ OK ☐ KO | |
| risultati aggregati coerenti | ☐ OK ☐ KO | |
| audit admin funzionante | ☐ OK ☐ KO | |
| backup/restore test | ☐ OK ☐ KO | |
| preflight script superato | ☐ OK ☐ KO | |
| account Assistente tecnico autenticato con ruolo separato | ☐ OK ☐ KO | |
| area tecnica priva di accesso a voti e risultati | ☐ OK ☐ KO | |
| checkpoint tecnico di apertura registrato lato server | ☐ OK ☐ KO | |
| checkpoint tecnico di chiusura registrato lato server | ☐ OK ☐ KO | |
| verbale PDF tecnico esportato e verificato | ☐ OK ☐ KO | |

## Registro dei checkpoint di apertura e chiusura

| Fase | Data/ora (Europe/Rome) | Nome e cognome tecnico | Postazione | Esito | ID log / evidenza |
|---|---|---|---|---|---|
| Apertura | __________________ | __________________ | __________________ | ☐ OK ☐ KO | __________________ |
| Chiusura | __________________ | __________________ | __________________ | ☐ OK ☐ KO | __________________ |

Il verbale deve riportare anche eventuali anomalie, il relativo protocollo/verbale d’incidente e la decisione della Commissione sulla prosecuzione, sospensione o ripresa.

## Dataset di prova

Descrivere numero di elettori, schede attese e risultati noti, senza utilizzare dati personali reali:  
____________________________________________________________________

## Esito finale

☐ IDONEO ALLA MESSA IN ESERCIZIO  
☐ NON IDONEO  
☐ IDONEO CON PRESCRIZIONI

Prescrizioni: ______________________________________________________

Firme: _____________________________________________________________

## Richiamo agli atti degli organi collegiali (integrazione 08/10/2026)

Secondo i riferimenti comunicati dal referente scolastico, il Collegio dei Docenti si è riunito il **22/09/2026** e il Consiglio d'Istituto il **23/09/2026**, con deliberazioni relative al procedimento. **Numeri e dispositivi:** da verificare e riportare dagli atti originali. Riferimento Commissione n. **9507/2.1 dell'08/10/2026**, da riscontrare nel fascicolo. Il referente comunica altresì una verifica svolta con il DPO: estremi del parere, perimetro e prescrizioni da allegare. Vedi `docs/23_INTEGRAZIONE_ATTI_COLLEGIALI_2026.md`.

Questi richiami non compilano automaticamente la tabella degli esiti, non costituiscono prova dell'anonimato e non trasformano la bozza in un collaudo sottoscritto.
