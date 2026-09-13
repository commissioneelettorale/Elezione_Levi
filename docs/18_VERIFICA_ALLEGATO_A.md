> **Aggiornamento V2 — 13 settembre 2026:** il precedente blocco generale V1 è sostituito dal processo in presenza con credenziali non nominative, collaudo, verifica indipendente e autorizzazione registrata. Il processo nominativo resta escluso. I riferimenti successivi al blocco V1 descrivono quella valutazione precedente. Fare riferimento alla [procedura corrente](19_FASCICOLO_DPO_E_RIPRESA.md) e al Fascicolo DPO. Non sono dichiarati anonimato assoluto o cifratura end-to-end.

# Adeguamento all’Allegato A — 13 settembre 2026

Stato V2: **processo in presenza con credenziali non nominative disponibile; ammissione della singola consultazione subordinata al collaudo indipendente e agli atti registrati**. Nessuna elezione reale è stata aperta con l’aggiornamento del codice.

Documento esaminato: `ALLEGATO_A_Note_Legali.docx`, ricevuto dall’utente; SHA-256 `30b1aadb76827d584a379826da9d5d8d854941732b03f17a76bcf713c19b2102`.
L’atto di adozione, la versione formale, il verificatore, l’approvatore e le date del documento ricevuto contengono campi non compilati. L’aggiornamento del sito non li compila in nome della scuola e non presenta l’Allegato A come un’ordinanza ministeriale.

## Limite del processo nominativo e percorso V2

L’Allegato A, §§ 1.4, 3.4, 7.5–7.6, 7.15, 8.17 e 8.22, richiede verifiche sull’intera catena identità–sessione–voto–log–metadati–backup e impone il blocco in assenza di un requisito essenziale. In questa architettura lo stesso backend riceve credenziale/sessione e scheda e controlla la chiave di cifratura; i metadati nativi possono correlare le scritture. Questo limite non si risolve con una spunta, un hash o un verbale.

**Il server mantiene escluso il processo nominativo.** La V2 integra un archivio separato di credenziali casuali senza abbinamento agli individui, destinato alla distribuzione casuale dopo riconoscimento in presenza. Introduce rapporto di collaudo, proposta, verifica indipendente e autorizzazione vincolati a commit, configurazione e revisione. Metadati, server con chiave, distribuzione e piccoli gruppi restano rischi da valutare; il software non li dichiara inesistenti. Se una verifica essenziale fallisce il requisito rimane non superato. La procedura è documentata in `19_FASCICOLO_DPO_E_RIPRESA.md` e nella pagina pubblica `fascicolo-dpo.html`. Nessun voto esistente è stato cancellato o convertito durante questo intervento.

## Matrice di riscontro

