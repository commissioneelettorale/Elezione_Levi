# 04 — Policy accessi e ruoli

## Principi

1. **Identità individuale:** gli account istituzionali non devono essere condivisi.
2. **Minimo privilegio:** ogni ruolo vede soltanto ciò che serve.
3. **Separazione dei compiti:** gestione aventi diritto, scrutinio, amministrazione cloud e conservazione devono essere attribuiti e controllati.
4. **Nessun accesso diretto all'urna dal browser:** le urne sono deny-by-default nelle Firestore Rules.
5. **No segreti nel repository:** password/service account/API private keys sono vietati nel codice.

## Matrice ruoli

| Funzione | Commissione | Dirigente | Vicepreside | DSGA | Segreteria | Referente | Elettore |
|---|---:|---:|---:|---:|---:|---:|---:|
| Configurazione elezioni | Sì | No | No | No | No | No | No |
| Gestione aventi diritto | Sì | No | No | No | No | No | No |
| Gestione account staff | Sì | No | No | No | No | No | No |
| Lettura diretta Firestore urna | **No** | **No** | **No** | **No** | **No** | **No** | **No** |
| Scrutinio schede anonimizzate | dopo chiusura | No | No | No | No | No | No |
| Risultati aggregati | Sì | secondo fase | secondo fase/scope | secondo fase | secondo fase | classe/componente | No |
| Preferenze parziali durante apertura | No | No | No | No | No | No | No |
| Voto | No | se avente diritto con token | idem | idem | idem | se avente diritto | Sì |
| Audit amministrativo | Sì | lettura autorizzata | lettura autorizzata | lettura autorizzata | lettura autorizzata | No | No |

## Password e MFA

- minimo 12 caratteri per account applicativi;
- una password diversa per ogni persona;
- `scrypt` + salt per le password applicative;
- MFA obbligatoria/raccomandata fortemente per GitHub, Google/Firebase e console cloud;
- vietato trasmettere password via email non protetta o inserirle nei verbali;
- revoca immediata alla cessazione del ruolo;
- per **Dirigente, Vicepreside, DSGA e Segreteria** la credenziale applicativa ha scadenza automatica al **31 agosto dell'anno scolastico di riferimento**; dal 1° settembre non è più accettata dal server;
- la scadenza è registrata lato server e inclusa come claim firmata nelle sessioni gestionali, così anche una sessione già aperta non può superare il termine di validità.

## Sessioni

- timeout applicativo: 15 minuti di inattività;
- token di voto con una sola sessione attiva;
- sessione di voto revocata/consumata dopo la registrazione;
- logout obbligatorio su postazioni condivise.

## Motivazione della scadenza delle credenziali e chiusura del procedimento elettorale

Le credenziali attribuite a **Dirigente, Vicepreside, DSGA e Segreteria** sono credenziali operative collegate alla gestione della consultazione e non devono restare utilizzabili indefinitamente.

La scelta di prevederne la scadenza automatica deriva dall'incrocio tra la disciplina elettorale scolastica, i requisiti tecnico-organizzativi introdotti nel 2026 e i principi di protezione dei dati personali.

In particolare:

- l'**O.M. 15 luglio 1991, n. 215**, art. 45, prevede la proclamazione degli eletti entro 48 ore dalla conclusione delle operazioni di voto;
- l'**art. 46 della medesima O.M.** prevede che i rappresentanti di lista e i singoli candidati interessati possano presentare ricorso contro i risultati entro **5 giorni** dalla pubblicazione degli elenchi relativi alla proclamazione degli eletti e che la Commissione elettorale decida tali ricorsi entro i **5 giorni successivi** alla scadenza del termine;
- l'**art. 48** prevede che la prima convocazione del Consiglio di circolo o di istituto abbia luogo dopo la decisione degli eventuali ricorsi;
- la **Nota MIM prot. AOODPIT n. 3803 del 30 giugno 2026** e il relativo Allegato tecnico introducono, per la gestione digitale degli organi collegiali e delle operazioni di voto, requisiti di identificazione, autorizzazione per ruolo, sicurezza, protezione dei dati, tracciabilità amministrativa e conservazione documentale;
- il **Regolamento (UE) 2016/679**, in particolare l'art. 5 sui principi di limitazione della finalità, minimizzazione e limitazione della conservazione e l'art. 32 sulla sicurezza del trattamento, richiede che l'accesso ai dati personali sia limitato ai soggetti autorizzati e al tempo effettivamente necessario.

La conseguenza organizzativa adottata dall'Istituto è quindi la seguente: **una volta chiuse le operazioni di voto, completato lo scrutinio, pubblicati i risultati e definito o decorso il periodo utile per i reclami/ricorsi previsti dalla disciplina elettorale, le credenziali operative non devono restare abilitate oltre il tempo necessario alla chiusura amministrativa del procedimento**.

La **conservazione degli atti elettorali** non richiede che le credenziali operative restino attive. Al contrario, una volta conclusa la fase elettorale e quella dei reclami, i documenti che devono essere conservati vengono mantenuti secondo le regole documentali applicabili, mentre gli accessi ordinari vengono ridotti o revocati secondo il principio del minimo privilegio.

Per questo motivo il sistema applica una **scadenza automatica** alle credenziali gestionali. Per l'A.S. 2026/2027 la scadenza tecnica massima predefinita resta fissata al **31 agosto 2027**; resta tuttavia opportuno che la Commissione disponga la **disattivazione anticipata** quando la consultazione è definitivamente conclusa, non risultano più reclami pendenti e gli adempimenti conclusivi e di conservazione sono stati completati.

La scadenza o la disattivazione delle credenziali **non comporta la cancellazione automatica degli atti** che devono essere conservati; comporta soltanto la cessazione dell'accesso operativo ordinario ai dati della consultazione.

Questa impostazione costituisce una misura tecnico-organizzativa di sicurezza e accountability: evita account persistenti non più necessari, riduce la superficie di attacco, limita il rischio di accessi successivi non giustificati e separa chiaramente la fase di **gestione operativa** dalla successiva fase di **conservazione documentale**.

## Revisione periodica

Prima di ogni consultazione la Commissione verifica elenco account, ruoli, ambiti di classe e stato attivo/disattivo. La verifica è verbalizzata. Al termine della consultazione, definita la fase degli eventuali reclami/ricorsi e completati gli adempimenti conclusivi, la Commissione verbalizza la disattivazione o la naturale scadenza delle credenziali operative non più necessarie.
