# 14 — Procedura di generazione e consegna credenziali

## Obiettivo

Garantire che ogni credenziale sia individuale, non prevedibile, consegnata al corretto avente diritto e non utilizzabile per ricostruire il contenuto della scheda.

## Generazione

La versione corrente usa `crypto.getRandomValues` nel browser della Commissione per i token prodotti dall'interfaccia e `crypto.randomBytes` lato server per sessioni/referenti. Non utilizzare `Math.random`.

Per i nuovi token sono previste lunghezze maggiori rispetto alla versione legacy.

## Consegna

1. preparare elenco aventi diritto verificato;
2. produrre cedolini/credenziali individuali;
3. consegnare tramite canale istituzionale controllato o in presenza con riscontro;
4. non inviare elenchi completi di token a destinatari non autorizzati;
5. non pubblicare token su chat/gruppi;
6. in caso di compromissione prima del voto, revocare e rigenerare la credenziale con annotazione amministrativa;
7. dopo voto, non tentare di individuare la scheda associata: il sistema non deve conservarne il collegamento.

## Registro di consegna

Il registro di consegna, se contiene nominativo + token, è dato personale e deve essere protetto e conservato separatamente dall'urna. L'accesso deve essere limitato alla funzione che ne necessita.

## Smarrimento

La sostituzione di un token durante una consultazione deve essere gestita con procedura formalizzata che eviti il doppio voto. Se la vecchia credenziale risulta già utilizzata, non può essere semplicemente “riaperta” senza una decisione formalmente motivata della Commissione.
