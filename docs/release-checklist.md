# v1.0 release acceptance
- [x] RC2 automatic validation: 164/164 unit tests, 12/12 isolated Chromium, desktop WebKit and iPhone-profile browser tests, successful locked npm ci, zero npm audit vulnerabilities, production build. [CI run](https://github.com/rtijssen3/MTB-training-planner/actions/runs/45658578645).
- [x] User confirmed three live acceptance checks: Supabase availability and planner persistence/synchronization, Intervals.icu workout export, and mobile operation/layout.
- [x] User explicitly approved publishing v1.0 to GitHub Pages.
- [ ] Final version commit validation and Pages deployment. Verify the public site and v1.0.0 tag after deploy.
- Manual testing is user-reported, not independently performed against the real account by CI.
- Existing Supabase migrations and edge function configuration are not modified by this release.
