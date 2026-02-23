# Walkthrough: Adaptive Coaching Engine

## Goal
Verify that weekly macro updates are derived from observed intake vs. weight change and avoid punitive red-number UX.

## Steps
1. Initialize the engine with baseline TDEE.
2. Submit 7 days of intake with measured weight delta.
3. Recompute TDEE using mass-energy conversion and smoothing.
4. Generate cut/maintain/gain macro targets.

## Verification Output
- TDEE remains in plausible physiological range.
- Protein/fat/carbs are non-negative.
- UX output explicitly sets `showRedNumbers` to `false`.

## Automation Link
Implemented in `scripts/runWalkthroughs.js` under `walkthroughAdaptiveCoaching()`.
