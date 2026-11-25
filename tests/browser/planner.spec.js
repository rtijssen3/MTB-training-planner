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
test('proposal retains fixed group, shows partial TSS, and manual zero-day override works',async({page})=>{
 await login(page);await plan(page);
 await page.locator('#l39-propose').click();
 await expect(page.locator('#l39-plan-status')).toContainText('trainingen voorgesteld');
 const group=page.locator('.l39-week-card').first().locator('button[data-date="2026-11-29"]');
 await expect(group).toHaveText('Groepsrit');
 await expect(page.locator('.l39-week-load-summary').first()).toContainText(/Workouts: \d+ TSS \+ 1 onbekend/);
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
 await page.locator('[data-tab=calendar]').click();
 await expect(page.locator('#l39-calendar-grid')).not.toBeEmpty();
 await expect(page.locator('.l39-week-summary-head')).toBeVisible();
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
