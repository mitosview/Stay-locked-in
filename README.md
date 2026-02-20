# Stay Locked In (Next.js + Supabase)

Athlete-centered SaaS coaching platform with coach and athlete roles.

## Features
- Coach dashboard
  - List active athletes via `coach_athlete_memberships`
  - Open athlete profile and inspect weekly check-ins
  - Generate AI summary + macro suggestion + draft message
  - Approve and send message
- Athlete portal
  - Submit weekly check-ins
  - View current nutrition/cardio/steps plan
  - View coach messages
- OpenAI integration
  - API route `/api/ai/generate` for coach summary + macro suggestion + message draft
  - API route `/api/ai/weekly-summary` for strict coach weekly check-in summary JSON
  - API route `/api/ai/plan-adjustment` for strict next-week plan adjustment recommendations
  - API route `/api/ai/coach-message` for strict coach-to-athlete weekly response messages
  - API route `/api/ai/food-swaps` for macro-equivalent food swap options
  - Persists outputs to `ai_outputs` (`checkin_summary`, `macro_adjustment`, `message_draft`, `summary`, `macro_suggestion`, `response_draft`, `food_swaps`)
- Supabase SQL schema + RLS policies in `supabase/schema.sql`

## Setup
1. Install deps:
   ```bash
   npm install
   ```
2. Set env vars:
   ```bash
   OPENAI_API_KEY=...
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...   # server-only
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
   Optional compatibility variable (legacy): `NEXT_PUBLIC_SUPABASE_URL` (prefer `SUPABASE_URL`).
3. Apply DB schema in Supabase SQL editor: `supabase/schema.sql`
4. Run app:
   ```bash
   npm run dev
   ```

## Data model tables
- `coaches`
- `athletes`
- `coach_athlete_memberships`
- `checkins`
- `plans`
- `ai_outputs`
- `messages`

Supabase Auth users map to role profile tables via `user_id` foreign keys.


## Workflow wiring
- Open check-in: call `/api/ai/weekly-summary` and persist `ai_outputs.output_type = summary`.
- Click **Generate Adjustments**: call `/api/ai/plan-adjustment` and persist `output_type = macro_suggestion`.
- Click **Generate Response**: call `/api/ai/coach-message` and persist `output_type = response_draft`.
- Coach edits and sends final message: save to `messages` (email/in-app delivery can be layered on top).

## Guardrails
- Strict JSON schema validation with one automatic retry, then fail fast.
- Carb delta capped to ±50g/week unless `coach_override` is true.
- If adherence <80% and no override, auto-default to hold/compliance focus.
- `model_version` is persisted on every AI output row for longitudinal comparison.
