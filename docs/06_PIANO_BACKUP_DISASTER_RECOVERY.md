# 06 — Piano backup, continuità operativa e disaster recovery

## Ambito

Sono oggetto di protezione: configurazioni, registro aventi diritto, account/ruoli, urne, audit amministrativo e documentazione finale.

## Regole

1. backup prima dell'apertura della consultazione;
2. backup/export a chiusura avvenuta e prima dello scrutinio, secondo le possibilità del servizio;
3. copie cifrate e con accesso limitato;
4. separazione tra backup del registro identità/token e backup dell'urna;
5. divieto di produrre dataset unificati che aggiungano una relazione identità-scheda;
6. verifica periodica del restore su ambiente separato;
7. definizione formale di RPO/RTO.

## RPO/RTO da approvare

- RPO registro/configurazione: ______
- RPO urna durante votazione: ______
- RTO servizio di voto: ______
- RTO scrutinio/documentazione: ______

## Ripristino

Un restore durante una consultazione può alterare l'unicità del voto. Deve pertanto essere autorizzato dal Presidente/Commissione e preceduto da verifica della consistenza tra registro stato-voto e numero di schede. Se non è possibile dimostrare la consistenza, la consultazione deve essere sospesa e valutata la ripetizione.

## Test minimo

- ripristino configurazione in ambiente di test;
- ripristino registro aventi diritto;
- conteggio urne senza lettura di identità;
- verifica che le Firestore Rules restino deny-by-default;
- prova di indisponibilità frontend e procedura di comunicazione agli utenti.
