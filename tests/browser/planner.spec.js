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
 const scores=await page.locator('#l39-skill-priorities meter').evaluateAll(es=>es.map(e=>e.value));
 await page.locator('#l39-discipline').selectOption('gravel');
 await expect.poll(()=>page.locator('#l39-skill-priorities meter').evaluateAll(es=>es.map(e=>e.value))).not.toEqual(scores);
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
 await expect(group).toHaveText('Groepsrit');
 await expect(page.locator('.l39-week-load-summary strong').first()).toHaveText(/^Workouts: \d+ TSS$/);
 await expect(page.locator('.l39-week-card').first().locator('.l39-session-load').first()).toContainText('TSS');
 await page.locator('.l39-week-card').first().locator('button[data-date="2026-11-27"]').click();
 await expect(page.locator('#l39-workout-dialog')).toBeVisible();
 await page.locator('#l39-workout-type').selectOption('endurance');
 await page.locator('#l39-workout-duration').fill('60');
 await expect(page.locator('#l39-workout-override')).toBeVisible();
 await page.locator('#l39-workout-form button[type=submit]').click();
 await expect(page.locator('#l39-workout-dialog')).not.toBeVisible();
 await expect(page.locator('.l39-week-card').first().locator('button[data-date="2026-11-27"]')).toHaveText('Duur Z2');
 await expect(page.locator('.l39-capacity-warning').first()).toContainText('Handmatig boven beschikbaarheid');
 await page.locator('#l39-propose').click();await expect(page.locator('#l39-plan-status')).toContainText('handmatig aangepaste dag(en) behouden');
 await expect(page.locator('.l39-week-card').first().locator('button[data-date="2026-11-27"]')).toHaveText('Duur Z2');
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
