export class MultimodalLogger {
  constructor({ nutrientRegistry }) {
    this.nutrientRegistry = nutrientRegistry;
    this.entries = [];
  }

  logFromPhoto({ imageLabel, estimatedMacros, confidence = 0.8 }) {
    return this.#createEntry('photo', {
      imageLabel,
      estimatedMacros,
      confidence,
      needsReview: confidence < 0.65
    });
  }

  logFromVoice({ transcript, parsedMeal }) {
    return this.#createEntry('voice', { transcript, parsedMeal, confidence: 0.86 });
  }

  logFromBarcode({ barcode, foodId }) {
    const verifiedFood = this.nutrientRegistry.lookup(foodId);
    return this.#createEntry('barcode', {
      barcode,
      foodId,
      verified: Boolean(verifiedFood),
      source: verifiedFood?.source ?? 'UNVERIFIED_FALLBACK'
    });
  }

  #createEntry(mode, payload) {
    const entry = {
      id: `entry_${this.entries.length + 1}`,
      mode,
      payload,
      createdAt: new Date().toISOString()
    };
    this.entries.push(entry);
    return entry;
  }
}
