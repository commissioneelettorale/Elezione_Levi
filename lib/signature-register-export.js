(function(root,factory) {
  if(typeof module==='object' && module.exports) module.exports=factory();
  else root.LeviSignatureRegisters=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function() {
  'use strict';
  function tidy(v){return String(v==null?'':v).trim().toUpperCase().replace(/\s+/g,' ');}
  function groupRows(rows) {
    if(!Array.isArray(rows)||rows.length>10000) throw Error('Registri non validi.');
    const map=new Map();
    for(const row of rows){
      if(!row||!['STUDENTE','GENITORE'].includes(row.tipo)) continue;
      const name=tidy(row.nome),cls=tidy(row.classe);
      if(!name||!cls||name.length>120||cls.length>32) throw Error('Nome o classe mancanti nel registro.');
      const key=row.tipo+'|'+cls;
      if(!map.has(key)) map.set(key,{tipo:row.tipo,classe:cls,nominativi:[]});
      map.get(key).nominativi.push(name);
    }
    const groups=[...map.values()];
    groups.sort((a,b)=>(a.tipo==='GENITORE'?0:1)-(b.tipo==='GENITORE'?0:1)||a.classe.localeCompare(b.classe,'it',{numeric:true}));
    for(const g of groups)g.nominativi.sort((a,b)=>a.localeCompare(b,'it'));
    return groups;
  }
  function assertGroups(groups) {
    if(!Array.isArray(groups)||groups.length<2||groups.length>500)throw Error('Registri mancanti o non validi.');
    for(const t of ['GENITORE','STUDENTE'])if(!groups.some(g=>g.tipo===t))throw Error('Manca un registro richiesto: '+t);
    for(const g of groups)if(!['GENITORE','STUDENTE'].includes(g.tipo)||!g.classe||!Array.isArray(g.nominativi)||!g.nominativi.length)throw Error('Registro non valido.');
    return groups;
  }
  function createPdf(g,JsPDF) {
    const p=new JsPDF({unit:'mm',format:'a4'}),left=12,divider=128;
    function page(){
      p.setFont('helvetica','bold');p.setFontSize(14);
      p.text('REGISTRO '+(g.tipo==='GENITORE'?'GENITORI':'STUDENTI'),left,19);
      p.setFontSize(12);p.text('CLASSE '+g.classe,left,29);
      p.setLineWidth(0.2);p.setFontSize(10);
      p.rect(left,36,116,10);p.rect(divider,36,70,10);
      p.text('COGNOME E NOME',15,42.5);p.text('FIRMA',131,42.5);
      p.setFont('helvetica','normal');p.setFontSize(9.5);
    }
    page();let y=46;
    for(const name of g.nominativi){
      const lines=p.splitTextToSize(name,109),height=Math.max(11,5*lines.length+4);
      if(y+height>282){p.addPage();page();y=46;}
      p.rect(left,y,116,height);p.rect(divider,y,70,height);
      p.text(lines,15,y+6.5);y+=height;
    }
    return p;
  }
  async function createZip(data,libs){
    const groups=assertGroups(data.groups);
    if(!libs||!libs.JSZip||!libs.jsPDF)throw Error('Librerie PDF/ZIP non disponibili.');
    const zip=new libs.JSZip(),paths=new Set();
    for(const g of groups){
      const folder=g.tipo==='GENITORE'?'GENITORI':'STUDENTI';
      const cls=g.classe.replace(/[^A-Z0-9_-]/g,'_');
      const path=folder+'/REGISTRO_'+folder+'_CLASSE_'+cls+'.pdf';
      if(paths.has(path))throw Error('Nome classe duplicato.');paths.add(path);
      zip.file(path,createPdf(g,libs.jsPDF).output('arraybuffer'));
    }
    return zip.generateAsync({type:'blob',compression:'DEFLATE'});
  }
  return Object.freeze({groupRows,assertGroups,createPdf,createZip});
});