| Allegato A | Adeguamento presente nel software | Evidenza o attività ancora necessaria |
|---|---|---|
| I: titolare, finalità, basi, categorie, destinatari, diritti | Pagina pubblica `note-legali.html`, accessibile senza login; distinzione tra trattamento istituzionale e consenso ai tracciamenti | Informativa specifica e atti formalmente adottati dal Titolare; verifica delle condizioni applicabili ai singoli trattamenti |
| 1.2: DPO | Vargiu Scuola S.r.l., dpo@vargiuscuola.it, confermato dal referente scolastico e coerente con Allegato A | Acquisire riferimento formale alla designazione e custodirlo nel fascicolo |
| 1.6–1.7, 3.11–3.12: cloud | Inventario delle funzioni Vercel, Firebase/Google e GitHub Pages; esclusa ogni promessa di sola localizzazione UE | Contratti/atti art. 28, sub-responsabili, regioni, assistenza da Paesi terzi, garanzie del capo V, backup e log del fornitore |
| 1.8: conservazione | Distinzione fra atti, credenziali/sessioni, dati di partecipazione, log e copie; nessuna cancellazione distruttiva dal canale web | Piano concreto per categoria, responsabile, durata/criterio, procedura di scarto, legal hold, eliminazione presso i fornitori e verifica dei backup. Non esiste un TTL generalizzato attestato |
| 1.9–1.12: diritti e DPIA | Recapiti istituzionali, diritti e reclamo distinti dai ricorsi elettorali; voce privacy/DPO | Screening DPIA documentato e, se necessaria, DPIA riferita al sistema effettivo. Nessuna dichiarazione automatica di DPIA completata |
| II: cookie, sessioni, tracciamento | Autenticazione in memoria; registro dimostrativo in memoria; rimozione mirata della precedente cache; nessun analytics o cookie impostato dall’app; API con `credentials: omit` | Test browser/rete su tutte le fasi e domini, inclusi strumenti del provider, dispositivi condivisi, ripresa dopo interruzione. Non è certificata l’assenza di ogni cookie/identificatore infrastrutturale |
| 2.2: persistenza | Nuove sessioni non persistenti; nessuna cache offline Firestore; scadenza sessione voto 15 minuti | Il ricaricamento richiede nuovo accesso; una sessione già creata resta occupata fino a scadenza lato server. Il logout locale non cancella automaticamente tutti i record o i file scaricati |
| 3.2, 7.4, 7.9: accessi | Ruoli/anno/account attivo controllati dal server; revoca/versione sessioni; nessun accesso tecnico ai voti | Identificazione/consegna personale, account nominativi, MFA e privilegi cloud, doppio controllo esterno; non attestati dalla sola interfaccia |
| 3.3: collaudo | Dodici prove con esiti non precompilati, riferimenti, versione dichiarata, operatore autenticato; checkpoint e PDF | Prove operative indipendenti su configurazione, carico, ripristino e postazioni reali; firme e protocollazione |
| 3.4, 8.12: log | Errori API con sola operazione e codice; escluso messaggio SDK potenzialmente sensibile; audit amministrativo; storia delle nuove conferme salvata nella stessa transazione | Log del fornitore, protezione dall’amministratore privilegiato, custodia indipendente, accessi e termini. Il database non è un archivio immutabile |
| 3.5, 7.5–7.6: voto | Cifratura autenticata delle schede previste, campi minimizzati, sola proiezione aggregata alle aree applicative, controllo di manomissione | Processo in presenza con codici non nominativi e verifica indipendente di distribuzione, metadati e rischi residui. Cifratura end-to-end/custodi multipli restano misure ulteriori non integrate. Non confermare requisiti essenziali non soddisfatti |
| 3.6, 8.6–8.8: sicurezza e dipendenze | Inventario riproducibile delle componenti e controllo delle dipendenze; nessun failover sul vecchio backend | Analisi indipendente, penetration test e supply chain dell’ambiente effettivo; chiusura vulnerabilità e rischio residuo verbalizzati |
| 3.7–3.9: incidenti e continuità | Registro incidenti, sospensione/ripresa motivata, export dei checkpoint | Matrice escalation tecnico/cyber/privacy/elettorale, persone e reperibilità; RTO/RPO, restore e criteri di ripresa verificati. Nessuna notifica automatica al Garante |
| IV: accessibilità | Testo leggibile, focus visibile, salto al contenuto, pagina informativa senza JavaScript, canale di assistenza | Verifiche manuali WCAG/EN pertinenti, tecnologie assistive, dichiarazione per questo dominio, luogo e orari effettivi della postazione |
| V: segnalazioni e ricorsi | Canali tecnici/privacy/whistleblowing distinti; registri e termini ricorsi per consultazione | Competenza, termini, protocolli e decisioni reali; conservazione selettiva delle evidenze in contenzioso |
| VI: pubblicazione e verbali | Informazioni sul ruolo tecnico separato dalla Commissione; niente log nominativi sul portale pubblico; elaborati tecnici da sottoscrivere | Controllo a quattro occhi, pubblicazione minima richiesta dagli atti, rischio piccoli gruppi e archivio istituzionale |
| 7.1–7.3, 8.1: legittimità | Atti/calendari distinti per Consiglio, Consulta e classi; controllo specifico sulla base giuridica digitale | Fonte annuale effettivamente applicabile, tipo rinnovo/suppletive, atto di indizione e valutazione della modalità digitale per ciascuna consultazione |
| 7.7–7.8: correttezza | Algoritmo esistente preservato; verifica duplicati/preferenze/orari, esito aggregato; ex aequo invariati | Scrutinio su dati noti, confronto indipendente e verifica del motore definitivo prima di riabilitare il voto |
| 8.2–8.5, 8.11, 8.25–8.27 | Release/configurazione nelle nuove evidenze, congelamento di schede e atti, matrice responsabilità da documentare | Threat model, quattro occhi, break-glass, custodi e catena repository/build/deployment/configurazione; non sostituibili da una conferma del solo sviluppatore |
| 8.13, 8.20–8.24, 8.28 | Nove ulteriori controlli in Regolarità; matrice JSON con hash, atti, scope, note, versione e blocchi; nuove conferme con account, data e storia | Pacchetto di adozione/avvio, verificatore e approvatore competenti, fascicolo conservato. Gli allegati operativi ricevuti restano modelli da compilare, non prove già eseguite |
| 8.14–8.16, 8.23 | Nessun uso AI/profilazione integrato; riferimenti di ambito espliciti | Verificare applicabilità NIS2/altre norme, standard AgID pertinenti e fonti correnti. Non si assume automaticamente l’applicabilità del CCNL o delle regole dei servizi di accessibilità a ogni attività |

