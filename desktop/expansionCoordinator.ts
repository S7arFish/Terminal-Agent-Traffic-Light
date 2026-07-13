/** Serializes asynchronous window resize requests and converges on the latest intent. */
export class ExpansionCoordinator {
  private desired = false;
  private actual = false;
  private running?: Promise<void>;
  constructor(private readonly apply: (expanded: boolean) => Promise<boolean>, private readonly render: (expanded: boolean) => void) {}
  get isExpanded(): boolean { return this.actual; }
  request(expanded: boolean): Promise<void> {
    this.desired = expanded;
    if (!this.running) {
      this.running = this.reconcile().finally(() => {
        this.running = undefined;
        if (this.actual !== this.desired) void this.request(this.desired);
      });
    }
    return this.running;
  }
  private async reconcile(): Promise<void> {
    while (this.actual !== this.desired) {
      const target = this.desired;
      if (target) this.render(true);
      this.actual = await this.apply(target);
      if (!target || this.actual !== target) this.render(this.actual);
    }
  }
}
