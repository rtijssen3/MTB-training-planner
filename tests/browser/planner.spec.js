import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const mock=await readFile(new URL('./mock-supabase.js',import.meta.url),'utf8');
test.beforeEach(async({page})=>{
 await page.clock.setFixedTime(new Date('2026-11-25T12:00:00+01:00'));
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!=='http://127.0.0.1:5173')return route.abort();if(u.pathname==='/supabase-client.js')return route.fulfill({contentType:'application/javascript',body:mock});return route.continue();});
 page.on('dialog',d=>d.accept());
});
async function login(page){
 await page.goto('/');
 await page.locator('#email').fill('test@example.invalid');
 await page.locator('#password').fill('test-password');
 await page.locator('#login-form button').click();
 await expect(page.locator('#l39-dashboard-body')).toBeVisible();
}
async function plan(page){
 await page.locator('[data-tab=plan]').click();
 await page.locator('#l39-new-plan').click();
 await page.locator('#l39-plan-base').fill('300');
 await page.locator('#l39-plan-weeks').fill('12');
 await page.locator('#l39-plan-dialog button[type=submit]').click();
 await expect(page.locator('.l39-timeline-week')).toHaveCount(12);
 await page.locator('#l39-plan-save').click();
 await expect(page.locator('.l39-week-card')).toHaveCount(2);
}
test('login, immediate discipline response, saved plan, reload and logout',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await login(page);await plan(page);
 await page.locator('#l39-edit-plan').click();
 const scores=await page.locator('#l39-skill-priorities [role=meter]').evaluateAll(es=>es.map(e=>Number(e.getAttribute('aria-valuenow'))));
 await page.locator('#l39-discipline').selectOption('gravel');
 await expect.poll(()=>page.locator('#l39-skill-priorities [role=meter]').evaluateAll(es=>es.map(e=>Number(e.getAttribute('aria-valuenow'))))).not.toEqual(scores);
 await page.locator('#l39-plan-dialog button[type=submit]').click();
 await page.locator('#l39-plan-save').click();
 await page.reload();
 await expect(page.locator('#l39-discipline')).toHaveValue('gravel');
 await expect(page.locator('.l39-timeline-week')).toHaveCount(12);
 await page.locator('#logout-button').click();
 await expect(page.locator('#login-section')).toBeVisible();
 expect(errors).toEqual([]);
});
test('proposal retains fixed group, includes estimated TSS, and manual zero-day override works',async({page})=>{
 await login(page);await plan(page);
 await page.locator('#l39-propose').click();
 await expect(page.locator('#l39-plan-status')).toContainText('trainingen voorgesteld');
 const group=page.locator('.l39-week-card').first().locator('button[data-date="2026-11-29"]');
 await expect(group).toContainText('Groepsrit');
 await expect(page.locator('.l39-week-load-summary strong').first()).toHaveText(/^Workouts: \d+ TSS$/);
 await expect(page.locator('.l39-week-card').first().locator('.l39-session-load').first()).toContainText('TSS');
 await page.locator('.l39-week-card').first().locator('button[data-date="2026-11-27"]').click();
 await expect(page.locator('#l39-workout-dialog')).toBeVisible();
 await page.locator('#l39-workout-type').selectOption('endurance');
 await page.locator('#l39-workout-duration').fill('60');
 await expect(page.locator('#l39-workout-override')).toBeHidden();
 await page.locator('#l39-workout-form button[type=submit]').click();
 await expect(page.locator('#l39-workout-dialog')).not.toBeVisible();
 await expect(page.locator('.l39-week-card').first().locator('button[data-date="2026-11-27"]')).toContainText('Duur Z2');
 await expect(page.locator('.l39-week-day').filter({has:page.locator('button[data-date="2026-11-27"]')}).locator('.minutes')).toHaveText('1u 00m');
 await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('fake-availability-overrides')||'[]').find(([d])=>d==='2026-11-27')?.[1].available_minutes)).toBe(60);
 await page.locator('#l39-propose').click();await expect(page.locator('#l39-plan-status')).toContainText('handmatig aangepaste dag(en) behouden');
 await expect(page.locator('.l39-week-card').first().locator('button[data-date="2026-11-27"]')).toContainText('Duur Z2');
 await page.reload();await expect(page.locator('.l39-week-card')).toHaveCount(2);
 await page.locator('.l39-week-card').first().locator('button[data-date="2026-11-27"]').click();await expect(page.locator('#l39-workout-duration')).toHaveValue('60');await page.locator('#l39-workout-dialog [data-action=close-dialog]').first().click();
 await page.locator('[data-tab=calendar]').click();
 await expect(page.locator('#l39-calendar-grid')).not.toBeEmpty();
 if(await page.locator('#l39-mobile-calendar').isVisible()){await expect(page.locator('#l39-mobile-calendar')).toContainText('Geplande workouts');await page.locator('#l39-mobile-calendar button[data-date="2026-11-29"]').first().click();await expect(page.locator('.l39-mobile-details')).toContainText('Groepsrit');expect(await page.locator('.l39-calendar-panel').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);}else await expect(page.locator('.l39-week-summary-head')).toBeVisible();
});
test('theme survives reload and cloud sync uses mock only',async({page})=>{
 await login(page);await plan(page);
 const before=await page.locator('html').getAttribute('data-theme');
 await page.locator('#theme-toggle').click();
 const after=await page.locator('html').getAttribute('data-theme');expect(after).not.toBe(before);
 await page.locator('#l39-settings-link').click();
 await page.locator('#l39-cloud-sync').click();
 await expect(page.locator('#l39-cloud-status')).toHaveText('Cloudopslag bevestigd.');
 await page.locator('#l39-test-connection').click();
 await expect(page.locator('#l39-connection-status')).toHaveText('Intervals.icu werkt.');
 await page.reload();
 await expect(page.locator('html')).toHaveAttribute('data-theme',after);
});