## Come usare quanto aggiunto

1. Aprire **Commissione → Regolarità**: i nuovi controlli richiedono un’annotazione con consultazione, fonte/atto, protocollo, data, soggetto che ha verificato ed evidenza nel fascicolo. Confermare soltanto quanto è dimostrato. Gli esiti sono dichiarazioni documentali, non validazioni automatiche dell’atto.
2. **Scarica matrice requisiti ed evidenze** genera JSON con il contenuto restituito dal server e SHA-256. Conservare la copia originale nel fascicolo riservato: può contenere riferimenti ai verificatori. Non pubblicarla insieme ai risultati.
3. **Collaudo / Assistente tecnico** conserva le prove dichiarate e i checkpoint. I nuovi eventi contengono release (se Vercel la espone), impronta della configurazione e condizione di blocco. Le registrazioni storiche non vengono retroattivamente certificate.
4. **Configurazione**: completare per ogni elezione atti e finestre orarie e distinguere rinnovo/suppletive; completare nome, luogo, orari e contatto istituzionale della postazione assistita.
5. I pulsanti “Risolvi” rieseguono i controlli o avviano le sole procedure previste: non approvano documenti, non eliminano prove e non attestano la non correlazione.

## Fascicolo minimo da completare dalla scuola

Gli allegati operativi dell’Allegato A vanno compilati e conservati per la specifica consultazione. Non si autocertificano con la pubblicazione di questo documento.

- **Prima del voto:** scheda della consultazione; atto applicabile e dossier di legittimità; adozione; elenchi/credenziali; informativa e contatti DPO allineati; screening DPIA; fornitori/trasferimenti; RACI; inventario; baseline e versione; threat model; relazione indipendente di non correlazione; test accessibilità e ripristino; chiavi/custodi; piano incidenti e continuità; autorizzazioni e registro finale.
- **Durante:** checkpoint di apertura, registro incidenti e modifiche, eventuali sospensioni/riprese, autorizzazioni, verifiche e catena di custodia. I registri non devono contenere le preferenze degli elettori.
- **Dopo:** checkpoint di chiusura, scrutinio verificato, ex aequo verbalizzati, confronto a quattro occhi, verbali sottoscritti, pubblicazione minima, ricorsi/decisioni, revoca incarichi, versamento in conservazione, cancellazione autorizzata dei dati temporanei e gestione delle copie.

