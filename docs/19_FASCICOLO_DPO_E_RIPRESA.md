# Fascicolo DPO, credenziali non nominative e gestione della ripresa

Versione funzionale: LEVI_ALLEGATO_A_2026_V2 / LEVI_DPO_REVIEW_2026_V1. Aggiornamento: 13 settembre 2026. Il commit effettivo viene rilevato dal backend Vercel nel fascicolo scaricato; non sostituirlo con un nome generico del sito.

Questo documento aggiorna la precedente analisi V1: il blocco non è più incondizionato per ogni architettura. È disponibile un processo distinto **in presenza con credenziali non nominative**, soggetto a collaudo e decisioni documentate. Il vecchio token collegato al nome rimane escluso dal voto reale. Non viene dichiarato anonimato assoluto o scrutinio end-to-end.

## Fascicolo DPO / Privacy Review

Aprire **Commissione → Regolarità → Fascicolo DPO / gestione blocchi**. Solo la Commissione autenticata consulta la documentazione completa e i riferimenti organizzativi, scarica il **PDF dettagliato per il DPO** oppure lo **ZIP con tutte le evidenze**. L’area tecnica mantiene controlli, log e verifica degli interventi senza accedere al fascicolo organizzativo completo. La pagina pubblica `fascicolo-dpo.html` contiene esclusivamente informazioni essenziali per gli utenti.

Il backend controlla ruolo, account, annualità e revoca prima di fornire i materiali. L’output pubblico Vercel e la configurazione GitHub Pages escludono documenti operativi, inventari, prove di sviluppo e sorgenti backend. Il repository sorgente resta pubblico: questi accorgimenti proteggono l’accesso ai documenti operativi sul sito e ai dati riservati dell’applicazione, ma non rendono segrete le informazioni già pubblicate nella cronologia Git. Non inserire mai dati operativi riservati nel repository.

Il DPO è **Vargiu Scuola S.r.l. — dpo@vargiuscuola.it**, secondo l’Allegato A e la conferma del referente scolastico. Inserire gli estremi dell’atto di designazione nel fascicolo. Il DPO valuta il trattamento e suggerisce misure: non gli si chiede di autorizzare il voto telematico o certificare la validità giuridica delle elezioni. La decisione organizzativa ed elettorale rimane agli organi competenti; il Titolare conserva la propria responsabilità privacy.

Lo ZIP comprende:

- PDF con architettura, collezioni e accessi, flusso, anonimato e limiti, unicità, apertura/chiusura, scrutinio, backup, fornitori, sicurezza, rischi, incidenti, informativa e conservazione;
- fotografia riservata della revisione e dei dati organizzativi dichiarati;
- matrice delle attestazioni con riferimenti alle evidenze;
- tutti i log tecnici accessibili nell’annualità, con paginazione verificata; i log del provider sono separati;
- inventario delle componenti e delle impronte dei file;
- relazione delle prove automatiche di sviluppo, distinta dai collaudi dichiarati dagli operatori;
- copie delle pagine informative e questa procedura;
- manifest SHA-256 dei file inclusi.

Se una risorsa o una pagina dei log manca, l’esportazione non dichiara un fascicolo completo e fallisce. I contenuti del database elettorale, le urne, i codici di voto, le password e le chiavi non vengono acquisiti per generare il fascicolo. Le annotazioni dello staff possono essere riservate: custodire lo ZIP, non pubblicarlo su GitHub o all’albo. L’hash deve essere confrontato con una copia attendibile; non sostituisce protocollo, firma e conservazione.

## Prima del voto: completare la documentazione