test('a second automatic save during cloud upload is not lost',async({page})=>{
 await login(page);await plan(page);
 await page.locator('#l39-settings-link').click();
 await page.locator('#l39-cloud-enabled').check();
 await page.locator('[data-tab=plan]').click();
 await page.locator('#l39-edit-plan').click();await page.locator('#l39-discipline').selectOption('road');await page.locator('#l39-plan-dialog button[type=submit]').click();
 await page.locator('#l39-plan-save').click();
 await page.locator('#l39-edit-plan').click();await page.locator('#l39-discipline').selectOption('gravel');await page.locator('#l39-plan-dialog button[type=submit]').click();
 await page.locator('#l39-plan-save').click();
 await expect.poll(()=>page.evaluate(()=>window.__testCloudSnapshot?.plan?.discipline)).toBe('gravel');
 await page.locator('#l39-settings-link').click();
 await expect(page.locator('#l39-cloud-status')).toHaveText('Cloudopslag bevestigd.');
});

test('new browser storage restores cloud plan automatically at login',async({page})=>{
 await login(page);await plan(page);await page.locator('#l39-settings-link').click();await page.locator('#l39-cloud-sync').click();await expect(page.locator('#l39-cloud-status')).toHaveText('Cloudopslag bevestigd.');
 await page.locator('#logout-button').click();await page.evaluate(()=>localStorage.clear());await page.reload();await login(page);
 await page.locator('[data-tab=plan]').click();await expect(page.locator('.l39-timeline-week')).toHaveCount(12);
});

