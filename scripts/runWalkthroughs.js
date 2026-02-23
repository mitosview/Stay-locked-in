import assert from 'node:assert/strict';
import { AdaptiveCoachingEngine } from '../src/features/coaching/adaptiveCoachingEngine.js';
import { NutrientRegistry } from '../src/features/nutrients/nutrientRegistry.js';
import { MultimodalLogger } from '../src/features/logging/multimodalLogger.js';
import { ProtocolManager } from '../src/features/protocols/protocolManager.js';
import { MealPlanner } from '../src/features/meal-planning/mealPlanner.js';
import { EcosystemSync } from '../src/features/sync/ecosystemSync.js';
import { FeedbackStore } from '../src/features/mission-control/feedbackStore.js';

const createMicros = () => Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`n${i + 1}`, i + 1]));

function walkthroughAdaptiveCoaching() {
  const engine = new AdaptiveCoachingEngine({ initialTdee: 2400 });
  const tdee = engine.estimateWeeklyTdee({
    dailyIntake: [2300, 2250, 2280, 2350, 2290, 2310, 2275],
    startWeightKg: 85,
    endWeightKg: 84.6
  });
  const targets = engine.buildTargets({ bodyWeightKg: 84.6, goal: 'cut' });

  assert.ok(tdee > 1500 && tdee < 3500);
  assert.equal(targets.uxState.showRedNumbers, false);
  assert.ok(targets.macros.proteinG > 0);
}

function walkthroughClinicalNutrientsAndLogging() {
  const registry = new NutrientRegistry();
  registry.upsertFood({ id: 'verified_1', name: 'Food', source: 'NCCDB', micros: createMicros() });

  const logger = new MultimodalLogger({ nutrientRegistry: registry });
  const photo = logger.logFromPhoto({ imageLabel: 'chicken bowl', estimatedMacros: { protein: 35, carbs: 40, fat: 15 } });
  const voice = logger.logFromVoice({ transcript: 'I had oats and whey', parsedMeal: { items: 2 } });
  const barcode = logger.logFromBarcode({ barcode: '00112233', foodId: 'verified_1' });

  assert.equal(photo.mode, 'photo');
  assert.equal(voice.mode, 'voice');
  assert.equal(barcode.payload.verified, true);
}

function walkthroughProtocolsMealPlanningSyncAndFeedback() {
  const protocols = new ProtocolManager();
  const mealPlanner = new MealPlanner();
  const sync = new EcosystemSync();
  const feedback = new FeedbackStore();

  const keto = protocols.configure({ protocol: 'keto' });
  const fasting = protocols.configure({ protocol: 'intermittent_fasting' });
  const plan = mealPlanner.generateWeeklyPlan({ calorieTarget: 2200, macros: { proteinG: 170, carbsG: 180, fatG: 70 } });
  const syncResult = sync.sync({ providerKey: 'apple_health', payload: { sample: true } });
  const comment = feedback.addFeedback({ artifactId: 'screen_dashboard_v2', comment: 'Move hydration card up.' });

  assert.equal(keto.trackMetric, 'netCarbs');
  assert.equal(Boolean(fasting.timerEnabled), true);
  assert.equal(plan.days.length, 7);
  plan.days[0].meals.dinner = 'Steak + sweet potato + asparagus';
  assert.notEqual(plan.days[0].meals.dinner, plan.days[1].meals.dinner);
  assert.equal(syncResult.status, 'ok');
  assert.equal(feedback.list('screen_dashboard_v2').length, 1);
  assert.equal(comment.author, 'mission-control');
}

walkthroughAdaptiveCoaching();
walkthroughClinicalNutrientsAndLogging();
walkthroughProtocolsMealPlanningSyncAndFeedback();

console.log('All OmniTrack AI walkthrough checks passed.');
