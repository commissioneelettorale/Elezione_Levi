(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LeviManagementAggregate=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const CLASS_BALLOTS=new Set(['voti_classe_studenti','voti_classe_genitori']);
  const PREFERENCE_ROLES=new Set(['DIRIGENTE','VICEPRESIDE']);
  function aggregateVoteCollection(rows,selectedClass='TUTTE',role='',collectionName=''){
    const isClass=CLASS_BALLOTS.has(collectionName);
    const source=Array.isArray(rows)?rows.filter(row=>row&&typeof row==='object'):[];
    // I risultati delle elezioni d'Istituto/Consulta non sono disaggregati per classe.
    const filtered=isClass&&selectedClass!=='TUTTE'
      ?source.filter(row=>String(row.classe||'')===selectedClass):source;
    const inProgress=filtered.some(row=>row._turnoutOnly===true);
    const hasTallies=!inProgress;
    const classes={};
    if(isClass){
      for(const row of filtered){
        const cls=String(row.classe||'').trim();
        if(!cls)continue;
        const item=classes[cls]||(classes[cls]={votanti:0,bianche:0,validi:0,preferences:{},hasTallies:true});
        item.votanti++;
        if(row._turnoutOnly===true){item.hasTallies=false;continue;}
        if(row.isBianca===true){item.bianche++;continue;}
        item.validi++;
        if(PREFERENCE_ROLES.has(String(role).toUpperCase())){
          for(let slot=1;slot<=4;slot++){
            const name=String(row['candidate'+slot]||'').trim();
            if(name)item.preferences[name]=(item.preferences[name]||0)+1;
          }
        }
      }
    }
    return {filtered,classes,isClass,hasTallies,canShowPreferences:hasTallies&&PREFERENCE_ROLES.has(String(role).toUpperCase())};
  }
  return {aggregateVoteCollection,CLASS_BALLOTS:[...CLASS_BALLOTS]};
});
