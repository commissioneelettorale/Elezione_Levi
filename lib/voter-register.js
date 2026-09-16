(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LeviVoterRegister=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const BATCH_SIZE=400,MAX_ROWS=10000;
const TYPES=Object.freeze(['STUDENTE','GENITORE','DOCENTE','ATA']);
const text=value=>String(value??'').trim().toUpperCase().replace(/\s+/g,' ');
const person=value=>text(value).replace(/[<>`"&]/g,' ').replace(/[^A-ZÀ-ÖØ-Ý0-9 .'-]/g,' ').replace(/\s+/g,' ').trim();
const group=value=>text(value).replace(/[^A-Z0-9 ._\/-]/g,'');
function normalizeRecords(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>MAX_ROWS)throw new Error('Il registro deve contenere da 1 a '+MAX_ROWS+' elettori.');
 return rows.map((row,i)=>{
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(k=>!['nome','classe','indirizzo'].includes(k)))throw new Error('Dati non validi alla riga '+(i+1)+'.');
  if(['nome','classe','indirizzo'].some(k=>row[k]!=null&&!['string','number'].includes(typeof row[k])))throw new Error('Valore non valido alla riga '+(i+1)+'.');
  const nome=person(row.nome),classe=group(row.classe||'GEN'),indirizzo=group(row.indirizzo||'GEN');
  if(!nome||nome.length>120||!classe||classe.length>32||!indirizzo||indirizzo.length>32)throw new Error('Controllare nominativo, classe e indirizzo alla riga '+(i+1)+' (massimo 120, 32 e 32 caratteri).');
  return {nome,classe,indirizzo};
 });
}
function fromExcelRows(rows){
 if(!Array.isArray(rows)||!rows.length)throw new Error('Il file Excel caricato è vuoto.');
 return normalizeRecords(rows.map((row,i)=>{
  const values=Object.fromEntries(Object.entries(row).map(([k,v])=>[k.trim().toLowerCase().replace(/[\s_-]+/g,''),v]));
  const first=(...keys)=>keys.map(k=>values[k]).find(v=>v!=null&&String(v).trim()!=='')??'';
  const cognome=first('cognome'),nome=first('nome');
  const full=cognome||nome?String(cognome)+' '+String(nome):first('nominativo','cognomenome','nomecognome','alunno','docente','elettore');
  if(!String(full).trim())throw new Error('Nominativo mancante alla riga '+(i+2)+'. Usare le colonne Cognome e Nome oppure Nominativo.');
  return {nome:full,classe:first('classe')||'GEN',indirizzo:first('indirizzo','sezione')||'GEN'};
 }));
}
async function importRows({api,annoScolastico,tipo,rows,importId,onProgress=()=>{}}){
 if(!TYPES.includes(tipo))throw new Error('Componente elettorale non valida.');
 rows=normalizeRecords(rows);
 let confirmed=0,created=0;
 for(let offset=0;offset<rows.length;offset+=BATCH_SIZE){
  const chunk=rows.slice(offset,offset+BATCH_SIZE);
  try{
   const {data}=await api.importVoterRegister({annoScolastico,tipo,importId,offset,totalRows:rows.length,rows:chunk});
   if(data?.confirmed!==chunk.length||!Number.isInteger(data.created)||data.created<0||data.created>chunk.length)throw new Error('Conferma del salvataggio non valida.');
   confirmed+=data.confirmed;created+=data.created;onProgress(confirmed,rows.length);
  }catch(error){
   const failure=new Error(error?.message||'Servizio non raggiungibile.');
   failure.code=error?.code;failure.confirmed=confirmed;failure.totalRows=rows.length;throw failure;
  }
 }
 return {confirmed,created};
}
return {BATCH_SIZE,MAX_ROWS,TYPES,normalizeRecords,fromExcelRows,importRows};
});
