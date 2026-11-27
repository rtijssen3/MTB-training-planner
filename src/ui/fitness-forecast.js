// Responsive static SVG; no remote chart library. Keep the approved three line colours.
const NS='http://www.w3.org/2000/svg';
const series=[['ctl','Fitness (CTL)','#4285df'],['atl','Fatigue (ATL)','#db5461'],['tsb','Form (TSB)','#26a269']];
export function renderFitnessForecast(host,points,{message=''}={}){
 host.replaceChildren();
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
 if(!points?.length){host.append(el('p',message||'Geen betrouwbare voorspelling beschikbaar. De mesocycle en bestaande herstelregels blijven leidend.','l39-caption'));return;}
 const legend=el('div',null,'l39-forecast-legend');
 for(const [key,label,color] of series){const item=el('span',label);const swatch=el('i');swatch.style.background=color;item.prepend(swatch);legend.append(item);}host.append(legend);
 const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 640 250');svg.setAttribute('role','img');svg.setAttribute('aria-label','Voorspelde Fitness, Fatigue en Form per dag; eindwaarden '+series.map(([k,l])=>l+' '+points.at(-1)[k].toFixed(1)).join(', '));
 const vals=points.flatMap(p=>series.map(([k])=>p[k])),low=Math.min(0,Math.floor(Math.min(...vals)/10)*10),high=Math.max(low+10,Math.ceil(Math.max(...vals)/10)*10),left=42,right=626,top=12,bottom=210;
 const x=i=>left+(right-left)*i/Math.max(1,points.length-1),y=v=>bottom-(v-low)/(high-low)*(bottom-top);
 const node=(tag,attrs,text)=>{const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;svg.append(n);return n;};
 for(let i=0;i<=5;i++){const v=low+(high-low)*i/5;node('line',{x1:left,x2:right,y1:y(v),y2:y(v),stroke:'var(--line)','stroke-width':1});node('text',{x:left-8,y:y(v)+4,'text-anchor':'end',fill:'var(--muted)','font-size':13},Math.round(v));}
 const step=Math.max(1,Math.ceil((points.length-1)/7));for(let i=0;i<points.length;i++)if(i%step===0||i===points.length-1){const p=points[i];node('text',{x:x(i),y:235,'text-anchor':'middle',fill:'var(--muted)','font-size':13},p.date.slice(8)+'/'+p.date.slice(5,7));}
 for(const [key,label,color] of series){
  node('polyline',{points:points.map((p,i)=>x(i)+','+y(p[key])).join(' '),fill:'none',stroke:color,'stroke-width':2.6,'stroke-linecap':'round','stroke-linejoin':'round','data-series':key});
  for(const [i,p] of points.entries()){const dot=node('circle',{cx:x(i),cy:y(p[key]),r:2.8,fill:color});const t=document.createElementNS(NS,'title');t.textContent=p.date+' · '+label+': '+p[key].toFixed(1);dot.append(t);}
 }
 host.append(svg);const last=points.at(-1),min=Math.min(...points.map(p=>p.tsb));host.append(el('p','Laagste Form: '+min.toFixed(1)+' · Eindwaarde Form: '+last.tsb.toFixed(1)+'. '+(message||'Prognose bij uitvoering van de bewaarde workouts; rust op ongeplande dagen. Standaard 42/7 dagen; geen directe herstelmeting.'),'l39-caption'));
}
