export class FeedbackStore {
  constructor() {
    this.items = [];
  }

  addFeedback({ artifactId, comment, author = 'mission-control' }) {
    const item = {
      id: `fb_${this.items.length + 1}`,
      artifactId,
      comment,
      author,
      createdAt: new Date().toISOString()
    };
    this.items.push(item);
    return item;
  }

  list(artifactId) {
    return this.items.filter((item) => item.artifactId === artifactId);
  }
}
