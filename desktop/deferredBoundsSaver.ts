export class DeferredBoundsSaver<T> {
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private readonly shouldSkip: () => boolean, private readonly capture: () => T, private readonly persist: (value: T) => void, private readonly delayMs = 250) {}
  schedule(): void {
    if (this.shouldSkip()) return;
    this.cancel();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (!this.shouldSkip()) this.persist(this.capture());
    }, this.delayMs);
  }
  cancel(): void { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }
}
