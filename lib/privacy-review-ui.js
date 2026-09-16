(function(root){
 'use strict';
 let app,preparedDownload;
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const status={PREPARATION:'Preparazione',SUSPENDED:'Blocco attivo',PROPOSED:'Intervento proposto',VERIFIED:'Verificato da persona diversa',AUTHORIZED:'Autorizzazione registrata',REJECTED:'Non superato'};
 const stageText=v=>status[v]||v||'Preparazione';
 const json=v=>JSON.stringify(v,null,2);
 function discardDownload(){if(preparedDownload){URL.revokeObjectURL(preparedDownload.href);preparedDownload.remove();preparedDownload=null;}}
 function download(content,name,type){
  discardDownload();
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;
  a.textContent='Scarica di nuovo '+name;a.className='block mt-3 underline font-bold';a.dataset.downloadLink='true';
  const slot=document.querySelector('#privacy-review-dialog [data-download]');
  if(slot){slot.appendChild(a);preparedDownload=a;}else{a.style.display='none';document.body.appendChild(a);}
  a.click();
  if(!slot){a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),30000);}
 }
 function exportNotice(owner,title,message,type){
  const host=document.getElementById('privacy-review-dialog'),status=host?.querySelector('[data-export-status]');
  if(host?.open&&status){status.textContent=title+'. '+message;status.className='mt-3 text-sm '+(type==='error'?'text-red-800':'text-slate-900');}
  else owner.notify(title,message,type);
 }
 async function call(name,data={}){return (await app.api[name]({annoScolastico:app.config().annoScolastico,...data})).data;}
 async function sha(data){const bytes=typeof data==='string'?new TextEncoder().encode(data):data;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');}
 async function resource(path,kind='text'){const r=await fetch(new URL(path,document.baseURI),{cache:'no-store',credentials:'omit'});if(!r.ok)throw new Error('File del fascicolo non disponibile: '+path);return kind==='json'?r.json():r.text();}
 function reviewSections(data){
  const {version:VERSION,fields,sections}=data.materials;
  const review=data.review||{},profile=data.profile||{},logs=data.technical?.logs||[];
  return [{title:'Identificazione della copia riservata',paragraphs:[`Fascicolo ${VERSION}; anno ${review.year||'non indicato'}; generato ${data.generatedAt||'non indicato'}.`,`Release: ${review.release?.commit||'NON ATTESTATA'}; ambiente ${review.release?.environment||'NON ATTESTATO'}.`,`SHA-256 configurazione: ${review.configurationSha256||'NON ATTESTATA'}.`,...(review.configurationAvailable===false?['Configurazione elettorale annuale NON ANCORA SALVATA. Questo fascicolo preliminare descrive il software e i documenti disponibili; non attesta il completamento dei controlli e non autorizza il voto.']:[]),`Stato procedura: ${review.review?.stage||'PREPARATION'}; ammissione registrata: ${review.assessment?.admittedToSecretVoting===true?'SÌ':'NO'}.`,`DPO: Vargiu Scuola S.r.l. - dpo@vargiuscuola.it. Copia riservata: custodire nel fascicolo della scuola.`]},...sections,
   {title:'15. Dati organizzativi dichiarati dalla scuola',paragraphs:Object.entries(fields).map(([key,label])=>label+': '+(profile.fields?.[key]||'NON DOCUMENTATO - da acquisire prima della valutazione.'))},
   {title:'16. Matrice delle attestazioni applicative',rows:[['Requisito','Stato','Evidenza dichiarata'],...(review.assessment?.controls||[]).map(c=>[c.id,c.status,c.note||'NON DOCUMENTATA'])]},
   {title:'17. Rapporti e checkpoint disponibili',paragraphs:[`Registrazioni incluse: ${logs.length}. Fotografia log fino a: ${data.technical?.snapshotUntil||'non attestata'}. I log dei fornitori sono separati. Nessun controllo mancante è trasformato in PASS.`]},
   ...logs.filter(l=>l.report).map(l=>({title:'Collaudo '+l.id,paragraphs:[`Operatore: ${l.technicianName}; registrato ${l.at}; versione ${l.release?.commit||l.report.softwareVersion||'NON ATTESTATA'}.`,`Configurazione: ${l.configurationSha256||'NON ATTESTATA'}; esito ${l.result}.`],rows:[['Prova','Metodo / atteso','Osservato / esito / evidenza'],...l.report.tests.map(t=>[t.id,`${t.method||'Non documentato'} / ${t.expected||'Non documentato'}`,`${t.observed||'Non documentato'}; ${t.outcome}; ${t.testedAt||'data non documentata'}; ${t.evidence||''}`])]}))];
 }

 async function makePdf(data){
  const fonts=await resource('vendor/pdf-fonts.json','json'),doc=new root.jspdf.jsPDF({unit:'mm',format:'a4'});
  for(const style of ['normal','bold']){doc.addFileToVFS('Dpo-'+style+'.ttf',fonts[style]);doc.addFont('Dpo-'+style+'.ttf','Dpo',style);}
  let y=20;
  function text(value,size=9,bold=false){doc.setFont('Dpo',bold?'bold':'normal');doc.setFontSize(size);for(const line of doc.splitTextToSize(String(value),178)){if(y>276){doc.addPage();y=20;}doc.text(line,16,y);y+=size*.45+1;}y+=3;}
  text('Fascicolo DPO / Privacy Review',19,true);
  for(const section of reviewSections(data)){
   if(y>246){doc.addPage();y=20;}
   text(section.title,12,true);
   for(const p of section.paragraphs||[])text(p);
   if(section.rows?.length){doc.autoTable({startY:y,margin:{left:16,right:16,top:18,bottom:20},head:[section.rows[0]],body:section.rows.slice(1).map(row=>row.map((cell,i)=>i===0?String(cell).replace(/_anno/g,'\n_anno'):cell)),columnStyles:section.rows[0].length===3?{0:{cellWidth:42},1:{cellWidth:53},2:{cellWidth:83}}:{0:{cellWidth:45},1:{cellWidth:133}},styles:{textColor:[0,0,0],font:'Dpo',fontSize:8,cellPadding:2,overflow:'linebreak'},headStyles:{fillColor:[30,50,65],textColor:[255,255,255],fontStyle:'bold'},rowPageBreak:'avoid'});y=doc.lastAutoTable.finalY+7;}
  }
  const count=doc.getNumberOfPages();for(let page=1;page<=count;page++){doc.setPage(page);doc.setFont('Dpo','normal');doc.setFontSize(7);doc.text('Copia riservata - da valutare e sottoscrivere | '+page+'/'+count,16,288);}
  return doc.output('arraybuffer');
 }
 async function exportDossier(button,format='zip'){
  const owner=app;if(!owner||button.disabled)return;
  const prior=button.textContent;button.disabled=true;button.textContent='Preparazione fascicolo completo…';
  exportNotice(owner,'Preparazione in corso','Attendi il caricamento dei documenti e dei registri disponibili.','info');
  try{
   const [review,profile,technical,materials,notice,privacy]=await Promise.all([
    call('getVotingReview'),call('getDpoReviewProfile'),app.logs(),call('getDpoDossierMaterials'),resource('note-legali.html'),resource('anonimato.html')]);
   const {inventory,development,procedure}=materials;
   if(!review.release?.commit||materials.release?.commit!==review.release.commit)throw new Error('Versione del fascicolo non coerente con il servizio. Ricaricare e riprovare.');
   if(!Array.isArray(technical.logs))throw new Error('Log incompleti.');
   const events=[],seen=new Set();let cursor=null;
   do{const page=await call('getVotingReviewEvents',{cursor,snapshotUntil:technical.snapshotUntil});
     if(!Array.isArray(page.events)||page.snapshotUntil!==technical.snapshotUntil)throw new Error('Intervallo degli eventi non coerente.');
     for(const event of page.events){if(seen.has(event.id))throw new Error('Evento duplicato nell’esportazione.');seen.add(event.id);events.push(event);}
     if(page.nextCursor===cursor&&cursor)throw new Error('Paginazione eventi interrotta.');cursor=page.nextCursor;
   }while(cursor);
   const current=await call('getVotingReview'),latestProfile=await call('getDpoReviewProfile');
   const stable=v=>json({...v,assessment:{...v.assessment,assessedAt:null}});
   if(stable(current)!==stable(review)||json(latestProfile)!==json(profile))throw new Error('La revisione è cambiata durante l’esportazione. Ripetere per acquisire una copia coerente.');
   const data={format:materials.version,generatedAt:new Date().toISOString(),review,profile,technical,events,materials};
   const pdf=await makePdf(data);
   if(app!==owner)return;
   if(format==='pdf'){download(pdf,'Fascicolo_DPO_'+review.year.replace('/','_')+'.pdf','application/pdf');exportNotice(owner,'PDF DPO pronto','Download avviato. Se non compare nei download del browser, usa il collegamento qui sotto. Custodire la copia riservata.','success');return;}
   const files={'Fascicolo_DPO.pdf':pdf,'fotografia-riservata.json':json(data),'matrice-conformita.json':json(review.assessment),'log-tecnici.json':json(technical),'eventi-blocchi.json':json({snapshotUntil:technical.snapshotUntil,events}),'inventario-release.json':inventory,'verifiche-sviluppo.json':development,'informativa-visualizzata.html':notice,'protezione-voto.html':privacy,'procedura-operativa.md':procedure};
   const manifest={format:'LEVI_DPO_MANIFEST_V1',generatedAt:data.generatedAt,commit:review.release?.commit||null,configurationSha256:review.configurationSha256,files:[]},zip=new root.JSZip();
   for(const [name,value]of Object.entries(files)){manifest.files.push({name,sha256:await sha(value)});zip.file(name,value);}
   zip.file('MANIFEST_SHA256.json',json(manifest));
   const archive=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
   if(app!==owner)return;
   download(archive,'Fascicolo_DPO_'+review.year.replace('/','_')+'.zip','application/zip');
   exportNotice(owner,'Fascicolo DPO pronto','Download dello ZIP avviato. Se necessario, usa il collegamento qui sotto. Custodire la copia riservata.','success');
  }catch(e){if(app===owner)exportNotice(owner,'Fascicolo non esportato',e.message,'error');}finally{button.disabled=false;button.textContent=prior;}
 }
 async function show(options={}){
  const owner=app;discardDownload();
  let host=document.getElementById('privacy-review-dialog');
  if(!host){host=document.createElement('dialog');host.id='privacy-review-dialog';host.style.cssText='width:min(1080px,96vw);max-height:92vh;overflow:auto;border:1px solid #94a3b8;border-radius:16px;color:#111;background:#fff;padding:24px';host.addEventListener('close',discardDownload);document.body.appendChild(host);}
  if(!host.open)host.showModal();host.innerHTML='<p>Caricamento fascicolo e stato dei controlli…</p>';
  try{
   const view=await call('getVotingReview'),canEdit=view.role==='COMMISSIONE',st=view.review?.stage;
   const [profile,materials]=canEdit?await Promise.all([call('getDpoReviewProfile'),call('getDpoDossierMaterials')]):[{fields:{}},null];
   if(app!==owner)return;
   host.innerHTML=`<div class="flex justify-between gap-3"><h2 class="text-xl font-black">Fascicolo DPO / gestione blocchi</h2><button data-close class="border rounded-lg p-2">Chiudi</button></div><p class="text-sm mt-3">DPO: <b>Vargiu Scuola S.r.l.</b> · dpo@vargiuscuola.it. Il fascicolo supporta la valutazione privacy; non attribuisce al DPO il potere di autorizzare elezioni telematiche.</p>
   <div class="my-4 p-3 border rounded-xl ${view.assessment.admittedToSecretVoting?'bg-emerald-50':'bg-amber-50'}"><b>${escape(stageText(st))}</b> · ${view.suspended?'Votazione sospesa':view.assessment.admittedToSecretVoting?'Requisiti di apertura registrati':'Voto reale non ancora abilitato'}<p class="text-xs mt-1">Commit ${escape(view.release?.commit||'NON ATTESTATO')}<br>Configurazione ${escape(view.configurationAvailable===false?'non ancora salvata: il PDF preliminare è disponibile':view.configurationSha256||'NON ATTESTATA')}</p></div>
   <p class="text-xs">${escape(view.privacy.limitation)}</p>
   ${canEdit?`<div class="my-4"><div class="flex flex-wrap gap-3"><button type="button" data-pdf class="bg-slate-900 text-white px-4 py-3 rounded-xl font-bold">Scarica PDF dettagliato per il DPO</button><button type="button" data-export class="border px-4 py-3 rounded-xl font-bold">Scarica ZIP con tutte le evidenze</button></div><p data-export-status role="status" aria-live="polite" class="mt-3 text-sm"></p><div data-download></div></div><details class="border rounded-xl p-4 mb-4"><summary class="font-bold cursor-pointer">Documentazione tecnica riservata: architettura, sicurezza e funzionamento</summary>${materials.sections.map(s=>`<section class="my-4"><h3 class="font-bold">${escape(s.title)}</h3>${(s.paragraphs||[]).map(p=>`<p class="text-sm my-2">${escape(p)}</p>`).join('')}${s.rows?`<div class="overflow-auto"><table class="text-xs w-full">${s.rows.map((r,i)=>`<tr>${r.map(c=>i===0?`<th class="border p-2 text-left">${escape(c)}</th>`:`<td class="border p-2 align-top">${escape(c)}</td>`).join('')}</tr>`).join('')}</table></div>`:''}</section>`).join('')}</details>`:'<p class="my-4 text-sm">Il fascicolo DPO completo si consulta e si scarica dall’area Commissione. Qui restano disponibili i controlli tecnici e la verifica degli interventi.</p>'}
   ${canEdit?`<details class="border rounded-xl p-4 mb-4"><summary class="font-bold cursor-pointer">1. Documentazione della scuola</summary><p class="text-xs my-3">Inserire riferimenti a documenti custoditi dalla scuola. Non inserire dati degli elettori, password o codici. Il salvataggio invalida la precedente revisione: completare questi dati prima del collaudo.</p><form data-profile>${Object.entries(materials.fields).map(([key,label])=>`<label class="block text-sm mb-3">${escape(label)}<textarea name="${key}" maxlength="4000" ${canEdit?'':'readonly'} class="w-full border rounded-lg p-2 text-black" rows="3" placeholder="NON DOCUMENTATO — indicare atto, responsabile, misure, durata/localizzazione ove pertinente">${escape(profile.fields[key])}</textarea></label>`).join('')}${canEdit?'<button class="bg-slate-900 text-white p-3 rounded-lg">Salva riferimenti e prepara nuova revisione</button>':''}</form></details>`:''}
   <details class="border rounded-xl p-4 mb-4"><summary class="font-bold cursor-pointer">2. Codici non nominativi per la postazione scolastica</summary><p class="text-sm my-3">Identificazione in presenza; estrazione casuale di cedolini chiusi; registro della consegna separato e senza codice. Non distribuire in ordine di elenco e non inviare codici per email nominativa. Definire gestione smarrimenti e lotti inutilizzati nel verbale. Per i genitori consegnare un solo codice per persona per il Consiglio d’Istituto e un codice distinto per ciascuna classe interessata, non per ciascun figlio. I vecchi codici genitori privi di consultazione non sono più ammessi e devono essere ritirati. Il numero di persone distinte è verificato dal seggio; il software non deduce identità dai nomi.</p><p class="text-xs">Modalità: ${escape(view.privacyMode)}. Codici emessi: ${view.batches.reduce((n,b)=>n+b.issued,0)}. Il vecchio registro rimane per l’elettorato e le candidature; i nuovi codici non vi sono associati.</p>${canEdit?'<button type="button" data-mode class="border rounded-lg p-2 my-3">Configura modalità in presenza con codici non nominativi</button><form data-batch class="grid md:grid-cols-2 gap-3"><label>Componente<select name="tipo" class="border p-2 w-full"><option>STUDENTE</option><option>GENITORE</option><option>DOCENTE</option><option>ATA</option></select></label><label>Classe del gruppo<input name="classe" maxlength="30" class="border p-2 w-full"></label><label data-parent-only hidden>Consultazione genitori<select name="electionKey" class="border p-2 w-full"><option value="classeGenitore">Solo rappresentanti di classe</option><option value="consiglio">Solo Consiglio d’Istituto</option></select></label><label data-parent-only hidden>Genitori distinti aventi diritto alla consultazione<input name="eligibleCount" type="number" min="1" max="50000" class="border p-2 w-full"><span class="text-xs">Numero verificato dal seggio, senza contare due volte la stessa persona. La quota non è aumentabile dopo la prima emissione.</span></label><label>Quantità (1–250)<input name="count" type="number" min="1" max="250" required class="border p-2 w-full"></label><label>Verbale / protocollo lotto<input name="protocolRef" required maxlength="200" class="border p-2 w-full"></label><label class="md:col-span-2 text-sm"><input type="checkbox" required> Ho definito custodia, distribuzione casuale e stampa unica; i codici non saranno abbinati ai nomi.</label><button class="bg-slate-900 text-white p-3 rounded-lg">Genera e scarica cedolini PDF</button></form>':''}</details>
   <section class="border rounded-xl p-4"><h3 class="font-bold">3. Intervento → verifica indipendente → autorizzazione</h3><p class="text-sm my-3">Prima registrare il collaudo completo nell’area tecnica, con tutte le prove effettivamente superate. La proposta richiama quel rapporto; la verifica richiede una persona diversa da autore e proponente. La Commissione decide dopo la verifica di un’altra persona. Non attestare come risolti rischi ancora presenti. Un file o un hash da soli non provano il contenuto.</p><p class="text-xs my-2">Una modifica di versione, configurazione, fascicolo o lotto richiede nuova revisione. Dopo una sospensione, l’autorizzazione non proroga gli orari: occorre anche registrare la ripresa.</p>
   <form data-review class="space-y-3"><label class="block">Azione<select name="action" class="border p-2 w-full"><option value="PROPOSE">Proponi risoluzione documentata</option><option value="VERIFY">Verifica indipendente: superato</option>${canEdit?'<option value="AUTHORIZE">Autorizza l’apertura / prepara la ripresa</option>':''}<option value="REJECT">Non superato: mantieni il blocco</option></select></label><label class="block">ID rapporto collaudo (per la proposta)<input name="reportId" class="border p-2 w-full" maxlength="128"></label><label class="block">Protocollo / riferimento documento<input name="protocolRef" required maxlength="200" class="border p-2 w-full"></label><label class="block">Motivo, intervento, evidenza e rischi residui<textarea name="note" required maxlength="1500" class="border p-2 w-full" rows="3"></textarea></label><label class="block">Documento di evidenza (solo calcolo locale SHA-256; conservare agli atti)<input data-evidence type="file" class="block"></label><label class="block">SHA-256 documento<input name="evidenceSha256" required pattern="[a-fA-F0-9]{64}" class="border p-2 w-full" maxlength="64"></label><button class="bg-slate-900 text-white p-3 rounded-lg">Registra con il mio account</button></form>
   ${canEdit&&view.suspended?'<button data-resume class="mt-3 bg-emerald-800 text-white p-3 rounded-lg">Registra ripresa dopo autorizzazione</button>':''}<details class="mt-4"><summary>Storia corrente e riferimenti</summary><pre class="whitespace-pre-wrap break-all text-xs mt-2">${escape(json(view.review))}</pre></details></section><p data-status role="status" class="mt-4 text-sm"></p>`;
   host.querySelector('[data-close]').onclick=()=>host.close();host.querySelector('[data-export]')?.addEventListener('click',e=>exportDossier(e.currentTarget));host.querySelector('[data-pdf]')?.addEventListener('click',e=>exportDossier(e.currentTarget,'pdf'));
   async function action(button,fn){button.disabled=true;try{await fn();await show();}catch(e){host.querySelector('[data-status]').textContent=e.message;}finally{button.disabled=false;}}
   host.querySelector('[data-profile]')?.addEventListener('submit',e=>{e.preventDefault();action(e.submitter,()=>call('saveDpoReviewProfile',{fields:Object.fromEntries(new FormData(e.target))}));});
   if(canEdit){
    host.querySelector('[data-mode]').onclick=e=>action(e.currentTarget,()=>app.saveMode());
    const batchForm=host.querySelector('[data-batch]');
    function updateBatchScope(){
     const parent=batchForm.elements.tipo.value==='GENITORE';
     batchForm.querySelectorAll('[data-parent-only]').forEach(el=>{el.hidden=!parent;});
     for(const name of ['electionKey','eligibleCount']){batchForm.elements[name].disabled=!parent;batchForm.elements[name].required=parent;}
     batchForm.elements.classe.disabled=parent&&batchForm.elements.electionKey.value==='consiglio';
     batchForm.elements.classe.required=(parent&&!batchForm.elements.classe.disabled)||batchForm.elements.tipo.value==='STUDENTE';
    }
    batchForm.elements.tipo.addEventListener('change',updateBatchScope);batchForm.elements.electionKey.addEventListener('change',updateBatchScope);updateBatchScope();
    host.querySelector('[data-batch]').onsubmit=e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.target));action(e.submitter,async()=>{
     // Do not log, save to profile or include these credentials in the DPO archive.
     const result=await call('createAnonymousCredentials',{...values,count:Number(values.count),eligibleCount:Number(values.eligibleCount)});
     if(app!==owner){result.codes.fill('');return;}
     const doc=new root.jspdf.jsPDF();
     result.codes.forEach((code,i)=>{if(!/^[A-F0-9]{32}$/.test(code))throw new Error('Formato credenziale non valido.');if(i&&i%7===0)doc.addPage();const y=20+(i%7)*37;doc.setFontSize(10);doc.text('Primo Levi - '+result.tipo+' '+result.classe,15,y);if(result.electionKey){doc.setFontSize(8);doc.text(result.electionKey==='consiglio'?'SOLO CONSIGLIO D’ISTITUTO':'SOLO RAPPRESENTANTI DI CLASSE',15,y+4);doc.setFontSize(10);}doc.text(code.match(/.{1,4}/g).join('-'),15,y+8);doc.setFontSize(8);doc.text('Codice non nominativo. Custodire il cedolino. Non annotare il nome.',15,y+16);doc.line(15,y+26,195,y+26);});
     doc.save('Cedolini_non_nominativi_'+result.tipo+'_'+(result.electionKey||'consultazioni')+'_'+(result.classe||'gruppo')+'.pdf');result.codes.fill('');
    });};
   }
   const form=host.querySelector('[data-review]');
   host.querySelector('[data-evidence]').onchange=async e=>{const f=e.target.files[0];if(!f)return;if(f.size>30*1024*1024){host.querySelector('[data-status]').textContent='Documento troppo grande per il calcolo locale (limite 30 MB).';return;}form.elements.evidenceSha256.value=await sha(await f.arrayBuffer());};
   form.onsubmit=e=>{e.preventDefault();action(e.submitter,()=>call('advanceVotingReview',Object.fromEntries(new FormData(form))));};
   host.querySelector('[data-resume]')?.addEventListener('click',e=>{const reason=prompt('Protocollo e motivazione della ripresa:');if(reason)action(e.currentTarget,()=>call('setEmergencySuspension',{suspended:false,reason}));});
   if(canEdit&&options.download==='pdf')await exportDossier(host.querySelector('[data-pdf]'),'pdf');
  }catch(e){if(app!==owner)return;host.innerHTML='<p role="alert">'+escape(e.message)+'</p><button data-close class="border p-2">Chiudi</button>';host.querySelector('[data-close]').onclick=()=>host.close();}
 }
 function clear(){app=undefined;discardDownload();const host=document.getElementById('privacy-review-dialog');if(host){if(host.open)host.close();host.remove();}}
 root.LeviPrivacyReview={configure:value=>{app=value;},show,makePdf,exportDossier,clear};
})(window);
