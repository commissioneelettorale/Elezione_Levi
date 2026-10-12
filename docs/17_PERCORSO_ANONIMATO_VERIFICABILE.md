> **Aggiornamento V2 — 13 settembre 2026:** il precedente blocco generale V1 è sostituito dal processo in presenza con credenziali non nominative, collaudo, verifica indipendente e autorizzazione registrata. Il processo nominativo resta escluso. I riferimenti successivi al blocco V1 descrivono quella valutazione precedente. Fare riferimento alla [procedura corrente](19_FASCICOLO_DPO_E_RIPRESA.md) e al Fascicolo DPO. Non sono dichiarati anonimato assoluto o cifratura end-to-end.

# Soluzione architetturale per la riservatezza del voto

Decisione tecnica del 13 settembre 2026. Questo documento distingue la soluzione identificata dalle funzionalità già implementate: non dichiara realizzata una migrazione crittografica che non è stata eseguita.

## Obiettivo verificabile

Impedire che il solo amministratore applicativo o del database possa ricostruire il voto individuale. Specificare anche le condizioni: componenti non compromesse, quorum di custodi non collusi, dimensione del gruppo di voto, informazioni già pubbliche e accessi del fornitore. “Anonimato assoluto contro chiunque” non è un criterio di collaudo dimostrabile: anche un risultato unanime può rivelare la scelta dei partecipanti.

## Architettura individuata

Integrare un motore elettorale esistente con cifratura nel dispositivo, prove crittografiche di validità della scheda, scrutinio verificabile e custodi delle chiavi indipendenti. Per il conteggio delle preferenze, privilegiare il calcolo sui cifrati e la decifratura dei soli totali; non decifrare le singole schede nel backend del portale.

La [documentazione Helios](https://vote.heliosvoting.org/faq) descrive questo modello e l’impiego di più custodi. La [documentazione del protocollo Belenios](https://www.belenios.org/howitworks.html) illustra cifratura, credenziali e prove di validità. Si tratta di riferimenti da valutare sulla specifica installazione, non di attestazioni di conformità italiana né di servizi già integrati nel sito.

Per l’autorizzazione non collegabile al deposito può essere valutato un protocollo di credenziali cieche, secondo una composizione analizzata da specialisti. La [RFC 9474](https://datatracker.ietf.org/doc/html/rfc9474) descrive firme RSA cieche e le cautele di implementazione. Non riutilizzare per tale protocollo la chiave privata del service account Firebase. La [RFC 9576](https://datatracker.ietf.org/doc/html/rfc9576), in particolare le sezioni 5–6, chiarisce i limiti derivanti da metadati, diversità delle chiavi e riduzione dei gruppi di anonimato. Nessuna di queste RFC, da sola, definisce o certifica un sistema di voto scolastico.

### Separazioni richieste

| Funzione | Informazione necessaria | Informazione da escludere |
|---|---|---|
| Autorità degli aventi diritto | Identità, componente, diritto a ricevere la credenziale | Preferenze; identificativo collegabile alla scheda depositata, secondo il protocollo scelto |
| Raccolta delle schede | Cifrato, prova di validità, prova del diritto a un voto unico | Preferenze in chiaro; nominativo o token nominale del portale |
| Custodi dello scrutinio | Quota di chiave e prove da verificare dopo la chiusura | Accesso individuale sufficiente a decifrare; chiavi del registro nominale |
| Portale Commissione | Totali verificati, atti e prove dell’esito | Combinazioni originali di preferenze per elettore |

La separazione riguarda anche account cloud, amministratori, deploy, segreti, log e backup. Due collezioni o due endpoint controllati integralmente dallo stesso soggetto non realizzano questa separazione. Una normale funzione `shuffle` sull’array non è una mixnet crittograficamente verificabile.

## Adattamento al Primo Levi

Le pagine, i calendari e gli atti distinti rimangono il portale organizzativo. La nuova integrazione deve essere verificata sulle singole consultazioni, senza assimilare Consiglio d’istituto, Consulta e rappresentanti di classe.

Il modello della scheda deve vincolare insieme lista prescelta e candidati ammessi. Mappare lista e preferenze come domande indipendenti può consentire combinazioni vietate: è necessario dimostrare i vincoli attraverso il protocollo o adottare una rappresentazione valida supportata dal motore. Verificare inoltre limiti di preferenze, duplicati, schede bianche, gruppi di elettori, orari, prima/ultima votazione ammessa e possibilità di ripetere l’invio.

Gli attuali algoritmi per seggi ed ex aequo possono essere alimentati da risultati verificati, ma l’importazione richiede confronto di conteggi e test su dati fittizi. Questo aggiornamento non modifica tali algoritmi e non introduce un’importazione automatica da fonti non verificate.

## Criteri di accettazione dell’installazione

1. L’analisi dei messaggi dimostra che la preferenza lascia il dispositivo soltanto cifrata.
2. Il gestore del portale non possiede materiale sufficiente a decifrare le schede.
3. Il quorum dei custodi, il recupero e le incompatibilità degli accessi sono documentati e provati.
4. Schede arbitrarie, candidature fuori lista, credenziali false e invii doppi sono rifiutati con prove verificabili.
5. Emissione e deposito non sono collegabili secondo il modello di minaccia, includendo IP, tempi, identificatori delle transazioni e dati del fornitore.
6. La verifica indipendente del risultato, inclusi bianche e totali per componente, coincide con il dataset di prova.
7. Perdita di rete, malfunzionamenti, gestione incidenti e indisponibilità di un custode rispettano il piano formalmente adottato.
8. Regole elettorali, fornitore, ruoli privacy, trasferimenti, conservazione e valutazioni del titolare/DPO sono verificati separatamente.

Servono una destinazione di hosting/servizio autorizzata, custodi indipendenti effettivamente individuati e un collaudo esterno del motore e della sua configurazione. Questi soggetti e questa infrastruttura non sono disponibili nella configurazione Vercel/Firebase attuale. Non è quindi stato attivato un nuovo protocollo sperimentale sulle urne reali.

## Misure pubblicabili nella versione corrente

- Cifratura delle nuove schede con integrità e dimensione costante, usando la configurazione server esistente.
- Proiezioni aggregate per **tutti** i ruoli applicativi, inclusa la Commissione. Gli originali cifrati restano nel database protetto per le procedure formali; non sono restituiti dalle API del portale.
- Ricostruzioni basate esclusivamente sui margini di conteggio: a pari totali non si restituiscono indizi sugli abbinamenti originali delle preferenze.
- Calendari, atti, pubblicazioni e ricorsi distinti per consultazione; orari controllati dal server.
- Valutazione architetturale non modificabile dal modulo utente, inclusa nei nuovi checkpoint e rapporti. La conferma di prove manuali non cambia la valutazione di separazione strutturale.
- Correzione delle diciture che promettevano anonimato o segretezza assoluti nei cedolini.

Queste sono riduzioni concrete dell’esposizione, **non il completamento dell’architettura obiettivo**. Le schede pregresse e le copie storiche non vengono rese retroattivamente non correlabili pubblicando il nuovo codice. Non cancellare o modificare gli originali per far scomparire le evidenze del problema.


## Aggiornamento Allegato A — 13 settembre 2026

Il processo nominativo resta bloccato. La versione V2 aggiunge credenziali non nominative in presenza e una sequenza vincolata di collaudo, verifica indipendente e autorizzazione della Commissione. Non basta una singola conferma. Vedere la [procedura corrente](19_FASCICOLO_DPO_E_RIPRESA.md), che documenta condizioni operative e rischi residui; le misure crittografiche ulteriori non sono dichiarate implementate.
