# Walkthrough: Protocols, Meal Planning, Sync, Mission Control Feedback

## Goal
Verify specialized protocol behavior, dynamic weekly planning, ecosystem sync, and UI feedback storage.

## Steps
1. Generate protocol configs for keto and intermittent fasting.
2. Generate weekly meal plan and shopping list from macro targets.
3. Sync sample payload to Apple Health adapter.
4. Submit a Mission Control comment tied to a UI artifact.

## Verification Output
- Keto returns net carb tracking mode.
- Fasting returns timer-capable window config.
- Meal planner returns seven day plan.
- Sync returns success status and timestamp.
- Feedback list returns saved comment for artifact.

## Automation Link
Implemented in `scripts/runWalkthroughs.js` under `walkthroughProtocolsMealPlanningSyncAndFeedback()`.
