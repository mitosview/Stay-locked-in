# Walkthrough: Clinical Nutrients + Multimodal Logging

## Goal
Validate that food logging pathways remain anchored to verified data and support photo, voice, and barcode input.

## Steps
1. Insert a food item with `NCCDB` source and >=80 micronutrients.
2. Create a photo-based entry from estimated dish macros.
3. Create a voice-based entry from transcript parsing.
4. Scan barcode and resolve to verified registry entry.

## Verification Output
- Registry rejects non-verified sources.
- Entry modes are persisted as `photo`, `voice`, `barcode`.
- Barcode path marks entry as verified when registry match exists.

## Automation Link
Implemented in `scripts/runWalkthroughs.js` under `walkthroughClinicalNutrientsAndLogging()`.