1. Verificare la base giuridica della specifica consultazione e gli atti applicabili a Consiglio, Consulta e rappresentanti di classe. L’O.M. 215/1991, le disposizioni sulla Consulta, le indicazioni annuali MIM/USR e gli atti scolastici non sono intercambiabili. La Nota MIM 3803/2026 sulle attività collegiali deliberative a distanza non è assunta come autorizzazione generale alle elezioni digitali.
2. Compilare anno, date/ore Europe/Rome, liste, schede, postazione, tecnico, orari di assistenza e contatto. Adottare e protocollare l’Allegato A dove previsto. Definire una modalità alternativa ammessa se il canale digitale non risulta idoneo.
3. Nella scheda DPO inserire riferimenti verificabili a contratti e sub-responsabili, localizzazioni, trasferimenti, screening DPIA e DPIA quando necessaria, rischi residui, backup e restore, conservazione, accessibilità, incidenti e custodia. Le caselle vuote restano non documentate. Le configurazioni dei cloud non sono desumibili dal solo codice.
4. Concludere gli elenchi, registrare la loro definitività. Le candidature di classe continuano a essere verificate rispetto al registro nominativo. Il registro e il vecchio archivio non vengono cancellati o riscritti automaticamente.

## Codici non nominativi e riconoscimento in presenza

Nella seconda sezione del fascicolo scegliere la modalità in presenza con codici non nominativi. Non è possibile cambiare processo quando le urne sono già popolate o la procedura è iniziata. Non è una conversione retroattiva delle schede pregresse.

Generare prima dell’autorizzazione i lotti per componente/classe, da 1 a 250 cedolini alla volta. Il totale emesso non può superare gli aventi diritto registrati nel gruppo. Il server genera un prefisso di componente (STU-, GEN-, DOC-, ATA-) e sei caratteri alfanumerici casuali, verifica le collisioni e conserva solo l’hash del codice normalizzato con l’anno. Il formato breve ha uno spazio di combinazioni inferiore rispetto ai precedenti codici da 128 bit: le postazioni autorizzate e i controlli sugli accessi restano parte necessaria della procedura. La raccolta delle credenziali contiene componente/classe e flag, nessun nome o ID del registro. Il lotto registra soltanto quantità, gruppo e riferimento amministrativo. Le urne continuano a usare identificativi casuali indipendenti.

La generazione offre una sola stampa PDF, senza nomi. Non effettuare generazioni di prova in Production. Non è disponibile una ristampa dal database: se il file o la risposta va perso, non premere ripetutamente per produrre sostituzioni; il conteggio del lotto protegge dal superamento degli aventi diritto. Il seggio deve verbalizzare una gestione sicura dei lotti e della perdita prima di consentire l’uso. La necessità di tale gestione è un limite operativo esplicito.

Il seggio deve:

- identificare l’avente diritto con la procedura formalmente adottata e registrare una sola consegna per le consultazioni pertinenti;
- far estrarre un cedolino chiuso casualmente dal lotto corretto, senza annotarne il codice vicino al nome e senza ordine corrispondente al registro;
- tenere separati identificazione, distribuzione e cabina; evitare registrazioni puntuali nome/orario/postazione che ricostruiscano la sequenza;
- presidiare stampante, stampe eccedenti, file scaricati, browser, accessi cloud e log di rete; non inviare i codici tramite posta nominativa;
- definire l’uso del medesimo codice nelle consultazioni distinte e la custodia dei cedolini inutilizzati; non emettere una seconda credenziale perché la connessione è caduta.

Questo processo riduce il collegamento diretto nel database. La segretezza rimane da verificare anche rispetto a IP, tempi, piccoli gruppi, osservazione fisica, esportazioni e collusione. Il server tratta la scelta e conserva la chiave di cifratura: non sono integrate firme cieche, cifratura nel browser, custodi multipli o prove crittografiche universali. Se l’analisi indipendente ritiene essenziali misure ulteriori, il requisito non va dichiarato superato; occorre adottarle o usare la procedura alternativa consentita.

## Collaudo, verifica e apertura

Prima completare documentazione, configurazione e lotti. Il loro cambiamento dopo la verifica ne invalida il collegamento alla versione.

