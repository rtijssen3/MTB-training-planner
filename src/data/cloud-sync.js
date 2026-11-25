import {readSnapshot,installSnapshot,syncDecision,canonical,validateSnapshot} from './planner-snapshot.js';
export function createCloudSync({supabase,storage,user,isCurrent=()=>true}){
 const key='mtb-cloud-baseline:v1:'+user;
 const baseline=()=>{try{return JSON.parse(storage.getItem(key)||'null')}catch{return null}};
 let busy=false;
 async function sync({allowDownload=true,resolveConflict=null}={}){
   if(busy)throw Error('Synchronisatie loopt al.');
   busy=true;
   try{
     const local=readSnapshot(storage,user);
     const {data,error}=await supabase.from('training_planner_state').select('revision,snapshot').eq('user_id',user).maybeSingle();
     if(error)throw Error('Cloudopslag niet beschikbaar: '+error.message);
     if(!isCurrent())throw Error('Account gewijzigd.');
     const latest=readSnapshot(storage,user);
     if(canonical(latest)!==canonical(local))throw Error('Lokale wijzigingen tijdens synchronisatie; probeer opnieuw.');
     let action=syncDecision(local,data,baseline());
     if(action==='conflict'&&['local','remote'].includes(resolveConflict))action=resolveConflict==='local'?'upload':'download';
     if(action==='conflict')throw Error('Cloud en lokale planner verschillen. Geen gegevens overschreven. Maak een back-up en kies in Instellingen welke versie je wilt behouden.');
     if(action==='download'&&!allowDownload)throw Error('Nieuwere cloudversie beschikbaar. Open Instellingen en synchroniseer eerst.');
     if(action==='upload'){
       storage.setItem('mtb-cloud-backup:v1:'+user,JSON.stringify(local));
       const {error:err}=await supabase.rpc('save_training_planner_state',{p_snapshot:local,p_expected_revision:data?.revision??0});
       if(err)throw Error(err.message.includes('PLANNER_CONFLICT')?'Revisieconflict; geen gegevens overschreven. Synchroniseer opnieuw.':err.message);
       if(isCurrent())storage.setItem(key,JSON.stringify(local));
     }else if(action==='download'){
       if(!isCurrent())throw Error('Account gewijzigd.');
       installSnapshot(storage,user,data.snapshot);storage.setItem(key,JSON.stringify(data.snapshot));
     }else if(action==='same'){storage.setItem(key,JSON.stringify(local));}
     return action;
   }finally{busy=false;}
 }
 return {sync};
}
