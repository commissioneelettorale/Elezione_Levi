# Token elettorali brevi

Formato richiesto: prefisso `STU-`, `GEN-`, `DOC-` o `ATA-` e sei caratteri casuali,
con almeno una lettera e un numero. Il generatore evita I, O, 0 e 1 per agevolare
la lettura. Le collisioni sono verificate nella transazione prima di creare i documenti.

Importazioni, generazione manuale e nuovi lotti anonimi usano il nuovo formato.
Le credenziali anonime continuano a essere memorizzate esclusivamente come hash
del codice normalizzato e dell'anno; i cedolini riportano il prefisso e il trattino.
Le sessioni di voto mantengono la propria casualità a 256 bit.

## Aggiornamento dei codici già presenti

Il workflow `Migrate voter token format` è limitato alla richiesta di migrazione
`ops/voter-token-format-2026-2027.json` e all'anno attivo 2026/2027. Attende prima
che Vercel Production esponga lo stesso commit. Non legge o modifica gli account
della Commissione, degli altri operatori o le chiavi dei referenti.

La procedura controlla lo stato prima di scrivere: nessun elenco definitivo,
autorizzazione al voto, finestra iniziata, scheda espressa, credenziale anonima già
emessa o sessione di voto attiva. Se un vincolo non è soddisfatto, si interrompe.

I documenti del registro vengono trasferiti ai nuovi identificativi in blocchi
atomici di 100. Ogni campo dell'elettore è copiato senza modifiche. Una copia
riservata è conservata sotto `migrazioni_token_2026_2027/<id>/backup`, accessibile
solo all'amministrazione tramite Admin SDK e soggetta alla conservazione del
registro originale. Nessun nominativo o codice viene scritto nei log GitHub.

Durante la migrazione sono bloccati nuovi inserimenti e modifiche alla
configurazione/autorizzazione. Un'interruzione mantiene lo stato da completare;
rieseguire lo stesso workflow riprende i blocchi mancanti. Una migrazione già
completata non cambia nuovamente i codici. Il controllo finale verifica formato,
numero complessivo e conteggi per componente.

I vecchi codici sostituiti non sono più utilizzabili: occorre ristampare i cedolini
e i registri dall'area Commissione. Il caricamento dello stesso file già importato
mantiene le ricevute e non ricrea gli elettori.

Le prove automatiche usano dati fittizi e includono 1.501 registrazioni, copia
integrale dei campi, interruzione/ripresa, collisioni, blocchi e conservazione
degli account. L'esito della migrazione reale è attestato separatamente dai log
del workflow, con soli conteggi aggregati.
