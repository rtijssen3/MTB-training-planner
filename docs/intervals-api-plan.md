
# Intervals.icu Integration Plan – V0.3

## Goal

Read training activities, athlete information and
wellness data for the MTB Training Planner.

## Data sources

- Activities: Intervals.icu
- Fitness and fatigue: Intervals.icu
- Wellness: Intervals.icu
- Weekly availability: Supabase
- Date-specific overrides: Supabase

## Initial API endpoints

GET /api/v1/athlete/0/profile
GET /api/v1/athlete/0/activities
GET /api/v1/athlete/0/wellness

## Security

- Personal API key stored in Supabase Secrets
- No API key in browser or GitHub
- Verify Supabase user identity in Edge Function
- Restrict requests to approved read-only operations
- No generic URL proxy

## Data handling

- Use date range filters
- Normalize external API responses
- Handle missing values
- Respect API rate limits
- Verify availability of Garmin-derived activities
- Do not assume all activities are accessible

## V0.3 scope

Read-only integration.

No creation, modification or deletion
of Intervals.icu workouts or activities.

## Future development

V0.4: Athlete profile and workout definitions
V0.5: Friel-inspired periodization
V0.6: Automatic training scheduling
V0.7: Export planned workouts to Intervals.icu
