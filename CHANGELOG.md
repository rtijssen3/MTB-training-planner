# Changelog

All notable changes to the MTB Training Planner are documented in this file.

## [0.2.0] - 2026-11-20

### Added
- Interactive two-week availability calendar.
- Monday-to-Sunday calendar weeks with ISO week numbers.
- Daily availability overrides.
- Date-specific fixed workout descriptions.
- Interactive sliders and exact minute input.
- Immediate calculation of weekly training availability.
- Visual distinction between standard, overridden and unsaved availability.
- Batch saving using atomic PostgreSQL transactions.
- Temporary draft storage using SessionStorage.
- Historical availability snapshots.
- Revision-based concurrency control.
- Automatic synchronization when returning to the application.
- Network error handling and draft preservation.
- Responsive calendar layout for mobile devices.
- Automated unit, service and integration tests.

### Changed
- Weekly availability settings moved to a collapsible section.
- Availability logic separated into domain, state, service, API and presentation modules.
- Improved user feedback and error messages.

### Fixed
- Past dates can no longer be modified through the calendar.
- Changes to standard weekly availability no longer affect frozen historical availability.
- Conflicting changes from multiple devices are detected.

### Known limitations
- Conflict resolution requires manual review.
- Historical snapshots are generated on demand for the current week.
- Full offline application startup is not yet supported.

## [0.1.0]

### Added
- Supabase authentication.
- Weekly training availability configuration.
- Fixed recurring workouts.
- Automatic calculation of weekly training hours.
- Database persistence across devices.
- Row Level Security.
- GitHub Pages deployment.