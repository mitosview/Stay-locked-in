/**
 * MacroFactor-style adaptive coaching engine.
 * Uses observed intake and weight changes to refine TDEE and set macro targets.
 */
export class AdaptiveCoachingEngine {
  constructor({ initialTdee = 2200, proteinPerKg = 1.8, fatFloorPerKg = 0.7 } = {}) {
    this.currentTdee = initialTdee;
    this.proteinPerKg = proteinPerKg;
    this.fatFloorPerKg = fatFloorPerKg;
  }

  estimateWeeklyTdee({ dailyIntake, startWeightKg, endWeightKg }) {
    if (!dailyIntake?.length || dailyIntake.length < 7) {
      throw new Error('Seven days of intake are required for a weekly update.');
    }

    const avgIntake = dailyIntake.reduce((sum, kcal) => sum + kcal, 0) / dailyIntake.length;
    const deltaKg = endWeightKg - startWeightKg;
    const energyFromMassChange = (deltaKg * 7700) / dailyIntake.length;
    const observedTdee = avgIntake - energyFromMassChange;

    // smooth to avoid aggressive swings
    this.currentTdee = Math.round((this.currentTdee * 0.65) + (observedTdee * 0.35));
    return this.currentTdee;
  }

  buildTargets({ bodyWeightKg, goal = 'maintain' }) {
    const goalDelta = {
      cut: -350,
      maintain: 0,
      gain: 250
    }[goal] ?? 0;

    const calorieTarget = this.currentTdee + goalDelta;
    const proteinG = Math.round(bodyWeightKg * this.proteinPerKg);
    const fatG = Math.round(bodyWeightKg * this.fatFloorPerKg);
    const carbKcal = Math.max(0, calorieTarget - ((proteinG * 4) + (fatG * 9)));
    const carbsG = Math.round(carbKcal / 4);

    return {
      calorieTarget,
      macros: { proteinG, carbsG, fatG },
      uxState: {
        tone: 'coaching',
        showRedNumbers: false,
        message: 'Targets updated from observed trends. Keep logging consistently.'
      }
    };
  }
}
