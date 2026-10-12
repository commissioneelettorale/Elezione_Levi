# Verifica mirata del cruscotto e del collaudo (8 ottobre 2026)

## Correzione
Il cruscotto Direzione/Segreteria invocava `aggregateVoteCollection` senza definirla. La funzione e i relativi test sono stati isolati in `lib/management-aggregate.js` e `scripts/check-management-aggregate.cjs`. L'interfaccia usa la proiezione aggregata del backend e non legge schede identificative.

## Separazione fra affluenza e preferenze
- Durante le votazioni: solo numero di schede/affluenza, senza supporre che le schede siano valide o bianche.
- Dopo la chiusura e prima della pubblicazione: il backend continua a oscurare le preferenze agli account gestionali. La Commissione può accedere alle proiezioni previste dal processo di scrutinio.
- Dopo rilascio: la visualizzazione delle preferenze dei rappresentanti di classe è limitata ai ruoli gestionali previsti dal cruscotto. I dati del Consiglio d'Istituto e della Consulta restano aggregati per consultazione, non divisi per classe.
- Mai esportare abbinamenti fra identità, token, preferenza e data/ora del voto; non riutilizzare proiezioni sintetiche come schede originali.

## Collaudo
La sezione 14 preesistente contiene già schede e codici fittizi, apertura in orario simulato, 1.500 votanti locali e rifiuto del doppio invio. È un collaudo del modello **nel browser**, non una prova di 1.500 utenti simultanei verso Vercel e Firebase. Il suo report non costituisce un verbale elettorale reale. Prima di attivare la consultazione reale occorrono verifica indipendente, verbali sottoscritti, esiti tecnici, controllo delle regole effettivamente distribuite e prova di recupero incidenti.

## Documenti già presenti
Sono già implementati modelli per verbale tecnico, operazioni di scrutinio, assenza liste, proclamazione e fascicolo degli atti. Verificare e firmare quelli pertinenti; un PDF autogenerato non è un atto sottoscritto né certifica l'ammissibilità del voto elettronico.

## Riferimenti da controllare sull'originale ufficiale
- D.Lgs. 16 aprile 1994, n. 297, organi collegiali.
- O.M. 15 luglio 1991, n. 215, in particolare disposizioni su operazioni di scrutinio, proclamazione e ricorsi, nei limiti dell'ambito di applicazione.
- D.P.R. 10 ottobre 1996, n. 567 e successive modifiche, Consulte provinciali.
- Regolamento (UE) 2016/679, articoli 5, 6, 25, 32 e, se ricorrono i presupposti, 35.
- Atti ministeriali 2026 e allegati tecnici: confrontare sempre testo autentico, protocollo e campo di applicazione. La presenza di un richiamo normativo nel codice non costituisce una validazione giuridica.

## Prima del voto
Non effettuare prove con token autentici nel database di produzione, non cambiare regole né criptografia senza procedura controllata, e non confondere la modalità globale di prova con la simulazione isolata. Prima del merge eseguire i test e verificare in Preview il cruscotto con ciascun ruolo. Le modifiche su questo ramo non hanno aperto alcuna votazione reale.