test('today completed ride moves out of upcoming and evaluation persists',async({page})=>{
 await login(page);await plan(page);
 await page.locator('.l39-week-card').first().locator('button[data-date="2026-11-25"]').click();
 await page.locator('#l39-workout-type').selectOption('threshold');await page.locator('#l39-workout-template').selectOption('threshold-8-v1');await page.locator('#l39-workout-duration').fill('60');await page.locator('#l39-workout-level').selectOption('1');await page.locator('#l39-workout-form button[type=submit]').click();
 await expect(page.locator('#l39-workout-dialog')).not.toBeVisible();await page.locator('[data-tab=dashboard]').click();
 await expect(page.locator('#l39-upcoming button[data-date="2026-11-25"]')).toHaveCount(1);
 await page.evaluate(()=>sessionStorage.setItem('fake-activities',JSON.stringify([{id:'ride-today',start_date_local:'2026-11-25T10:00:00',name:'Threshold test',type:'Ride',moving_time:3780,icu_training_load:79}])));
 await page.locator('#l39-dashboard-refresh').click();await expect(page.locator('#l39-upcoming button[data-date="2026-11-25"]')).toHaveCount(0);
 const card=page.locator('#l39-completed-workouts .l39-completed-card');await expect(card).toContainText('Threshold test');await expect(card).toContainText('79');await expect(card.locator('.l39-evaluation-table')).toBeHidden();
 await card.getByRole('button',{name:/Evalueer workout/}).click();await card.getByLabel('Te zwaar',{exact:true}).check();await card.getByRole('button',{name:'Evaluatie bewaren'}).click();await expect(card).toContainText('Evaluatie bewaard');
 await page.reload();await page.locator('#l39-completed-workouts .l39-completed-top').click();await expect(page.locator('#l39-completed-workouts .l39-completed-expanded')).toContainText('Beoordeling: Te zwaar');
 await page.locator('[data-tab=plan]').click();await page.locator('#l39-feedback-details summary').click();await page.locator('#l39-analyze-feedback').click();await expect(page.locator('#l39-feedback-list')).toContainText('Laatste sessie als te zwaar beoordeeld');
});
test('multiple rides do not falsely map to planned intervals',async({page})=>{
 await login(page);await plan(page);await page.locator('.l39-week-card').first().locator('button[data-date="2026-11-25"]').click();await page.locator('#l39-workout-type').selectOption('endurance');await page.locator('#l39-workout-form button[type=submit]').click();await expect(page.locator('#l39-workout-dialog')).not.toBeVisible();
 await page.evaluate(()=>window.__testActivities=[{id:'a',start_date_local:'2026-11-25T08:00:00',name:'Ride A',type:'Ride',moving_time:3600,icu_training_load:40},{id:'b',start_date_local:'2026-11-25T10:00:00',name:'Ride B',type:'Ride',moving_time:3600,icu_training_load:40}]);await page.locator('[data-tab=dashboard]').click();
 await expect(page.locator('.l39-completed-card')).toHaveCount(2);await page.locator('.l39-completed-card').first().getByRole('button',{name:/Evalueer workout/}).click();await expect(page.locator('.l39-completed-card').first()).toContainText('Geen niveauadvies mogelijk');await expect(page.locator('.l39-completed-card').first().getByRole('button',{name:'Evaluatie bewaren'})).toHaveCount(0);
});

test('five skills, paired bars, performance profile and legacy discipline migration',async({page})=>{
 await login(page);await plan(page);
 await expect(page.locator('#l39-discipline option')).toHaveCount(3);
 await expect(page.locator('#l39-skill-priorities .goal [role=meter]')).toHaveCount(5);
 await page.evaluate(()=>{window.__testSkillRecords=[{date:'2026-11-20',watts:{5:900,15:750,30:550,60:450,300:320,1200:270},weight:75,duration:8000,powerMeter:true,hr:130,ftp:280,avgPower:180,np:184,decoupling:4},{date:'2026-11-10',duration:8000,powerMeter:true,hr:130,ftp:280,avgPower:180,np:183,decoupling:5},{date:'2026-06-01',watts:{5:1000,15:800,30:600,60:500,300:340,1200:290},weight:75}];});
 await page.locator('#l39-edit-plan').click();await page.locator('#l39-analyze-limiters').click();await expect(page.locator('#l39-skill-priorities .current [role=meter]')).toHaveCount(5);await expect(page.locator('#l39-skill-priorities')).toContainText('decoupling');
 await page.locator('#l39-plan-dialog button[type=submit]').click();await page.locator('#l39-plan-save').click();await page.reload();await expect(page.locator('#l39-skill-priorities .current [role=meter]')).toHaveCount(5);
 await page.evaluate(()=>{const k='mtb-mesocycle:v2:synthetic-test-user',p=JSON.parse(localStorage.getItem(k));p.discipline='xcm';p.limiter='force';localStorage.setItem(k,JSON.stringify(p));});await page.reload();await expect(page.locator('#l39-discipline')).toHaveValue('gravel');await expect(page.locator('#l39-limiter')).toHaveValue('auto');
});

