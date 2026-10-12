> **Aggiornamento V2 — 13 settembre 2026:** il precedente blocco generale V1 è sostituito dal processo in presenza con credenziali non nominative, collaudo, verifica indipendente e autorizzazione registrata. Il processo nominativo resta escluso. I riferimenti successivi al blocco V1 descrivono quella valutazione precedente. Fare riferimento alla [procedura corrente](19_FASCICOLO_DPO_E_RIPRESA.md) e al Fascicolo DPO. Non sono dichiarati anonimato assoluto o cifratura end-to-end.

# Consultazioni distinte, protezione delle schede e collaudo

Aggiornamento del 13 settembre 2026. Guida operativa e limiti della versione software.

## Configurazione senza sovrapporre le elezioni

In **Commissione → Configurazione → Consultazioni: calendari e atti distinti**, scegliere l’elezione nel filtro. Sono distinti Consiglio d’istituto (docenti, ATA e genitori), Consiglio d’istituto (studenti), Consulta, rappresentanti di classe studenti e rappresentanti di classe genitori.

Per ciascuna consultazione si possono registrare:

- periodo organizzativo (ottobre, novembre o altro) e tipo di procedura;
- fino a sei giornate/fasce, con data, ora di apertura e ora di chiusura;
- fino a sei atti pertinenti: ente, protocollo, data, oggetto e collegamento HTTPS;
- data/ora prevista per gli esiti e convalida dello scrutinio;
- congelamento definitivo di calendario, atti, liste e regole della scheda.

Attivare **Usa calendario e atti dedicati** per applicare il profilo. Senza questa opzione resta il calendario generale già configurato. Le date del mese non sono imposte dal programma: la Commissione inserisce quelle risultanti dagli atti applicabili. Non sono stati aggiunti protocolli o date ufficiali presunti.

Le fasce sono controllate dal server in **Europe/Rome**, compreso il cambio fra ora legale e solare. La chiusura è esclusiva: alle 11:00 non è più accettato un voto in una fascia 09:00–11:00. Fra due giornate della stessa consultazione non sono visibili le preferenze parziali. Una consultazione conclusa in ottobre può essere scrutinata mentre quella di novembre resta chiusa al voto e senza risultati accessibili.

Il calendario e gli atti diventano immutabili all’inizio della prima fascia o al congelamento esplicito. Un incidente va registrato attraverso sospensione/ripresa; la sospensione non proroga gli orari. Una variazione straordinaria dopo l’avvio richiede una procedura specifica e verbalizzata, non una modifica silenziosa della configurazione.

I controlli preliminari di regolarità e il registro degli aventi diritto restano annuali: predisporre l’intero perimetro delle consultazioni attive prima della prima apertura. Il nuovo filtro non attesta automaticamente la regolarità delle elezioni successive e non consente di alterare un registro già congelato.

## Atti, verbali, pubblicazioni e ricorsi

I verbali PDF di voto e proclamazione contengono un allegato con il calendario e gli atti della consultazione selezionata. I verbali Word riportano gli stessi riferimenti nelle rispettive sezioni. Per i profili dedicati non viene usato al loro posto l’atto generale di un’altra elezione.

In **Regolarità**, il filtro di pubblicazione/ricorsi distingue consultazione, protocollo e termine del ricorso. Il termine è inserito secondo la procedura applicabile, non calcolato con un numero di giorni uguale per tutte le elezioni. La chiusura definitiva dell’intero procedimento attende tutte le consultazioni, le pubblicazioni pertinenti, la scadenza dei relativi termini e l’assenza di ricorsi aperti.

