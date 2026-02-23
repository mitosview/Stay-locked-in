const VERIFIED_SOURCES = new Set(['USDA', 'NCCDB']);

export class NutrientRegistry {
  constructor() {
    this.foods = new Map();
  }

  upsertFood(food) {
    if (!VERIFIED_SOURCES.has(food.source)) {
      throw new Error(`Food source must be verified (USDA/NCCDB). Received: ${food.source}`);
    }
    if (!food.micros || Object.keys(food.micros).length < 80) {
      throw new Error('Food entry must include at least 80 micronutrients.');
    }
    this.foods.set(food.id, food);
  }

  lookup(foodId) {
    return this.foods.get(foodId) ?? null;
  }
}