Per ogni rischio/correzione: requisito, probabilità/impatti, esecutore, autorizzante, termine, evidenza attesa, verificatore di chiusura ed esito. Per la continuità: RTO/RPO deliberati, data del test, dati/chiavi recuperati, controllo dei totali, durata effettiva, anomalie e decisione di ripresa. I campi non compilati devono restare “non verificati”.

## Fonti e limiti della verifica

- Documento Allegato A fornito dall’utente: specifiche e modelli oggetto dell’adattamento; adozione non attestata.
- [Informativa ufficiale Levi Seregno](https://www.leviseregno.edu.it/privacy), per i contatti generali della scuola; il referente ha confermato Vargiu Scuola quale DPO vigente.
- [O.M. 215/1991, copia istituzionale USR FVG](https://usrfvg.gov.it/archivio/export/sites/default/USRFVG/allegati/archivio_file/organi_collegiali/om215_91.pdf), da coordinare con modifiche e atti della singola elezione.
- [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=it), [Garante: cookie e altri strumenti](https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9677876), [Firebase: persistenza dell’autenticazione](https://firebase.google.com/docs/auth/web/auth-state-persistence).
- L’ambito della nota MIM 3803/2026 indicato nell’Allegato A è quello delle attività collegiali deliberative a distanza; non è trattata come autorizzazione delle elezioni. Non sono stati inventati decreti USR Lombardia 2026 o protocolli mancanti. Le copie ufficiali applicabili devono essere acquisite nel fascicolo.
- Le verifiche di sviluppo usano dati fittizi e dipendenze simulate per il database: non sono una prova operativa delle regole Firestore distribuite, dei backup, del DPO, dei contratti o dell’indipendenza dei custodi. La funzionalità del browser e dei dispositivi deve essere verificata nel collaudo operativo. Il rilascio non certifica conformità completa, inattaccabilità o anonimato assoluto.


## Verifiche eseguite per questo aggiornamento

- Sei suite locali: accessi/revoche, orari e transazioni, collaudo/esportazioni complete, documenti distinti per consultazione, memoria del browser/assenza di fallback e generazione del verbale con limiti e impronte. Dati fittizi, nessun voto reale.
- Verificati il rifiuto del processo nominativo, i lotti casuali e i limiti agli aventi diritto, proposta/verifica/autorizzazione con persone distinte, sospensione/ripresa, invalidazione dopo modifiche e recupero della ricevuta. Le API effettive sono eseguite con database simulato e dati fittizi; nessun parere o collaudo reale è inventato dalla prova.
- Caricamento del backend con Node 22.23.2 e caricamento CommonJS di moduli ESM disabilitato: superato.
- Verbale PDF prodotto dalla funzione dell’applicazione, testo estratto e pagina verificata visivamente: nessun taglio dei campi, esito bloccante presente.
- Firebase Admin aggiornato a 14.4.0. Override limitato a `gaxios@6.7.1 → uuid@11.1.1`: la libreria chiamante utilizza `v4()`, compatibile con l’export CommonJS; chiusa la segnalazione GHSA-w5hq-g745-h8pq. `npm audit --omit=dev` sul lockfile finale: 0 segnalazioni. Questo risultato non copre SDK remoti, librerie vendorizzate, configurazione cloud o vulnerabilità non note.
- [Inventario della release](inventario-release.json): impronte degli asset, versioni/origini/licenze del lockfile e SDK remoto. Rigenerabile con `node scripts/build-release-manifest.cjs`; non contiene credenziali o dati del database. Non sostituisce la SBOM dei fornitori.

Il collaudo operativo con credenziali e dati reali, i test browser sui dispositivi adottati e il controllo indipendente dell’infrastruttura non sono attestati da queste verifiche.
