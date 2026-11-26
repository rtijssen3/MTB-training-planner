# MTB Training Planner — v1.1
Dutch cycling planner for XCO, road and gravel. Vanilla JavaScript + Vite; Supabase authentication and persistence; Intervals.icu integration.

## Local development
Node 22, npm:
```sh
npm ci
npm run dev
npm test
npm run build
npx playwright install chromium webkit
npm run test:browser
```
Stop any existing Vite dev server before running the browser suite (port 5173). Browser tests use a synthetic Supabase module intercepted by Playwright; they never access real accounts. Production build output: dist/. Publish only dist/ using Build and publish Pages on main with GitHub Actions as Pages source. The workflow runs on a main push changing package.json or on manual dispatch; it tags the version only after deployment succeeds. See docs/release-checklist.md for acceptance status and docs/v1.1-plan.md for the v1.1 release.

## Backend
Existing Supabase availability migrations 002–006 remain unchanged. Apply 007 for optional planner cloud sync, and deploy intervals-read with the existing server secrets to enable explicitly confirmed exports and the read-only skill-history action (deploy both index.ts and skill-history.js). See docs/cloud-setup.md. Never put the Intervals key or a Supabase service role key into client code. Existing connection is restricted to the configured allowed user.

## Structure
- planner-app.js: current UI orchestration
- app.js / availability-*: existing availability and auth workflow (retained until directly replaced and tested)
- src/data: browser persistence, snapshots, cloud sync
- src/engine: event planning, skills, feedback
- src/workouts: recipes, estimation adapter, export
- src/ui: theme
- tests: unit and isolated browser checks
- Historic lesson modules and diagnostic pages are retained for regression/reference, not loaded in the current production UI.
