const key='mtb-theme';const root=document.documentElement;const button=document.getElementById('theme-toggle');
function apply(mode){root.dataset.theme=mode;if(button){button.textContent=mode==='dark'?'☀':'☾';button.setAttribute('aria-label',mode==='dark'?'Schakel licht thema in':'Schakel donker thema in');}}
let saved;try{saved=localStorage.getItem(key)}catch{}
apply(saved==='light'||saved==='dark'?saved:matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');
button?.addEventListener('click',()=>{const mode=root.dataset.theme==='dark'?'light':'dark';apply(mode);try{localStorage.setItem(key,mode)}catch{}});
