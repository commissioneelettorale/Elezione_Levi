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


// Funzione di stampa amministrativa: aggiunta all'area Commissione della pagina index.html.
// Indipendente dallo stato di voto. Il database non viene mai modificato.
(function(root){
'use strict';
const PANEL_ID='registri-firme-tutte-classi';
let busy=false;

function install(){
  const target=root.document.getElementById('admin-tab-content');
  if(!target)return;
  // Stampa disponibile NEL riquadro "Stampa Cedolini + Firme" gia' presente
  // nelle schede Registro Genitori e Registro Studenti.
  for(const type of ['GENITORE','STUDENTE']){
    const select=root.document.getElementById('pdfClassSelect_'+type);
    const id='registri-firme-zip-'+type;
    if(!select||root.document.getElementById(id))continue;
    const group=select.parentElement;
    const panel=group?.parentElement;
    if(!panel)continue;
    const wrap=root.document.createElement('div');
    wrap.className='mt-3 border-t border-emerald-200 pt-3';
    const label=root.document.createElement('p');
    label.className='mb-2 text-xs font-bold text-emerald-950';
    label.textContent='TUTTE le classi - registro firme SENZA codici';
    const button=root.document.createElement('button');
    button.type='button';
    button.id=id;
    button.className='w-full rounded-xl bg-emerald-700 px-4 py-3 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-50';
    button.textContent='SCARICA ZIP TUTTE LE CLASSI - '+(type==='GENITORE'?'GENITORI':'STUDENTI')+' (SOLO FIRME)';
    button.addEventListener('click',()=>download(type));
    wrap.append(label,button);
    panel.appendChild(wrap);
  }
  if(root.document.getElementById(PANEL_ID))return;
  const section=root.document.createElement('section');
  section.id=PANEL_ID;
  section.className='mb-5 rounded-2xl border-2 border-emerald-600 bg-white p-5 shadow';
  const heading=root.document.createElement('h3');
  heading.className='text-lg font-black text-emerald-950';
  heading.textContent='STAMPA REGISTRI FIRME - TUTTE LE CLASSI';
  const details=root.document.createElement('p');
  details.className='mt-1 text-xs text-slate-700';
  details.textContent='Un unico ZIP con PDF separati per classe e per componente (GENITORI / STUDENTI). Ogni elenco contiene esclusivamente cognome e nome e spazio per la firma, senza token, REF o altri dati.';
  const button=root.document.createElement('button');
  button.type='button';
  button.id='registri-firme-zip-download';
  button.className='mt-3 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-50';
  button.textContent='SCARICA ZIP REGISTRI GENITORI E STUDENTI';
  button.addEventListener('click',()=>download());
  section.append(heading,details,button);
  target.parentNode.insertBefore(section,target);
}

function clean(v){return String(v??'').normalize('NFC').trim().toUpperCase().replace(/\s+/g,' ');}
function buildGroups(records, onlyType=null){
  if(onlyType!==null&&!['GENITORE','STUDENTE'].includes(onlyType))throw Error('Componente registro non valida.');
  const groups=new Map();
  for(const record of records){
    const tipo=clean(record.tipo);
    if(tipo!=='GENITORE'&&tipo!=='STUDENTE')continue;
    if(onlyType&&tipo!==onlyType)continue;
    const nome=clean(record.nome),classe=clean(record.classe);
    if(!nome||!classe||nome.length>120||classe.length>32)
      throw Error('Elenco incompleto: un genitore o studente non ha nome o classe. ZIP non creato.');
    const key=tipo+'\u0000'+classe;
    if(!groups.has(key))groups.set(key,{tipo,classe,nominativi:[]});
    groups.get(key).nominativi.push(nome);
  }
  const result=[...groups.values()].sort((a,b)=>
    (a.tipo==='GENITORE'?0:1)-(b.tipo==='GENITORE'?0:1)||
    a.classe.localeCompare(b.classe,'it',{numeric:true}));
  for(const group of result)group.nominativi.sort((a,b)=>a.localeCompare(b,'it'));
  if(!result.length)throw Error('Nessun nominativo disponibile per la categoria richiesta.');
  if(!onlyType&&(!result.some(g=>g.tipo==='GENITORE')||!result.some(g=>g.tipo==='STUDENTE')))
    throw Error('Mancano i nominativi dei genitori o degli studenti: non creare uno ZIP incompleto.');
  return result;
}
function makePdf(group,JsPDF){
  const pdf=new JsPDF({unit:'mm',format:'a4'});
  const left=12,first=120,second=66;
  function heading(){
    pdf.setFont('helvetica','bold');
    pdf.setFontSize(13);
    pdf.text('REGISTRO '+(group.tipo==='GENITORE'?'GENITORI':'STUDENTI'),left,18);
    pdf.setFontSize(12);
    pdf.text('CLASSE '+group.classe,left,28);
    pdf.setFontSize(9.5);
    pdf.setLineWidth(0.2);
    pdf.rect(left,35,first,10);
    pdf.rect(left+first,35,second,10);
    pdf.text('COGNOME E NOME',left+3,41.5);
    pdf.text('FIRMA',left+first+3,41.5);
    pdf.setFont('helvetica','normal');
    pdf.setFontSize(9.5);
  }
  heading();
  let y=45;
  for(const name of group.nominativi){
    const lines=pdf.splitTextToSize(name,first-7);
    const height=Math.max(12,lines.length*5+4);
    if(y+height>283){pdf.addPage();heading();y=45;}
    pdf.rect(left,y,first,height);
    pdf.rect(left+first,y,second,height);
    pdf.text(lines,left+3,y+6.5);
    y+=height;
  }
  return pdf.output('arraybuffer');
}
function report(title,message,kind){
  if(typeof root.showNotification==='function')root.showNotification(title,message,kind);
  else root.alert(title+': '+message);
}
async function download(onlyType=null){
  if(busy)return;
  if(onlyType!==null&&!['GENITORE','STUDENTE'].includes(onlyType))return;
  const button=root.document.getElementById(onlyType?'registri-firme-zip-'+onlyType:'registri-firme-zip-download');
  const initialText=button?.textContent||'SCARICA ZIP REGISTRI';
  busy=true;
  if(button){button.disabled=true;button.textContent='CREAZIONE DEI REGISTRI IN CORSO...';}
  const typeLabel=onlyType==='GENITORE'?'GENITORI':onlyType==='STUDENTE'?'STUDENTI':'GENITORI_STUDENTI';
  // Aprire subito il selettore nativo durante il clic. Il browser puo'
  // rifiutare un download automatico effettuato dopo una lunga lettura cloud.
  let filePicker=null;
  if(typeof root.showSaveFilePicker==='function'){
    try {
      filePicker=root.showSaveFilePicker({
        suggestedName:'REGISTRI_FIRME_'+typeLabel+'_'+String(root.configElezioni?.annoScolastico||'2026/2027').replace('/','_')+'.zip',
        types:[{description:'Archivio ZIP registri firme',accept:{'application/zip':['.zip']}}]
      }).catch(error=>{if(error?.name==='AbortError')return null;throw error;});
    }catch(_){filePicker=null;} // Browser senza File System Access API.
  }
  try{
    const [appSDK,authSDK]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js')
    ]);
    const app=appSDK.getApp();
    const user=authSDK.getAuth(app).currentUser;
    if(!user)throw Error('Accesso Commissione richiesto.');
    // Verifica dal provider Firebase una credenziale aggiornata prima della stampa.
    const claims=(await user.getIdTokenResult(true)).claims||{};
    const year=String(claims.staffYear||'');
    if(claims.role!=='COMMISSIONE'||!/^20\d{2}\/20\d{2}$/.test(year))
      throw Error('Esportazione consentita solo alla Commissione elettorale autorizzata.');
    // Le credenziali COMMISSIONE non ricevono normalmente staffExpiresAt:
    // il backend non include COMMISSIONE in MANAGEMENT_ROLES.
    // L'autorizzazione reale alla lettura e' verificata dalle Firestore Rules
    // tramite isCommission() (account attivo, ruolo e sessionVersion).
    // Rispettare comunque una scadenza firmata qualora esista davvero.
    if(claims.staffExpiresAt !== undefined && claims.staffExpiresAt !== null){
      const expiresAt=Number(claims.staffExpiresAt);
      if(!Number.isFinite(expiresAt)||expiresAt<=0||Date.now()>=expiresAt*1000)
        throw Error('Incarico Commissione scaduto o non valido: verificare le credenziali con la Segreteria.');
    }
    if(!root.JSZip||!root.jspdf?.jsPDF)
      throw Error('Librerie ZIP/PDF non disponibili: ricaricare la pagina.');
    let records;
    if(onlyType && typeof root.getAuthorizedSignatureRegisterSnapshot==='function'){
      // Registro studenti/genitori gia' caricato dalla Commissione:
      // riutilizzarlo senza consumare una seconda query Firestore.
      // La funzione del cruscotto accetta solo snapshot verificati dal server.
      const snapshot=await root.getAuthorizedSignatureRegisterSnapshot(onlyType);
      if(snapshot?.year!==year||!Array.isArray(snapshot?.records)||!snapshot.records.length)
        throw Error('Elenco firme non verificato per l’anno scolastico corrente.');
      records=snapshot.records.map(row=>({nome:row.nome,classe:row.classe,tipo:row.tipo}));
    }else{
      // Compatibilita' per il pulsante combinato: richiede comunque
      // una lettura autorizzata dal server, MAI dati dalla cache non verificata.
      const fireSDK=await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
      const db=fireSDK.getFirestore(app);
      const coll=fireSDK.collection(db,'artifacts','iis-levi-electoral-v3',
        'public','data','tokens_'+year.replace('/','_'));
      const query=fireSDK.query(coll,fireSDK.limit(10001));
      const snap=await fireSDK.getDocsFromServer(query);
      if(snap.size>10000)throw Error('Registro oltre il limite massimo esportabile in una volta.');
      records=snap.docs.map(doc=>{
        const {nome,classe,tipo}=doc.data();
        return {nome,classe,tipo};
      });
    }
    const groups=buildGroups(records,onlyType);
    const zip=new root.JSZip();
    const files=new Set();
    for(const group of groups){
      const folder=group.tipo==='GENITORE'?'GENITORI':'STUDENTI';
      const classPart=group.classe.replace(/[^A-Z0-9_-]/g,'_');
      const path=folder+'/REGISTRO_'+folder+'_CLASSE_'+classPart+'.pdf';
      if(files.has(path))throw Error('Classi con nomi di file coincidenti. ZIP non creato.');
      files.add(path);
      zip.file(path,makePdf(group,root.jspdf.jsPDF));
    }
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:4}});
    if(filePicker){
      const handle=await filePicker;
      if(!handle)return; // Salvataggio annullato esplicitamente dall'utente.
      const stream=await handle.createWritable();
      try{await stream.write(blob);}finally{await stream.close();}
    } else {
      const objectUrl=root.URL.createObjectURL(blob);
      const link=root.document.createElement('a');
      link.href=objectUrl;
      link.download='REGISTRI_FIRME_'+typeLabel+'_'+year.replace('/','_')+'.zip';
      root.document.body.appendChild(link);
      link.click();
      link.remove();
      root.setTimeout(()=>root.URL.revokeObjectURL(objectUrl),30000);
    }
    report('ZIP registri creato',groups.length+' PDF suddivisi per classe. Conservare il file nell’area riservata.','success');
  }catch(error){
    report('Impossibile generare i registri',
      String(error?.message||'Verificare la connessione e l’accesso al database.')+
      ' Nessun dato è stato modificato.','error');
  }finally{
    busy=false;
    if(button){button.disabled=false;button.textContent=initialText;}
  }
}
function init(){
  install();
  const observer=new MutationObserver(install);
  observer.observe(root.document.body,{childList:true,subtree:true});
}
if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})(window);
