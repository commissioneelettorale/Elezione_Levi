(function(root){
'use strict';

const ELECTION_LABELS={
  consiglio:"Consiglio d'Istituto — componenti genitori/docenti/ATA",
  istituto:"Consiglio d'Istituto — rappresentanti studenti",
  consulta:"Consulta Provinciale degli Studenti",
  classeStudente:"Consiglio di classe — rappresentanti studenti",
  classeGenitore:"Consiglio di classe — rappresentanti genitori"
};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cfg=()=>root.configElezioni||{};
function enabledKeys(){
 const c=cfg(),p=root.LeviElectionPolicy;
 return p&&typeof p.enabled==='function'?p.enabled(c):Object.keys(ELECTION_LABELS);
}
function todayRome(){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
function keysForToday(){
 const c=cfg(), today=todayRome(), enabled=enabledKeys();
 const todayKeys=enabled.filter(k=>{
   const prof=c.consultazioni?.[k]||{};
   return (prof.windows||[]).some(w=>w.date===today);
 });
 return todayKeys.length?todayKeys:enabled;
}
function profile(key){return cfg().consultazioni?.[key]||{};}
function selectedKey(){return document.getElementById('attiElectionKey')?.value||keysForToday()[0]||'istituto';}
function schedule(key){
 const p=profile(key);
 return (p.windows||[]).map(w=>`${String(w.date||'').split('-').reverse().join('/')} ${w.from||'--:--'}–${w.to||'--:--'}`).join(' · ')||'Calendario non configurato';
}
function acts(key){
 return (profile(key).acts||[]).map(a=>[a.authority,a.protocol,a.date,a.subject].filter(Boolean).join(' — ')).join('\n')||'Nessun atto dedicato registrato nella configurazione.';
}
function pdfBase(title,key){
 if(!root.jspdf?.jsPDF) throw new Error('Generatore PDF non disponibile.');
 const doc=new root.jspdf.jsPDF({unit:'mm',format:'a4'});
 doc.setFont('helvetica','bold');doc.setFontSize(14);doc.text('I.I.S. “Primo Levi” — Seregno',105,17,{align:'center'});
 doc.setFontSize(12);doc.text(title,105,25,{align:'center'});
 doc.setFont('helvetica','normal');doc.setFontSize(9);
 doc.text(`A.S. ${cfg().annoScolastico||''} — ${ELECTION_LABELS[key]||key}`,105,31,{align:'center'});
 doc.setDrawColor(180);doc.line(15,35,195,35);
 return doc;
}
function writeWrapped(doc,text,y,{bold=false,size=9,indent=0}={}){
 doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);
 const lines=doc.splitTextToSize(String(text||''),180-indent);
 for(const line of lines){if(y>278){doc.addPage();y=18;}doc.text(line,15+indent,y);y+=5;}
 return y;
}
function field(id){return document.getElementById(id)?.value?.trim()||'';}
function stampFooter(doc){
 const pages=doc.getNumberOfPages();
 for(let p=1;p<=pages;p++){doc.setPage(p);doc.setFontSize(7);doc.setTextColor(90);doc.text(`Pagina ${p} di ${pages} — Documento generato dalla piattaforma; acquisire al protocollo e sottoscrivere ove previsto.`,105,291,{align:'center'});}
}
root.renderAccessoAttiTab=function(container){
 const keys=keysForToday();
 const options=keys.map(k=>`<option value="${k}">${esc(ELECTION_LABELS[k]||k)}</option>`).join('');
 container.innerHTML=`
 <div class="space-y-5">
  <div class="bg-white rounded-3xl border border-slate-200 p-6 shadow">
   <span class="text-[9px] bg-blue-900 text-white font-black px-2 py-1 rounded uppercase">Commissione — documentazione</span>
   <h3 class="text-xl font-black text-slate-900 mt-3">Accesso agli atti e verbale di scrutinio</h3>
   <p class="text-xs text-slate-600 mt-2">La pagina non pubblica risultati né documenti sul Web. Genera copie da acquisire agli atti/protocollo. La consultazione proposta è quella attiva nella data odierna; se oggi non vi sono fasce, mostra le consultazioni abilitate.</p>
   <label class="block text-xs font-black mt-4">Consultazione<select id="attiElectionKey" onchange="window.refreshAccessoAttiContext()" class="mt-1 w-full border rounded-xl p-3 text-black">${options}</select></label>
   <div id="attiContext" class="mt-3 p-4 bg-slate-50 border rounded-xl text-[11px]"></div>
  </div>

  <div class="bg-white rounded-3xl border p-6 shadow">
   <h4 class="font-black text-slate-900">A. Verbale delle operazioni di scrutinio — supporto alla Commissione/seggio</h4>
   <p class="text-[11px] text-slate-600 mt-2">O.M. 215/1991, art. 43: lo scrutinio inizia immediatamente dopo la chiusura delle votazioni; deve esserne redatto processo verbale. Il PDF generato è un supporto e non sostituisce sottoscrizione e deposito degli atti ufficiali.</p>
   <div class="grid md:grid-cols-4 gap-3 mt-4">
    <label class="text-xs">Data scrutinio<input id="scrutinyDate" type="date" value="${todayRome()}" class="w-full border rounded-lg p-2 mt-1"></label>
    <label class="text-xs">Ora chiusura votazioni<input id="scrutinyClose" type="time" class="w-full border rounded-lg p-2 mt-1"></label>
    <label class="text-xs">Ora inizio scrutinio<input id="scrutinyStart" type="time" class="w-full border rounded-lg p-2 mt-1"></label>
    <label class="text-xs">Ora termine scrutinio<input id="scrutinyEnd" type="time" class="w-full border rounded-lg p-2 mt-1"></label>
   </div>
   <label class="flex items-center gap-2 text-xs mt-3"><input id="scrutinyInterrupted" type="checkbox"> Le operazioni hanno subito un’interruzione</label>
   <label class="block text-xs mt-2">Motivazione dell’eventuale interruzione<input id="scrutinyInterruptionReason" class="w-full border rounded-lg p-2 mt-1" maxlength="500"></label>
   <label class="block text-xs mt-3">Presidente del seggio / soggetto verbalizzante<input id="scrutinyPresident" class="w-full border rounded-lg p-2 mt-1" maxlength="120"></label>
   <label class="block text-xs mt-3">Scrutatori / presenti<input id="scrutinyMembers" class="w-full border rounded-lg p-2 mt-1" maxlength="500" placeholder="Nominativi separati da virgola"></label>
   <label class="block text-xs mt-3">Eventuali contestazioni, anomalie o decisioni del seggio<textarea id="scrutinyNotes" class="w-full border rounded-lg p-2 mt-1" rows="3" maxlength="2000"></textarea></label>
   <button onclick="window.downloadScrutinyMinutes()" class="mt-4 bg-slate-900 text-white px-4 py-3 rounded-xl text-xs font-black">SCARICA VERBALE SCRUTINIO PDF</button>
  </div>

  <div class="bg-white rounded-3xl border p-6 shadow">
   <h4 class="font-black text-slate-900">B. Riscontro a richiesta di accesso agli atti</h4>
   <p class="text-[11px] text-slate-600 mt-2">Per candidati e rappresentanti di lista rileva anche l'art. 46, c. 3, O.M. 215/1991. Per l'accesso documentale generale: artt. 22–25 L. 241/1990 e D.P.R. 184/2006. La richiesta va trattata dall'Istituto competente; il sistema non decide automaticamente l'accoglimento.</p>
   <div class="grid md:grid-cols-3 gap-3 mt-4">
    <label class="text-xs">Tipo di accesso<select id="accessType" class="w-full border rounded-lg p-2 mt-1"><option>ACCESSO SPECIFICO O.M. 215/1991 ART. 46, C. 3</option><option>ACCESSO DOCUMENTALE L. 241/1990</option><option>ACCESSO CIVICO SEMPLICE D.LGS. 33/2013</option><option>ACCESSO CIVICO GENERALIZZATO D.LGS. 33/2013</option></select></label>
    <label class="text-xs">Protocollo richiesta<input id="accessProtocol" class="w-full border rounded-lg p-2 mt-1" maxlength="80"></label>
    <label class="text-xs">Data richiesta<input id="accessDate" type="date" class="w-full border rounded-lg p-2 mt-1"></label>
    <label class="text-xs">Richiedente<input id="accessApplicant" class="w-full border rounded-lg p-2 mt-1" maxlength="150"></label>
    <label class="text-xs">Qualità / interesse dichiarato<input id="accessRole" class="w-full border rounded-lg p-2 mt-1" maxlength="200" placeholder="es. candidato, rappresentante di lista, interessato ex L. 241/1990"></label>
   </div>
   <label class="block text-xs mt-3">Documenti richiesti<textarea id="accessDocuments" class="w-full border rounded-lg p-2 mt-1" rows="2" maxlength="1500"></textarea></label>
   <div class="grid md:grid-cols-2 gap-3 mt-3">
    <label class="text-xs">Esito<select id="accessOutcome" class="w-full border rounded-lg p-2 mt-1"><option>ACCOGLIMENTO</option><option>ACCOGLIMENTO PARZIALE</option><option>DIFFERIMENTO</option><option>DINIEGO</option><option>DA ISTRUIRE</option></select></label>
    <label class="text-xs">Modalità<select id="accessMode" class="w-full border rounded-lg p-2 mt-1"><option>VISIONE</option><option>COPIA DIGITALE</option><option>COPIA CARTACEA</option><option>VISIONE E COPIA</option></select></label>
    <label class="text-xs">Protocollo risposta<input id="accessResponseProtocol" class="w-full border rounded-lg p-2 mt-1" maxlength="80"></label>
    <label class="text-xs">Data risposta<input id="accessResponseDate" type="date" class="w-full border rounded-lg p-2 mt-1"></label>
   </div>
   <label class="block text-xs mt-3">Motivazione del provvedimento / limiti / dati oscurati<textarea id="accessReason" class="w-full border rounded-lg p-2 mt-1" rows="3" maxlength="2000"></textarea></label>
   <button onclick="window.downloadAccessResponse()" class="mt-4 bg-blue-900 text-white px-4 py-3 rounded-xl text-xs font-black">SCARICA RISCONTRO ACCESSO ATTI PDF</button>
  </div>

  <div class="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-[11px] text-amber-950">
   <b>Pubblicità ≠ accesso agli atti.</b> O.M. 215/1991, art. 45, c. 2 richiede la comunicazione dell'elenco degli eletti all'albo; ciò non comporta la pubblicazione generalizzata online dei verbali di scrutinio. I documenti analitici restano nel fascicolo elettorale e sono trattati secondo le regole sull'accesso e sulla protezione dei dati.
  </div>
 </div>`;
 root.refreshAccessoAttiContext();
 if(root.lucide)root.lucide.createIcons();
};
root.refreshAccessoAttiContext=function(){
 const box=document.getElementById('attiContext'),key=selectedKey(); if(!box)return;
 box.innerHTML=`<b>${esc(ELECTION_LABELS[key]||key)}</b><br><span class="text-slate-600">Fasce: ${esc(schedule(key))}</span><br><span class="text-slate-600">Atti configurati: ${esc(acts(key)).replace(/\n/g,'<br>')}</span>`;
};
root.downloadScrutinyMinutes=function(){
 const key=selectedKey(),date=field('scrutinyDate'),close=field('scrutinyClose'),start=field('scrutinyStart'),end=field('scrutinyEnd'),interrupted=document.getElementById('scrutinyInterrupted')?.checked===true,interruptionReason=field('scrutinyInterruptionReason');
 if(!date||!start)return alert('Inserire almeno data e ora di inizio dello scrutinio.');
 if(interrupted&&!interruptionReason)return alert('Indicare la motivazione dell’interruzione.');
 const doc=pdfBase('PROCESSO VERBALE — OPERAZIONI DI SCRUTINIO',key);let y=43;
 y=writeWrapped(doc,`Consultazione: ${ELECTION_LABELS[key]||key}`,y,{bold:true});
 y=writeWrapped(doc,`Fasce di votazione configurate: ${schedule(key)}`,y);
 y=writeWrapped(doc,`Data: ${date.split('-').reverse().join('/')} — chiusura votazioni: ${close||'non indicata'} — inizio scrutinio: ${start}${end?' — termine scrutinio: '+end:''}`,y,{bold:true});
 y=writeWrapped(doc,`Continuità delle operazioni: ${interrupted?'INTERRUZIONE VERBALIZZATA — '+interruptionReason:'nessuna interruzione dichiarata nel modello'}`,y);
 y=writeWrapped(doc,`Presidente/verbalizzante: ${field('scrutinyPresident')||'____________________________'}`,y);
 y=writeWrapped(doc,`Scrutatori/presenti: ${field('scrutinyMembers')||'____________________________'}`,y);
 y+=3;y=writeWrapped(doc,'RIFERIMENTI ESSENZIALI',y,{bold:true});
 y=writeWrapped(doc,'O.M. 15 luglio 1991 n. 215, art. 43, c. 1: “Le operazioni di scrutinio hanno inizio immediatamente dopo la chiusura delle votazioni e non possono essere interrotte fino al loro completamento.”',y);
 y=writeWrapped(doc,'Art. 43, cc. 3-4: il processo verbale deve documentare lo scrutinio e, in particolare, elettori/votanti, voti di lista e preferenze dei candidati.',y);
 y+=3;y=writeWrapped(doc,'ATTI DELLA CONSULTAZIONE',y,{bold:true});y=writeWrapped(doc,acts(key),y);
 y+=3;y=writeWrapped(doc,'ANNOTAZIONI / CONTESTAZIONI / DECISIONI',y,{bold:true});y=writeWrapped(doc,field('scrutinyNotes')||'Nessuna annotazione inserita nel modello.',y);
 y+=8;y=writeWrapped(doc,'Presidente: ______________________________    Scrutatori: ______________________________',y);
 stampFooter(doc);doc.save(`Verbale_Scrutinio_${key}_${date}.pdf`);
};
root.downloadAccessResponse=function(){
 const key=selectedKey(),protocol=field('accessProtocol'),applicant=field('accessApplicant'),docs=field('accessDocuments');
 if(!protocol||!applicant||!docs)return alert('Compilare protocollo, richiedente e documenti richiesti.');
 const doc=pdfBase('RISCONTRO A ISTANZA DI ACCESSO AGLI ATTI ELETTORALI',key);let y=43;
 y=writeWrapped(doc,`Istanza prot. ${protocol} del ${field('accessDate')||'____/____/________'} — Richiedente: ${applicant}`,y,{bold:true});
 y=writeWrapped(doc,`Tipologia dichiarata: ${field('accessType')||'ACCESSO DOCUMENTALE'}`,y);
 y=writeWrapped(doc,`Qualità/interesse dichiarato: ${field('accessRole')||'non indicato nel modello'}`,y);
 y=writeWrapped(doc,`Documenti richiesti: ${docs}`,y);
 y+=3;y=writeWrapped(doc,'QUADRO NORMATIVO ESSENZIALE',y,{bold:true});
 y=writeWrapped(doc,'O.M. 215/1991, art. 46, c. 3: riconosce l’accesso ai verbali e agli atti degli scrutini ai soggetti ivi indicati.',y);
 y=writeWrapped(doc,'L. 241/1990, artt. 22–25: disciplina l’accesso documentale; l’interesse deve essere diretto, concreto e attuale e la richiesta è rivolta all’amministrazione che detiene il documento.',y);
 y=writeWrapped(doc,'D.P.R. 184/2006, art. 6: disciplina il procedimento di accesso formale, compreso il termine ordinario di trenta giorni.',y);
 y=writeWrapped(doc,'D.Lgs. 33/2013, artt. 5 e 5-bis: distinguono accesso civico semplice e generalizzato e ne disciplinano limiti ed esclusioni, inclusa la protezione dei dati personali.',y);
 y+=3;y=writeWrapped(doc,`ESITO: ${field('accessOutcome')} — Modalità: ${field('accessMode')}`,y,{bold:true});
 y=writeWrapped(doc,`Riscontro: prot. ${field('accessResponseProtocol')||'________________'} del ${field('accessResponseDate')||'____/____/________'}`,y);
 y=writeWrapped(doc,`Motivazione / limiti / oscuramenti: ${field('accessReason')||'Da completare a cura dell’ufficio competente prima della sottoscrizione.'}`,y);
 y+=4;y=writeWrapped(doc,'Il presente documento non autorizza la diffusione pubblica dei verbali né di dati eccedenti. L’eventuale rilascio avviene nel rispetto dei limiti di legge e della protezione dei dati personali.',y);
 y+=8;y=writeWrapped(doc,'Responsabile/ufficio competente: ______________________________',y);y=writeWrapped(doc,'Data e firma: ______________________________',y);
 stampFooter(doc);doc.save(`Riscontro_Accesso_Atti_${key}_${protocol.replace(/[^A-Za-z0-9_-]+/g,'_')}.pdf`);
};
})(window);
