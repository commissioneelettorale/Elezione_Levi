# Verifiche prima dell'uso elettorale

Riferimento tecnico: Nota MIM 3803 del 30 giugno 2026, Allegato tecnico, sezioni 1–9. L'ambito è quello delle attività collegiali deliberative a distanza dell'art. 44 CCNL: non costituisce autorizzazione generale per le elezioni dei rappresentanti. Acquisire agli atti la verifica della base giuridica applicabile alla specifica elezione, l'O.M. 215/1991 e successive modifiche, le istruzioni annuali e gli atti della scuola.

## Stato delle evidenze

Una spunta della Commissione è un'attestazione documentale, non una certificazione automatica. Indicare protocollo, data, soggetto verificatore e riferimento al documento conservato presso la scuola. Non inserire password, token, dati degli elettori o preferenze nelle annotazioni.

| Verifica | Evidenza da acquisire | Responsabilità operativa |
|---|---|---|
| Base giuridica e procedura applicabile | Atti di indizione e relazione di applicabilità | Dirigenza e Commissione secondo competenza |
| Identificazione e credenziali personali | Procedura di identificazione, consegna e revoca; valutazione autenticazione forte | Scuola e referente tecnico |
| Anonimato effettivo | Relazione indipendente su separazione identità/voto, metadati e privilegi cloud | Partner tecnico e scuola |
| Configurazione | Versione software, elenchi definitivi, schede e limiti di preferenze per componente | Commissione |
| Collaudo | Prove sotto riportate con esiti e anomalie | Tecnico incaricato e Commissione |
| Privacy | Informative, ruoli, contratti art. 28, conservazione, trasferimenti e valutazione DPIA | Titolare con supporto DPO |
| Continuità | Prova documentata di backup e ripristino; sospensione e ripresa | Scuola e tecnico |
| Documentazione | Verbali sottoscritti, protocollo e versamento nel sistema di conservazione | Soggetti competenti della scuola |

## Limite architetturale da risolvere

La piattaforma elimina identificativi espliciti dalle schede, ma il backend tratta nella stessa operazione la sessione dell'elettore e il voto. Non è dimostrata la separazione irreversibile richiesta dal §4.3 dell'Allegato tecnico, inclusi i metadati del database e i privilegi del fornitore. Non attestare questo requisito come verificato. Prima dell'uso reale a scrutinio segreto occorre una verifica architetturale specifica ed eventualmente adottare un protocollo o un servizio idoneo. Nessun verbale generato dall'interfaccia risolve questo limite.

## Prove di collaudo da verbalizzare

Usare un ambiente isolato con dati fittizi, mai le urne reali.

1. Accesso valido, credenziale errata, account disattivato e sessione già aperta dopo revoca.
2. Tentativo di accesso con ruolo diverso e ad anno scolastico non assegnato.
3. Doppio invio simultaneo: una sola registrazione per elettore e scheda.
4. Invio fuori orario, durante sospensione e dopo chiusura.
5. Elenco eleggibili assente, candidato estraneo, preferenza duplicata e oltre limite.
6. Schede e liste congelate: modifica respinta; chiusura anticipata ancora disponibile.
7. Interruzione di rete durante invio e verifica del risultato senza duplicazioni.
8. Riconteggio indipendente di un insieme noto di schede, comprese bianche; ex aequo gestiti secondo procedura vigente.
9. Ripristino da backup in ambiente separato e verifica di completezza.
10. Uso da tastiera, zoom, lettore di schermo e postazione assistita senza visibilità delle preferenze da parte del tecnico.

Per ciascuna prova registrare: versione, data/ora con fuso, nome del verificatore, risultato atteso, risultato osservato, esito (superato/con anomalie/non superato/non verificato), allegati e azione correttiva. Il controllo di raggiungibilità non completa queste prove.

## Indicazioni per l'area tecnica

L'incarico tecnico va documentato dalla scuola. Il ruolo applicativo non attribuisce la qualità di componente della Commissione. Pubblicare solo nominativo, funzione, recapito istituzionale e ubicazione/orari della postazione assistita necessari al servizio; non pubblicare credenziali o log nominativi. I checkpoint attestano solo i controlli effettivamente osservati al momento della registrazione. I log tecnici disponibili nell'interfaccia sono limitati: non presentarli come archivio completo degli eventi del fornitore.

## Pubblicazione delle correzioni

La pubblicazione Vercel non aggiorna automaticamente le regole Firestore: verificare separatamente il workflow delle regole. Per preparare il registro occorre salvare un calendario futuro valido e predisporre lo stato Regolarità; il registro viene bloccato quando è dichiarato definitivo o inizia la finestra. Le correzioni straordinarie richiedono una procedura autorizzata, tracciata e ricollaudata. Gli account con sessioni antecedenti alla gestione dell'anno devono accedere di nuovo.

Fonti: [Allegato tecnico 2026](https://www.tecnicadellascuola.it/wp-content/uploads/2026/08/Allegato_Tecnico_organi_collegiali_online.pdf), [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=it), [O.M. 215/1991](https://www.edscuola.it/archivio/norme/ordinanze/om215_91.html).
