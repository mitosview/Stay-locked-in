export class MealPlanner {
  generateWeeklyPlan({ calorieTarget, macros, preferences = [] }) {
    const dailyTemplate = {
      breakfast: 'Greek yogurt bowl + berries + chia',
      lunch: 'Chicken quinoa salad + olive oil dressing',
      dinner: 'Salmon + potatoes + mixed greens',
      snacks: 'Protein shake + nuts'
    };

    return {
      preferences,
      macroTargets: macros,
      calorieTarget,
      days: Array.from({ length: 7 }, (_, index) => ({
        day: index + 1,
        meals: dailyTemplate
      })),
      shoppingList: [
        'Greek yogurt', 'Berries', 'Chia seeds', 'Chicken breast',
        'Quinoa', 'Mixed greens', 'Salmon', 'Potatoes', 'Protein powder', 'Nuts'
      ]
    };
  }
}
