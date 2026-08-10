export class RateLimiter {
  private nextAllowedAt = 0;

  constructor(
    private readonly minimumDelayMs: number,
    private readonly jitterMs = 500,
  ) {}

  async wait() {
    const now = Date.now();
    const jitter = Math.floor(Math.random() * (this.jitterMs + 1));
    const delay = Math.max(0, this.nextAllowedAt - now) + jitter;

    if (delay > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }

    this.nextAllowedAt = Date.now() + this.minimumDelayMs;
  }
}
