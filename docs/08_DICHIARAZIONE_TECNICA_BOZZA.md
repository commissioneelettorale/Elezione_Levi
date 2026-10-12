# 08 — Dichiarazione tecnica di coerenza ai requisiti

> Modello da completare e sottoscrivere dal soggetto formalmente individuato dall'Istituto. Non è una certificazione MIM né sostituisce audit, DPIA o collaudo.

Il/La sottoscritto/a __________________, in qualità di __________________, con riferimento alla versione software identificata dal commit __________________ del repository `commissioneelettorale/Elezione_Levi`, dichiara, sulla base della documentazione tecnica e delle prove allegate, che la soluzione è stata configurata per:

**Assistente tecnico di riferimento:** __________________
**Postazione PC laboratoriale designata dall’Istituto:** __________________
**Atto/verbale di designazione (protocollo/data):** __________________

- autenticare e autorizzare gli operatori in base al ruolo;
- impedire la lettura/scrittura diretta delle urne dal client;
- separare persistentemente registro degli aventi diritto e contenuto delle schede;
- non memorizzare nella scheda dati identificativi o timestamp individuali;
- garantire unicità del voto tramite controllo server-side e transazione atomica;
- validare liste, candidati e numero di preferenze lato server;
- non esporre preferenze parziali durante la votazione;
- produrre risultati verificabili senza ricostruire il legame elettore-scheda;
- applicare audit alle operazioni amministrative senza registrare il contenuto del voto;
- impedire operazioni distruttive ordinarie sull'urna dal browser.

Per il presidio tecnico sono stati verificati anche:

- account personale `ASSISTENTE_TECNICO` con scadenza e privilegi separati;
- endpoint server-side per stato, log e checkpoint di apertura/chiusura;
- esportazione del verbale tecnico con nominativo, postazione, esito e data/ora;
- assenza di accesso dell’assistente a urne, schede, token, risultati e verbali di nomina;
- registrazione degli incidenti e delle decisioni della Commissione senza inserire dati dell’elettore nel registro tecnico.

| Checkpoint | Data/ora (Europe/Rome) | Esito | ID evidenza | Firma tecnico |
|---|---|---|---|---|
| Apertura | __________________ | ☐ OK ☐ KO | __________________ | __________________ |
| Chiusura | __________________ | ☐ OK ☐ KO | __________________ | __________________ |

La dichiarazione è subordinata a:

1. corretta distribuzione delle Cloud Functions e Firestore Rules del medesimo commit;
2. esito positivo del verbale di collaudo;
3. completamento degli adempimenti organizzativi/privacy/documentali;
4. assenza di modifiche non collaudate successive al commit indicato.

La presente dichiarazione è una bozza tecnica interna: non certifica da sola la conformità normativa, non sostituisce il verbale di collaudo sottoscritto, la designazione formale, la DPIA/valutazione privacy o gli atti dell’Istituto. In caso di divergenza prevalgono gli atti ufficiali dell’Istituto e le istruzioni MIM/USR applicabili.

Data __________   Firma soggetto formalmente individuato __________________
Firma assistente tecnico __________________
Firma Presidente Commissione __________________