Il periodo della Consulta deve essere verificato separatamente: le [note MIM 3009 e 3018 del 1° ottobre 2025, pubblicate dall’USR Emilia-Romagna](https://www.istruzioneer.gov.it/2025/10/08/elezioni-organi-collegiali-a-s-2025-2026-e-consulte-studenti-aa-ss-2025-2027/) riguardano il biennio 2025/2027. Questo riferimento nazionale non sostituisce l’atto territoriale competente per la scuola lombarda né prova che nel 2026 occorra un rinnovo generale. Verificare l’eventuale procedura suppletiva o di surroga prima di attivare la votazione.

Il trattamento dell’ex aequo non è modificato da questo aggiornamento.

## Cosa cambia nel database

Le **nuove schede** sono cifrate dal backend con AES-256-GCM prima della scrittura in Firestore. Le chiavi sono derivate per anno e urna mediante HKDF. Anche classe, componente e preferenze sono nel contenuto cifrato. Il documento contiene soltanto versione del formato, identificatore della chiave, IV casuale, contenuto cifrato di dimensione costante e tag di autenticazione. Il payload cifrato è riempito a 8192 byte per non rivelare il numero o la lunghezza delle preferenze attraverso la dimensione della scheda.

Non vengono aggiunti nome, token, UID o timestamp applicativo alla scheda. Le letture autorizzate eliminano i metadati e rimescolano l’ordine delle schede. Il referente di classe continua a ricevere soltanto le proiezioni consentite della propria classe. Le regole Firestore continuano a negare l’accesso diretto alle urne dai client.

Anche la Commissione riceve soltanto proiezioni aggregate, contrassegnate come righe sintetiche: non sono le combinazioni di preferenze delle schede originali. Gli originali cifrati restano nell’archivio protetto. La soluzione architetturale necessaria per superare i limiti del server attuale è descritta nella pagina [Protezione del voto](../anonimato.html) e nei [requisiti di integrazione](17_PERCORSO_ANONIMATO_VERIFICABILE.md).

Una lettura con chiave mancante o integrità non valida fallisce: l’errore non è trasformato in un’urna vuota o in un risultato di zero voti.

### Chiavi e continuità operativa

La configurazione esistente **FIREBASE_SERVICE_ACCOUNT_JSON** fornisce il materiale segreto sul server; il valore non è copiato nel repository, nel browser, nei log o nel database. È supportata anche una chiave dedicata `BALLOT_ENCRYPTION_KEY`, costituita da 32 byte casuali codificati in base64, se configurata prima della prima scheda cifrata.

**Conservare in modo protetto la configurazione di cifratura usata per le urne.** Cambiare la chiave privata del service account, aggiungere successivamente una chiave dedicata o rimuoverla cambia la chiave di lettura. Il recupero delle schede già cifrate richiede la chiave originale. Questa versione non effettua migrazioni automatiche fra chiavi diverse e non contiene un archivio di chiavi storiche. Prima di ogni rotazione occorre predisporre e collaudare una procedura amministrata di ricifratura/recupero; non basta sostituire la variabile in Production. Custodia, accessi, backup e prova di ripristino della chiave devono essere inclusi nel piano di continuità.

### Schede pregresse

In **Commissione → Collaudo → Verifica problemi e soluzioni**, il controllo delle schede in chiaro propone **Risolvi**. La correzione cifra fino a 100 schede per transazione, decifra nuovamente ogni risultato per confrontarlo con il contenuto elettorale originale e prosegue per lotti. Se la connessione si interrompe si può rilanciare: le schede già protette non vengono duplicate o ricifrate.

L’operazione è riservata alla Commissione e rifiutata durante il voto e nelle pause tra giornate o consultazioni già iniziate. Gli audit riportano il numero delle schede trattate, non elettori o preferenze. Non elimina copie storiche, esportazioni, log del fornitore o backup esterni. Non cambia i voti e non rigenera le urne. La pubblicazione del codice non avvia questa trasformazione sui dati pregressi: occorre l’azione autenticata della Commissione.

## Cosa il controllo non può certificare

La cifratura è una **protezione del contenuto rispetto a chi legge soltanto il database**, non anonimizzazione irreversibile. Il backend che dispone della chiave può decifrare; il fornitore conserva metadati nativi. L’aggiornamento del diritto di voto e la creazione della scheda appartengono ancora alla stessa transazione: un amministratore con accesso ai metadati e alle chiavi può avere elementi di correlazione. La separazione delle collezioni e il rimescolamento in lettura non eliminano questa possibilità.

Il §4.3 dell’[Allegato tecnico 2026](https://www.tecnicadellascuola.it/wp-content/uploads/2026/08/Allegato_Tecnico_organi_collegiali_online.pdf) richiede una separazione strutturale più forte per il voto segreto. Per dimostrarla serve una valutazione indipendente dell’architettura, compresi amministratori, fornitore, transazioni, log e tempi; può richiedere una modifica architetturale oltre l’intervento limitato richiesto. Per questo il relativo controllo rimane **rosso**, con il rimando alle azioni necessarie, e non può diventare verde per il solo fatto che le schede sono cifrate.

La Nota MIM 3803/2026 riguarda le attività collegiali deliberative a distanza; non costituisce da sola una generale autorizzazione al rinnovo online degli organi elettivi. La scuola deve verificare la base giuridica della specifica elezione, gli atti MIM/USR applicabili e gli adempimenti organizzativi. Rimangono necessarie le valutazioni del titolare/DPO, la verifica dei fornitori e dei trasferimenti di dati, gli atti privacy, la DPIA quando richiesta e la gestione documentale. Il software non rilascia una certificazione legale automatica.

## Pallini e azioni di collaudo

- **Verde**: esito positivo dello specifico controllo indicato, non attestazione di sicurezza dell’intero sistema.
- **Rosso / Risolvi**: nuova verifica dei servizi, cifratura delle schede pregresse se consentita, apertura della configurazione pertinente o indicazione della prova/documentazione necessaria.
- Le prove manuali non eseguite e le verifiche di conformità non diventano positive automaticamente. Un errore di rete rimane un errore. I pulsanti non alterano voti, termini, attestazioni o autorizzazioni per far apparire il sistema regolare.

## Verifica software dell’aggiornamento

`node scripts/check-consultations.cjs` verifica con dati fittizi: limiti delle fasce orarie e fuso italiano, periodi separati, pause, cifratura/decifratura, integrità, chiavi errate, esclusione di metadati personali, invio ripetuto, chiusura durante l’invio, embargo delle preferenze, pubblicazioni distinte, congelamento, privilegi e migrazione ripetibile. Gli altri controlli del repository verificano autorizzazioni, rapporti di collaudo ed esportazione paginata delle evidenze. Queste verifiche non sostituiscono il collaudo indipendente dell’installazione in esercizio.


## Aggiornamento Allegato A — 13 settembre 2026

Il processo nominativo resta bloccato. La versione V2 aggiunge credenziali non nominative in presenza e una sequenza vincolata di collaudo, verifica indipendente e autorizzazione della Commissione. Non basta una singola conferma. Vedere la [procedura corrente](19_FASCICOLO_DPO_E_RIPRESA.md), che documenta condizioni operative e rischi residui; le misure crittografiche ulteriori non sono dichiarate implementate.
