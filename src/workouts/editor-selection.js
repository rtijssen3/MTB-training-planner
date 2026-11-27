// Single editor selection model. Legacy prescriptions are only offered for a
// previously saved session; new sessions always select a named library recipe.
import {getTemplate,libraryForCategory,minimumDuration,buildLibraryWorkout} from './library.js';
import {minimumProgressiveDuration} from './progression.js';
export const LEGACY_SELECTION='saved-legacy';
export function editorOptions(type,saved){
 if(type==='group'||type==='rest')return [];
 const rows=libraryForCategory(type).map(t=>({id:t.id,title:t.title}));
 if(saved&&!saved.group&&saved.type===type&&saved.protocol!=='library'){
  const label={classic:'standaard',long:'lange intervallen',progressive:'progressief'}[saved.protocol||'classic']||'bestaand';
  rows.unshift({id:LEGACY_SELECTION,title:'Huidige workout · '+label});
 }
 return rows;
}
// Do not offer duplicate interval profiles as different levels. Preserve the
// saved level when it is one of two equivalent levels, so opening/saving an
// existing prescription does not change its stored identity or feedback.
export function distinctLevels(template,savedLevel=null){
 if(!template)return [];
 const byProfile=new Map();
 for(const n of template.levels){
  const w=buildLibraryWorkout({templateId:template.id,type:template.type,level:n,durationMinutes:minimumDuration(template,n)});
  const key=JSON.stringify(w.steps.map(s=>[s.seconds,s.percentFtp,s.kind,s.cadence??null,s.effort??null]));
  if(!byProfile.has(key)||n===savedLevel)byProfile.set(key,n);
 }
 return [...byProfile.values()].sort((a,b)=>a-b);
}
export function editorSelection(type,id,saved){
 if(type==='group'||type==='rest')return {type,protocol:'classic',levels:[],min:15,max:360};
 if(id===LEGACY_SELECTION&&saved&&!saved.group&&saved.type===type&&saved.protocol!=='library'){
  const protocol=saved.protocol||'classic',levels=protocol==='progressive'?[1,2,3]:[];
  return {type,protocol,levels,min:15,max:360,legacy:true};
 }
 const t=getTemplate(id);
 if(!t||!editorOptions(type,null).some(o=>o.id===id))throw Error('Kies een workout.');
 return {type:t.type,protocol:'library',templateId:t.id,levels:distinctLevels(t,saved?.templateId===id?saved.level:null),min:t.min,max:t.max,test:!!t.test,template:t};
}
export function editorMinimum(choice,level){
 if(choice.template)return minimumDuration(choice.template,level);
 if(choice.protocol==='progressive')return minimumProgressiveDuration(choice.type,level)??45;
 return choice.min;
}
