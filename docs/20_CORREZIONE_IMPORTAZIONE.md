# Correzione importazione registro elettorale

Base: `019c21fdce101f3286f73118d9f9686e10e496fd`.

## Difetto individuato nel codice

L'importazione Excel e la generazione manuale scrivevano direttamente in Firestore.
La regola `editableRoll` richiedeva `votingStartsAtMs` futuro e un documento
`regolarita_YYYY_YYYY/state` esistente. Un calendario ancora da definire
(`votingStartsAtMs: 0`) o uno stato non ancora creato causavano quindi un rifiuto
anche per la Commissione in fase preparatoria. Il ciclo Excel interrompeva inoltre
il caricamento a 400 righe, mentre il generatore esauriva i codici a 1.000 per componente.

La configurazione privata dell'istituto e l'importazione reale non sono state
lette o modificate durante la verifica: questi sono difetti riprodotti dal codice,
non una certificazione dello stato dei dati di produzione.

## Comportamento corretto

- Importazione e generazione passano da `importVoterRegister` su `/api/call`.
- Solo una sessione Commissione attiva, dell'anno richiesto e senza cambio password
  pendente, può salvare. Il controllo dell'account è ripetuto nella transazione.
- La preparazione funziona anche prima della definizione del calendario e dello stato
  di regolarità. Nessuna importazione apre le votazioni o conferma controlli preliminari.
- Elenchi definitivi, procedimento chiuso, voto autorizzato, finestre già iniziate,
  schede esistenti o codici anonimi emessi bloccano nuove righe con messaggi specifici.
- I file vengono validati prima dell'invio e gestiti integralmente, fino a 10.000
  righe e 10 MB, in blocchi di massimo 400 righe. I blocchi sono atomici; il file
  intero può restare parzialmente importato se un blocco successivo fallisce.
- Lo stesso file normalizzato, nello stesso ordine, anno e componente, può essere
  ripresentato: le ricevute impediscono di duplicare i blocchi già confermati.
  Questo non identifica la stessa persona in file diversi o riordinati; non si
  fondono automaticamente gli omonimi. Non viene cancellato alcun registro precedente.
- Le nuove righe usano il prefisso STU-, GEN-, DOC- o ATA- seguito da sei
  caratteri alfanumerici casuali, non derivabili dai nomi, con verifica delle
  collisioni. La migrazione dedicata aggiorna i codici preesistenti; le stampe
  mostrano gli identificativi correnti.
- Creazione del blocco, eventuali chiavi referenti, ricevuta e audit sono nella
  stessa transazione. L'audit contiene componente e numero di righe, senza nomi
  o codici degli elettori. I flag di voto sono stabiliti dal server.
- Il browser non può creare, modificare o cancellare direttamente documenti nel
  registro. È stato rimosso anche il permesso residuo di modifica anagrafica via
  SDK, che non applicava tutti i controlli di congelamento e audit del backend.
- La verifica dell'anno controlla sia l'anno della richiesta sia quello della
  configurazione: una combinazione discordante non può scrivere su altre annualità.

## Verifiche

`scripts/check-register-import.cjs` esegue 11 gruppi di casi sul backend reale con
database simulato: 1.501 righe, controlli di autorizzazione, congelamento, collisioni,
risposte perse, ripresa, rollback e chiavi referenti.

`scripts/check-register-import-ui.cjs` esegue l'applicazione completa in un DOM
emulato, con un file XLSX reale di 805 righe, API simulate e scritture Firestore
dirette vietate. Copre anche doppio invio, errori Excel e generazione manuale.

Le prove sono incluse in `scripts/verify-release.cjs`; risultati e limiti sono
registrati in `docs/verifiche-sviluppo.json`. Non sono prove sul database reale.
`scripts/check-hardening.cjs` comprende inoltre il tentativo di salvare una
configurazione di un altro anno usando l'anno autorizzato nel campo esterno.

## Pubblicazione

Distribuire insieme codice backend, interfaccia e `lib/voter-register.js`.
Il build include esplicitamente il nuovo modulo tra gli asset pubblici.
Distribuire anche `firestore.rules` tramite il workflow esistente, mantenendo
disattivata la preparazione iniziale dell'account Commissione.

Dopo il deploy, la Commissione deve ricaricare la pagina ed effettuare l'accesso.
Se compare un messaggio relativo a elenchi definitivi o votazioni iniziate, occorre
verificare lo stato effettivo della procedura; non va aggirato il blocco cambiando date
o aprendo permessi pubblici.
