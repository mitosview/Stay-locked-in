import { AdaptiveCoachingEngine } from './features/coaching/adaptiveCoachingEngine.js';
import { NutrientRegistry } from './features/nutrients/nutrientRegistry.js';
import { MultimodalLogger } from './features/logging/multimodalLogger.js';
import { ProtocolManager } from './features/protocols/protocolManager.js';
import { MealPlanner } from './features/meal-planning/mealPlanner.js';
import { EcosystemSync } from './features/sync/ecosystemSync.js';
import { FeedbackStore } from './features/mission-control/feedbackStore.js';

function buildMicros() {
  const micros = {};
  for (let i = 1; i <= 80; i += 1) micros[`micro_${i}`] = i;
  return micros;
}

function main() {
  const coaching = new AdaptiveCoachingEngine({ initialTdee: 2300 });
  const nutrientRegistry = new NutrientRegistry();
  const logger = new MultimodalLogger({ nutrientRegistry });
  const protocols = new ProtocolManager();
  const planner = new MealPlanner();
  const sync = new EcosystemSync();
  const feedback = new FeedbackStore();

  nutrientRegistry.upsertFood({
    id: 'food_salmon_usda',
    source: 'USDA',
    name: 'Atlantic salmon',
    micros: buildMicros()
  });

  const tdee = coaching.estimateWeeklyTdee({
    dailyIntake: [2200, 2100, 2250, 2300, 2150, 2200, 2180],
    startWeightKg: 82,
    endWeightKg: 81.7
  });

  const targets = coaching.buildTargets({ bodyWeightKg: 81.7, goal: 'cut' });
  const plan = planner.generateWeeklyPlan({
    calorieTarget: targets.calorieTarget,
    macros: targets.macros,
    preferences: ['high-protein', 'seafood']
  });

  const log = logger.logFromBarcode({ barcode: '0123456789', foodId: 'food_salmon_usda' });
  const protocol = protocols.configure({ protocol: 'keto' });
  const syncStatus = sync.sync({ providerKey: 'health_connect', payload: { targets, log } });
  const fb = feedback.addFeedback({ artifactId: 'ui-home-v1', comment: 'Increase protein ring contrast.' });

  console.log(JSON.stringify({ tdee, targets, planDay1: plan.days[0], protocol, syncStatus, feedback: fb }, null, 2));
}

main();
