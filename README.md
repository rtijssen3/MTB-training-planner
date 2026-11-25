# MTB Training Planner — v1.0 release candidate
Dutch cycling planner for XCO, XCM, road and gravel. Vanilla JavaScript + Vite; Supabase authentication and persistence; Intervals.icu integration.

## Local development
Node 22, npm:
```sh
npm install
npm run dev
npm test
npm run build
npx playwright install chromium
npm run test:browser
```
Stop any existing Vite dev server before running the browser suite (port 5173). Browser tests use a synthetic Supabase module intercepted by Playwright; they never access real accounts. Production build output: dist/. Publish only dist/ through a GitHub Pages Actions deployment, not repository root. See docs/release-checklist.md before publishing.

## Backend
Existing Supabase availability migrations 002–006 remain unchanged. Apply 007 for optional planner cloud sync, and deploy intervals-read with the existing server secrets to enable explicitly confirmed exports. See docs/cloud-setup.md. Never put the Intervals key or a Supabase service role key into client code. Existing connection is restricted to the configured allowed user.

## Structure
- planner-app.js: current UI orchestration
- app.js / availability-*: existing availability and auth workflow (retained until directly replaced and tested)
- src/data: browser persistence, snapshots, cloud sync
- src/engine: event planning, skills, feedback
- src/workouts: recipes, estimation adapter, export
- src/ui: theme
- tests: unit and isolated browser checks
- Historic lesson modules and diagnostic pages are retained for regression/reference, not loaded in the current production UI.