1. Nell’area tecnica registrare un **collaudo su dati fittizi in ambiente isolato**. Per ogni prova indicare requisito, metodo, atteso, osservato, data effettiva, esito ed evidenza. Sono previste identità, revoca, doppio voto, tempi, manipolazione schede, congelamento, rete, scrutinio, ripristino, accessibilità, segretezza e cloud. Il nome deriva dall’account autenticato; non utilizzare account condivisi.
2. Il rapporto deve riferirsi alla release Vercel e alla configurazione previste. La dichiarazione registrata non esegue le prove: occorre allegare e conservare i risultati reali. Solo tutte le prove dichiarate PASS permettono di richiamarlo nella proposta.
3. Completare i controlli di Regolarità con gli estremi degli atti, incluso il rapporto tecnico. Questo passaggio non abilita da solo il voto.
4. Registrare **Proponi risoluzione** con rapporto, motivo, protocollo e SHA-256 del documento. Il selettore file calcola l’impronta nel browser: non carica il documento, che deve essere conservato agli atti.
5. Una persona diversa dall’autore del collaudo e dal proponente registra **Verifica indipendente: superato**, con la propria evidenza. Il confronto dei nomi/account è un presidio applicativo; le nomine devono assicurare un’indipendenza effettiva.
6. La Commissione registra **Autorizza** dopo la verifica di un’altra persona e tutti i controlli completi. Un esempio con due persone è: un componente nominativo della Commissione esegue/protocolla le prove e propone, il tecnico indipendente verifica, la Commissione decide. Se autore e proponente sono persone diverse, occorre un ulteriore verificatore indipendente. Non creare più account della stessa persona per simulare la separazione.
7. L’ammissione non apre prima dell’ora prevista e non riapre consultazioni chiuse. Il backend controlla lo stato a ogni accesso e a ogni deposito. Ogni cambio di commit o configurazione richiede nuova revisione. L’informazione sulla pagina principale è indicativa del momento del caricamento: prevale sempre la verifica server al voto.

**Non è stato acquisito automaticamente un parere DPO, né effettuato un collaudo indipendente Production.** La presenza della funzione non significa che la specifica elezione sia già stata autorizzata.

## Blocco, intervento e ripresa

Un incidente può essere registrato senza sospendere o con sospensione. Registrarlo senza sospensione non annulla una sospensione già attiva. In caso di sospensione, evento e blocco sono scritti in transazione; la precedente autorizzazione viene invalidata e resta richiamata nella storia.

Il tecnico documenta intervento e prove, una persona diversa verifica; la Commissione autorizza e registra infine **Ripresa**, con protocollo e motivazione. Non si può riprendere con verifiche incomplete, configurazione cambiata o procedimento chiuso. La ripresa non estende le ore di voto e non modifica i voti già depositati. Un requisito essenziale ancora non soddisfatto resta “non superato”; il comando non è una deroga all’Allegato A.

## Recupero dopo errore di rete

Il voto e il consumo dei relativi diritti sono atomici. Se si perde la risposta, il browser controlla la ricevuta della sessione: `COMMITTED` significa registrato, `PENDING` significa sessione ancora aperta, `UNKNOWN_OR_EXPIRED` richiede nuovo accesso con lo stesso codice. La ricevuta non contiene preferenze, ID di scheda o identità; non certifica il contenuto del voto e non è una ricevuta elettorale nominativa. L’applicazione non promette che il voto sia perso solo perché il browser mostra un errore. I diritti già consumati restano tali, impedendo il doppio voto.

## Aspetti da verificare esternamente

MFA/IAM, localizzazione e log dei fornitori, Rules distribuite, backup/ripristino, firme e conservazione, nomine, consegna dei codici, accessibilità reale e valutazione DPIA richiedono prove della scuola. Non vengono simulati o autocertificati dal programma. La documentazione degli artt. 28 e del capo V GDPR non è ottenuta automaticamente dal service account. Le prove di sviluppo sono leggibili in `verifiche-sviluppo.json`; i loro limiti sono parte del fascicolo.
