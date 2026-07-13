export class RollingBuffer {
  private value = '';
  constructor(private readonly maxCharacters: number) {}
  append(chunk: string): void { this.value = (this.value + chunk).slice(-this.maxCharacters); }
  clear(): void { this.value = ''; }
  tail(length: number): string { return this.value.slice(-length); }
  get text(): string { return this.value; }
}