test('day cards edit only their own week and deleting a workout resets availability and allows replanning',async({page})=>{await login(page);await plan(page);await expect(page.locator('.l39-week-edit')).toHaveCount(0);await page.locator('.l39-week-card').nth(1).locator('.l39-week-day .minutes').first().click();await expect(page.locator('#l39-week-dialog')).toBeVisible();await expect(page.locator('#l39-week-sliders input[type=range]')).toHaveCount(7);await expect(page.locator('#l39-week-dialog-title')).toContainText('Week 49');await page.locator('#l39-week-sliders input[type=number][data-date="2026-12-01"]').fill('105');await page.locator('#l39-week-form button[type=submit]').click();await expect(page.locator('#l39-week-dialog')).toBeHidden();await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('fake-availability-overrides')||'[]').find(([d])=>d==='2026-12-01')?.[1].available_minutes)).toBe(105);const workout=page.locator('button[data-date="2026-11-27"]').last();await workout.click();await page.locator('#l39-workout-type').selectOption('endurance');await page.locator('#l39-workout-duration').fill('60');await page.locator('#l39-workout-form button[type=submit]').click();await expect(page.locator('#l39-workout-dialog')).not.toBeVisible();await workout.click();await page.locator('#l39-delete-workout').click();await expect(workout).toContainText('+ Training');await expect(page.locator('.l39-week-day').filter({has:workout}).locator('.minutes')).toHaveText('0m');await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('fake-availability-overrides')||'[]').find(([d])=>d==='2026-11-27')?.[1].available_minutes)).toBe(0);await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('mtb-workout-draft:v1:synthetic-test-user:2026-11-23')).manualRestDates||[])).not.toContain('2026-11-27');await page.locator('.l39-week-day').filter({has:workout}).locator('.minutes').click();await page.locator('#l39-week-sliders input[type=number][data-date="2026-11-27"]').fill('90');await page.locator('#l39-week-form button[type=submit]').click();await expect(page.locator('.l39-week-day').filter({has:workout}).locator('.minutes')).toHaveText('1u 30m');await page.locator('#l39-propose').click();await expect(page.locator('#l39-plan-status')).toContainText('trainingen voorgesteld');await page.locator('[data-tab=calendar]').click();const coords=await page.locator('.l39-month-nav').evaluate(el=>Array.from(el.children).map(c=>c.getBoundingClientRect().top+c.getBoundingClientRect().height/2));expect(Math.max(...coords)-Math.min(...coords)).toBeLessThan(3);});

test('mixed workout recipe, exact duration and test alternatives',async({page})=>{await login(page);await plan(page);const day=page.locator('.l39-week-card').first().locator('button[data-date="2026-11-27"]');await day.click();await page.locator('#l39-workout-type').selectOption('threshold');await page.locator('#l39-workout-template').selectOption('sprint-sweetspot-v1');await page.locator('#l39-workout-duration').fill('75');await expect(page.locator('#l39-workout-steps')).toContainText('150% FTP');await expect(page.locator('#l39-workout-steps')).toContainText('90% FTP');await page.locator('#l39-workout-form button[type=submit]').click();await expect(day).toContainText('Sprint Building Sweetspot');await day.click();await expect(page.locator('#l39-workout-template')).toHaveValue('sprint-sweetspot-v1');await page.locator('#l39-workout-type').selectOption('test');await expect(page.locator('#l39-workout-template option')).toHaveCount(6);await page.locator('#l39-workout-template').selectOption('test-ftp20-v1');await expect(page.locator('#l39-workout-steps')).toContainText('Maximaal');await expect(page.locator('#l39-export-workout')).toBeDisabled();await expect(page.locator('#l39-workout-duration')).toHaveValue('75');await page.locator('#l39-workout-dialog [data-action=close-dialog]').first().click();});

