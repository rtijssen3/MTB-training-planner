import {createStructuredWorkout} from '../../workout-details-model.js';
import {estimateWorkoutTss} from '../../workout-load-model.js';
import {skillWorkout} from '../engine/friel.js';
import {buildProgressiveWorkout} from './progression.js';
import {buildLibraryWorkout} from './library.js';
export function workoutInfo(s,week){
 if(!s)return {load:null,workout:null,reason:'Geen training'};
 if(s.group||s.type==='group'){
  try{const workout=createStructuredWorkout({type:'endurance',durationMinutes:s.durationMinutes,ftp:300,phase:'Opbouw',protocol:'classic'});return {load:s.groupIntensity?Math.round(s.durationMinutes/60*100*({easy:.65,mixed:.75,hard:.85}[s.groupIntensity]??.75)**2):estimateWorkoutTss(workout).estimatedTss,workout,reason:null,estimatedGroup:true};}catch(e){return {load:null,workout:null,reason:e.message};}
 }
 try{
   const phase=s.prescribedPhase|| (week?.phase==='Recovery'?'Herstel':'Opbouw');
   const builder=s.protocol==='library'?buildLibraryWorkout:s.protocol==='progressive'?buildProgressiveWorkout:['force','skills','anaerobic','power'].includes(s.type)?skillWorkout:createStructuredWorkout;
   const workout=builder({type:s.type,durationMinutes:s.durationMinutes,ftp:300,protocol:s.protocol||'classic',phase,level:s.level,templateId:s.templateId});
   return {load:estimateWorkoutTss(workout).estimatedTss,workout,reason:null,estimatedTest:!!workout.test};
 }catch(e){return {load:null,workout:null,reason:e.message};}
}
