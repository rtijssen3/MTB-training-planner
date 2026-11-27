// Test result from a single dated cycling record. These are observed peaks,
// not a proof the planned protocol was executed maximally or correctly.
// FTP conversion heuristics: TrainerRoad ramp best minute * .75;
// TrainingPeaks 20-minute test * .95. Never set FTP automatically.
import {getTemplate} from './library.js';
const finitePositive=n=>Number.isFinite(n)&&n>0;
export function observedTestResult(session,records){
 const template=getTemplate(session?.templateId);
 if(!template?.test)return null;
 const rows=Array.isArray(records)?records.filter(x=>x.date===session.date):[];
 if(rows.length!==1||rows[0].powerMeter!==true)return {known:false,values:[],note:'Geen unieke activiteit met gemeten vermogen gevonden voor deze test.'};
 const record=rows[0],values=[],peak=(seconds,label)=>{const watts=record.watts?.[seconds];if(finitePositive(watts)){values.push({label,value:Math.round(watts),unit:'W'});return watts;}return null;};
 let note='Waargenomen beste vermogen op deze datum. Alleen een correct uitgevoerde maximale test is een geldige benchmark.';
 switch(template.id){
 case 'test-ftp20-v1':{const p=peak(1200,'Beste 20 minuten');if(p!==null)values.push({label:'FTP-indicatie (95%)',value:Math.round(p*.95),unit:'W'});note+=' Geen automatische FTP-wijziging.';break;}
 case 'test-ramp-v1':{const p=peak(60,'Beste minuut');if(p!==null)values.push({label:'FTP-indicatie (75%)',value:Math.round(p*.75),unit:'W'});note='FTP-indicatie alleen bruikbaar na een correct tot uitputting uitgevoerde ramp-test; een willekeurige beste minuut is geen ramp-test. Geen automatische FTP-wijziging.';break;}
 case 'test-map5-v1':peak(300,'Beste 5 minuten (MAP-proxy)');break;
 case 'test-anaerobic-v1':peak(30,'Beste 30 sec');peak(60,'Beste 60 sec');note+=' De tweede inspanning kan door de eerste beïnvloed zijn.';break;
 case 'test-sprint-v1':peak(5,'Beste 5 sec');peak(15,'Beste 15 sec');break;
 case 'test-decoupling-v1':{
  const suitable=record.duration>=7200&&record.duration<=10800&&finitePositive(record.hr)&&finitePositive(record.ftp)&&finitePositive(record.avgPower)&&finitePositive(record.np)&&record.avgPower/record.ftp>=.55&&record.avgPower/record.ftp<=.75&&record.np/record.avgPower>=.98&&record.np/record.avgPower<=1.1&&Number.isFinite(record.decoupling)&&record.decoupling>=-10&&record.decoupling<=30;
  if(suitable)values.push({label:'Aerobic decoupling',value:Math.round(record.decoupling*10)/10,unit:'%'});
  note='Duurvermogen: herhaal minstens twee vergelijkbare, gelijkmatige Z2-ritten van 2–3 uur. Temperatuur, voeding, houding en pacing beïnvloeden de waarde.';break;
 }
 }
 return {known:values.length>0,values,note:values.length?note:'Onvoldoende geschikte meetgegevens voor deze test. '+note};
}