test('completed FTP test shows observed result only after expansion',async({page})=>{await login(page);await plan(page);await page.locator('.l39-week-card').first().locator('button[data-date="2026-11-25"]').click();await page.locator('#l39-workout-type').selectOption('test');await page.locator('#l39-workout-template').selectOption('test-ftp20-v1');await page.locator('#l39-workout-form button[type=submit]').click();await expect(page.locator('#l39-workout-dialog')).not.toBeVisible();await page.evaluate(()=>{window.__testActivities=[{id:'ftp-test',start_date_local:'2026-11-25T10:00:00',name:'FTP-test',type:'Ride',moving_time:4500,icu_training_load:80}];window.__testSkillRecords=[{date:'2026-11-25',powerMeter:true,watts:{1200:300}}];});await page.locator('[data-tab=dashboard]').click();const card=page.locator('.l39-completed-card');await expect(card.locator('.l39-completed-expanded')).toBeHidden();await card.locator('.l39-completed-top').click();await expect(card).toContainText('FTP-indicatie (95%)');await expect(card).toContainText('285 W');await expect(card).toContainText('Geen automatische FTP-wijziging');});

test('changing recipe level automatically fits duration and keeps sweetspot before sprints',async({page})=>{await login(page);await plan(page);await page.locator('.l39-week-card').first().locator('button[data-date="2026-11-27"]').click();await page.locator('#l39-workout-type').selectOption('threshold');await page.locator('#l39-workout-template').selectOption('sprint-sweetspot-v1');await page.locator('#l39-workout-level').selectOption('1');await expect(page.locator('#l39-workout-duration')).toHaveValue('75');for(const [level,duration,sprints] of [['1','75',4],['2','75',5],['3','90',6]]){await page.locator('#l39-workout-level').selectOption(level);await expect(page.locator('#l39-workout-duration')).toHaveValue(duration);await expect(page.locator('#l39-workout-chart .bar-slot').first()).toBeVisible();const rows=await page.locator('#l39-workout-steps .l39-workout-step').allTextContents();const tempo=rows.map((r,i)=>r.startsWith('Sweet Spot')?i:-1).filter(i=>i>=0),sprint=rows.map((r,i)=>/Sprint \d+\//.test(r)?i:-1).filter(i=>i>=0);expect(tempo).toHaveLength(2);expect(sprint).toHaveLength(sprints);expect(tempo[1]).toBeLessThan(sprint[0]);await expect(page.locator('#l39-workout-tss')).not.toHaveText('—');}await expect(page.locator('#l39-workout-override')).toBeHidden();await page.locator('#l39-workout-form button[type=submit]').click();await expect(page.locator('#l39-workout-dialog')).toBeHidden();});

test('both weeks follow mesocycle instead of historical cap and display forecast',async({page})=>{await login(page);await plan(page);await page.evaluate(()=>{window.__testActivities=['2026-10-27','2026-11-03','2026-11-10','2026-11-17'].map((date,i)=>({id:'hist-'+i,start_date_local:date+'T10:00:00',name:'Ride',type:'Ride',moving_time:7200,icu_training_load:130}));});await page.locator('#l39-propose').click();await expect(page.locator('#l39-plan-status')).toContainText('Week 49:');await expect(page.locator('#l39-plan-status')).toContainText('automatisch restbudget');await expect(page.locator('#l39-plan-status')).toContainText('315 TSS automatisch restbudget');await expect(page.locator('#l39-fitness-forecast svg polyline')).toHaveCount(3);await expect(page.locator('#l39-fitness-forecast [data-series=ctl]')).toHaveAttribute('stroke','#4285df');const week=page.locator('.l39-week-card').nth(1);await expect(week.locator('button[data-date="2026-12-06"]')).toContainText('Groepsrit');await expect.poll(()=>week.locator('.l39-session-load').count()).toBeGreaterThan(1);});

test('fatigue forecast protects fixed group, removes hard additions and uses fallback if data absent',async({page})=>{await login(page);await plan(page);await page.evaluate(()=>{window.__testWellness=[{date:'2026-11-24',ctl:25,atl:80}];});await page.locator('#l39-propose').click();await expect(page.locator('#l39-plan-status')).toContainText('Fitness/Fatigue-prognose');await expect(page.locator('#l39-fitness-forecast svg polyline')).toHaveCount(3);await expect(page.locator('.l39-week-card').first().locator('button[data-date="2026-11-29"]')).toContainText('Groepsrit');await page.evaluate(()=>{window.__testWellness=[];});await page.locator('#l39-propose').click();await expect(page.locator('#l39-plan-status')).toContainText('Geen betrouwbare actuele Fitness/Fatigue');await expect(page.locator('#l39-fitness-forecast')).toContainText('Geen betrouwbare voorspelling');});

test('simplified editor shows only meaningful choices and preserves a saved legacy workout',async({page})=>{await login(page);await plan(page);await page.evaluate(()=>{const key='mtb-workout-draft:v1:synthetic-test-user:2026-11-23';localStorage.setItem(key,JSON.stringify({version:1,start:'2026-11-23',sessions:[{date:'2026-11-27',type:'vo2max',group:false,durationMinutes:60,protocol:'classic',level:3,prescribedPhase:'Opbouw',manual:true}]}));});await page.reload();const day=page.locator('.l39-week-card').first().locator('button[data-date="2026-11-27"]');await day.click();await expect(page.locator('#l39-workout-protocol')).toHaveCount(0);await expect(page.locator('#l39-workout-template')).toHaveValue('saved-legacy');await expect(page.locator('#l39-workout-level-field')).toBeHidden();const before=await page.locator('#l39-workout-steps').innerText();await page.locator('#l39-workout-form button[type=submit]').click();await expect(page.locator('#l39-workout-dialog')).toBeHidden();await day.click();await expect.poll(()=>page.locator('#l39-workout-steps').innerText()).toBe(before);await expect(page.locator('#l39-workout-level-field')).toBeHidden();await page.locator('#l39-workout-template').selectOption('vo2-3-v1');await expect(page.locator('#l39-workout-level-field')).toBeVisible();const profiles=[];for(const n of ['1','2','3']){await page.locator('#l39-workout-level').selectOption(n);profiles.push(await page.locator('#l39-workout-steps').innerText());await expect(page.locator('#l39-workout-tss')).not.toHaveText('—');}expect(new Set(profiles).size).toBe(3);await page.locator('#l39-workout-type').selectOption('endurance');await expect(page.locator('#l39-workout-template')).toHaveValue('steady-aerobic-v1');await expect(page.locator('#l39-workout-level-field')).toBeHidden();await page.locator('#l39-workout-type').selectOption('group');await expect(page.locator('#l39-workout-template-field')).toBeHidden();await expect(page.locator('#l39-workout-level-field')).toBeHidden();await page.locator('#l39-workout-type').selectOption('test');await expect(page.locator('#l39-workout-level-field')).toBeHidden();await expect(page.locator('#l39-workout-template option')).toHaveCount(6);await page.locator('#l39-workout-type').selectOption('rest');await expect(page.locator('#l39-workout-duration-field')).toBeHidden();});

test('strategy modal buffers edits, shows help and commits only on explicit save',async({page})=>{await login(page);await plan(page);const stored=()=>page.evaluate(()=>localStorage.getItem('mtb-mesocycle:v2:synthetic-test-user'));const before=await stored();await expect(page.locator('#l39-plan-dialog')).toBeHidden();await expect(page.locator('#l39-feedback-details')).not.toHaveAttribute('open','');await page.locator('#l39-edit-plan').click();await page.getByRole('button',{name:'Uitleg herstelreductie'}).click();await expect(page.locator('#l39-help-reduction')).toContainText('210 TSS');await expect(page.locator('#l39-help-reduction')).toBeVisible();await page.getByRole('button',{name:'Uitleg herstelreductie'}).click();await expect(page.locator('#l39-help-reduction')).toBeHidden();await page.getByRole('button',{name:'Uitleg plateau'}).click();await expect(page.locator('#l39-help-plateau')).toBeVisible();await page.locator('#l39-plan-base').fill('400');await page.locator('#l39-discipline').selectOption('gravel');await page.locator('#l39-plan-dialog [data-action=close-dialog]').last().click();expect(await stored()).toBe(before);await page.locator('#l39-edit-plan').click();await expect(page.locator('#l39-plan-base')).toHaveValue('300');await expect(page.locator('#l39-discipline')).toHaveValue('xco');await page.locator('#l39-discipline').selectOption('road');await page.locator('#l39-plan-dialog button[type=submit]').click();await expect(page.locator('#l39-plan-dialog')).toBeHidden();await expect(page.locator('#l39-plan-draft-actions')).toBeVisible();expect(await stored()).toBe(before);await page.locator('#l39-plan-save').click();const after=JSON.parse(await stored());expect(after.discipline).toBe('road');expect(after.weeks).toEqual(JSON.parse(before).weeks);await page.locator('#l39-new-plan').click();await expect(page.locator('#l39-plan-base')).toHaveValue('');await page.locator('#l39-plan-base').fill('250');await page.locator('#l39-plan-dialog button[type=submit]').click();await expect(page.locator('#l39-plan-draft-actions')).toBeVisible();await page.locator('#l39-plan-discard').click();expect(JSON.parse(await stored())).toEqual(after);await expect(page.locator('#l39-active-plan-meta')).toContainText('Wegwielrennen');await page.locator('#l39-feedback-details summary').click();await expect(page.locator('#l39-analyze-feedback')).toBeVisible();});
test('compact workout metrics retain the full detailed interval table',async({page})=>{await login(page);await plan(page);await page.locator('.l39-week-card').first().locator('button[data-date="2026-11-27"]').click();await page.locator('#l39-workout-type').selectOption('vo2max');await page.locator('#l39-workout-template').selectOption('vo2-3-v1');await expect(page.locator('#l39-workout-tss')).toBeVisible();await expect(page.locator('#l39-workout-hard')).toBeVisible();await expect(page.locator('#l39-workout-chart .bar-slot').first()).toBeVisible();await expect(page.locator('#l39-workout-steps')).toContainText('115% FTP');const info=await page.locator('.l39-workout-metrics').evaluate(el=>({height:el.getBoundingClientRect().height,display:getComputedStyle(el).display}));expect(info.display).toBe('flex');expect(info.height).toBeLessThan(45);if(await page.locator('#l39-workout-dialog').evaluate(el=>innerWidth<=780)){const box=await page.locator('#l39-workout-chart').boundingBox(),dialog=await page.locator('#l39-workout-dialog').boundingBox();expect(box.y+box.height).toBeLessThanOrEqual(dialog.y+dialog.height+1);}});

test('calendar retains original weekly summary column on desktop and dots on phone',async({page})=>{await login(page);await plan(page);await page.locator('[data-tab=calendar]').click();await expect(page.locator('#l39-calendar-grid .l39-week-meta').first()).toContainText('Uitgevoerd:');for(const width of [1280,768,390]){await page.setViewportSize({width,height:850});if(width>600){await expect(page.locator('.l39-week-summary-head')).toBeVisible();await expect(page.locator('#l39-mobile-calendar')).toBeHidden();await expect(page.locator('.l39-cal-row').first().locator(':scope > div')).toHaveCount(8);await expect(page.locator('.l39-week-meta').filter({hasText:'Week 48'})).toContainText('Doel: 300');}else{await expect(page.locator('#l39-mobile-calendar')).toBeVisible();await expect(page.locator('.l39-week-summary-head')).toBeHidden();}}});

test('month navigation buttons stay compact and month remains visible',async({page})=>{await login(page);await page.locator('[data-tab=calendar]').click();for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:850});const nav=page.locator('.l39-month-nav');await expect(nav).toBeVisible();const geometry=await nav.evaluate(el=>{const [a,b,c]=Array.from(el.children).map(x=>x.getBoundingClientRect());return {widths:[a.width,c.width],centers:[a,b,c].map(x=>x.top+x.height/2),fits:a.left>=0&&c.right<=innerWidth+1,monthFits:el.children[1].scrollWidth<=el.children[1].clientWidth+1}});expect(geometry.widths).toEqual([40,40]);expect(Math.max(...geometry.centers)-Math.min(...geometry.centers)).toBeLessThan(3);expect(geometry.fits).toBe(true);expect(geometry.monthFits).toBe(true);}const title=page.locator('#l39-month-title'),before=await title.innerText();await page.locator('#l39-month-next').click();await expect(title).not.toHaveText(before,{useInnerText:true});await page.locator('#l39-month-prev').click();await expect(title).toHaveText(before,{useInnerText:true});});
