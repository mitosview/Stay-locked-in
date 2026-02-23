# OmniTrack AI Architecture

## Modular Feature Topology

The codebase is organized by feature to keep ownership clear as the project scales beyond 500 lines:

- `src/features/coaching`: adaptive energy expenditure estimation and macro target generation.
- `src/features/nutrients`: validated nutrient registry constrained to clinical data sources (USDA/NCCDB).
- `src/features/logging`: multimodal input pipelines (photo, voice, barcode).
- `src/features/protocols`: keto, intermittent fasting, and peri-workout strategies.
- `src/features/meal-planning`: weekly meal generation + shopping list synthesis.
- `src/features/sync`: bi-directional health ecosystem adapters.
- `src/features/mission-control`: artifact feedback and UI iteration capture.

## Data Flow (Text Diagram)

1. User logs meals via photo/voice/barcode (`logging`).
2. Entries resolve against verified foods (`nutrients`).
3. Intake + weight trends feed adaptive update (`coaching`) weekly.
4. Updated targets drive meal plans (`meal-planning`) and protocol overlays (`protocols`).
5. Daily summaries sync to external platforms (`sync`).
6. UI artifacts and comments are captured for design iteration (`mission-control`).

## Verification Tenet

Task-level walkthroughs are codified in `scripts/runWalkthroughs.js` and documented in `docs/walkthroughs/`. Each feature has at least one integration-oriented assertion.

## External Integration Strategy

- Health Connect / Apple Health / Garmin Connect+ are represented behind `EcosystemSync` adapters.
- API-specific clients should be added as provider submodules (`src/features/sync/providers/*.ts`) while keeping the domain interfaces stable.

## Production Hardening Backlog

- Persist domain states with encrypted local storage + cloud replication.
- Add model serving interface for multimodal inference providers.
- Add telemetry and privacy controls with consent-scoped data exports.
