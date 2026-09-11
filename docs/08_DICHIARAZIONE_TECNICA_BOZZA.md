# 08 — Dichiarazione tecnica di coerenza ai requisiti

> Modello da completare e sottoscrivere dal soggetto formalmente individuato dall'Istituto. Non è una certificazione MIM né sostituisce audit, DPIA o collaudo.

Il/La sottoscritto/a __________________, in qualità di __________________, con riferimento alla versione software identificata dal commit __________________ del repository `giuseppeborzumati-cmyk/Elezioni`, dichiara, sulla base della documentazione tecnica e delle prove allegate, che la soluzione è stata configurata per:

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

La dichiarazione è subordinata a:

1. corretta distribuzione delle Cloud Functions e Firestore Rules del medesimo commit;
2. esito positivo del verbale di collaudo;
3. completamento degli adempimenti organizzativi/privacy/documentali;
4. assenza di modifiche non collaudate successive al commit indicato.

Data __________   Firma __________________
