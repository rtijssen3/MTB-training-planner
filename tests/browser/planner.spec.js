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
 await page.locator('#l39-plan-base').fill('300');
 await page.locator('#l39-plan-weeks').fill('12');
 await page.locator('#l39-plan-form button[type=submit]').click();
 await expect(page.locator('.l39-timeline-week')).toHaveCount(12);
 await page.locator('#l39-plan-save').click();
 await expect(page.locator('.l39-week-card')).toHaveCount(2);
}
test('login, immediate discipline response, saved plan, reload and logout',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await login(page);await plan(page);
 const scores=await page.locator('#l39-skill-priorities [role=meter]').evaluateAll(es=>es.map(e=>Number(e.getAttribute('aria-valuenow'))));
 await page.locator('#l39-discipline').selectOption('gravel');
 await expect.poll(()=>page.locator('#l39-skill-priorities [role=meter]').evaluateAll(es=>es.map(e=>Number(e.getAttribute('aria-valuenow'))))).not.toEqual(scores);
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
 await page.locator('#l39-discipline').selectOption('road');
 await page.locator('#l39-plan-save').click();
 await page.locator('#l39-discipline').selectOption('gravel');
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
 await page.locator('#l39-workout-type').selectOption('threshold');await page.locator('#l39-workout-duration').fill('60');await page.locator('#l39-workout-protocol').selectOption('progressive');await page.locator('#l39-workout-level').selectOption('1');await page.locator('#l39-workout-form button[type=submit]').click();
 await expect(page.locator('#l39-workout-dialog')).not.toBeVisible();await page.locator('[data-tab=dashboard]').click();
 await expect(page.locator('#l39-upcoming button[data-date="2026-11-25"]')).toHaveCount(1);
 await page.evaluate(()=>sessionStorage.setItem('fake-activities',JSON.stringify([{id:'ride-today',start_date_local:'2026-11-25T10:00:00',name:'Threshold test',type:'Ride',moving_time:3780,icu_training_load:79}])));
 await page.locator('#l39-dashboard-refresh').click();await expect(page.locator('#l39-upcoming button[data-date="2026-11-25"]')).toHaveCount(0);
 const card=page.locator('#l39-completed-workouts .l39-completed-card');await expect(card).toContainText('Threshold test');await expect(card).toContainText('79');
 await card.getByRole('button',{name:/Evalueer workout/}).click();await card.getByLabel('Te zwaar',{exact:true}).check();await card.getByRole('button',{name:'Evaluatie bewaren'}).click();await expect(card).toContainText('Evaluatie bewaard');
 await page.reload();await page.locator('#l39-completed-workouts .l39-completed-top').click();await expect(page.locator('#l39-completed-workouts .l39-completed-expanded')).toContainText('Beoordeling: Te zwaar');
 await page.locator('[data-tab=plan]').click();await page.locator('#l39-analyze-feedback').click();await expect(page.locator('#l39-feedback-list')).toContainText('Laatste sessie als te zwaar beoordeeld');
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
 await page.locator('#l39-analyze-limiters').click();await expect(page.locator('#l39-skill-priorities .current [role=meter]')).toHaveCount(5);await expect(page.locator('#l39-skill-priorities')).toContainText('decoupling');
 await page.locator('#l39-plan-save').click();await page.reload();await expect(page.locator('#l39-skill-priorities .current [role=meter]')).toHaveCount(5);
 await page.evaluate(()=>{const k='mtb-mesocycle:v2:synthetic-test-user',p=JSON.parse(localStorage.getItem(k));p.discipline='xcm';p.limiter='force';localStorage.setItem(k,JSON.stringify(p));});await page.reload();await expect(page.locator('#l39-discipline')).toHaveValue('gravel');await expect(page.locator('#l39-limiter')).toHaveValue('auto');
});

test('day cards edit only their own week and deleting a workout reserves rest',async({page})=>{await login(page);await plan(page);await expect(page.locator('.l39-week-edit')).toHaveCount(0);await page.locator('.l39-week-card').nth(1).locator('.l39-week-day .minutes').first().click();await expect(page.locator('#l39-week-dialog')).toBeVisible();await expect(page.locator('#l39-week-sliders input[type=range]')).toHaveCount(7);await expect(page.locator('#l39-week-dialog-title')).toContainText('Week 49');await page.locator('#l39-week-dialog [data-action=close-dialog]').first().click();const workout=page.locator('button[data-date="2026-11-27"]').last();await workout.click();await page.locator('#l39-workout-type').selectOption('endurance');await page.locator('#l39-workout-duration').fill('60');await page.locator('#l39-workout-form button[type=submit]').click();await expect(page.locator('#l39-workout-dialog')).not.toBeVisible();await workout.click();await page.locator('#l39-delete-workout').click();await expect(workout).toContainText('Rust');await page.locator('#l39-propose').click();await expect(page.locator('#l39-plan-status')).toContainText('handmatig aangepaste dag(en) behouden');await expect(workout).toContainText('Rust');await page.locator('[data-tab=calendar]').click();const coords=await page.locator('.l39-month-nav').evaluate(el=>Array.from(el.children).map(c=>c.getBoundingClientRect().top+c.getBoundingClientRect().height/2));expect(Math.max(...coords)-Math.min(...coords)).toBeLessThan(3);});

test('mixed workout recipe, exact duration and test alternatives',async({page})=>{await login(page);await plan(page);const day=page.locator('.l39-week-card').first().locator('button[data-date="2026-11-27"]');await day.click();await page.locator('#l39-workout-type').selectOption('threshold');await page.locator('#l39-workout-template').selectOption('sprint-sweetspot-v1');await page.locator('#l39-workout-duration').fill('75');await expect(page.locator('#l39-workout-steps')).toContainText('180% FTP');await expect(page.locator('#l39-workout-steps')).toContainText('88% FTP');await page.locator('#l39-workout-form button[type=submit]').click();await expect(day).toContainText('Sprint Building Sweetspot');await day.click();await expect(page.locator('#l39-workout-template')).toHaveValue('sprint-sweetspot-v1');await page.locator('#l39-workout-type').selectOption('test');await expect(page.locator('#l39-workout-template option')).toHaveCount(6);await page.locator('#l39-workout-template').selectOption('test-ftp20-v1');await expect(page.locator('#l39-workout-steps')).toContainText('Maximaal');await expect(page.locator('#l39-export-workout')).toBeDisabled();await expect(page.locator('#l39-workout-duration')).toHaveValue('75');await page.locator('#l39-workout-dialog [data-action=close-dialog]').first().click();});
