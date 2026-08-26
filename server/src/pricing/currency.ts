export interface ExchangeRate {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  observedAt: string;
  source: string;
}

export interface ExchangeRateProvider {
  getRate(fromCurrency: string, toCurrency: string): Promise<ExchangeRate | null>;
}

type FetchImplementation = (input: string, init?: RequestInit) => Promise<Response>;

export interface FrankfurterExchangeRateProviderOptions {
  apiUrl?: string;
  cacheTtlMs?: number;
  timeoutMs?: number;
  dataProvider?: string;
  fetchImpl?: FetchImplementation;
  now?: () => number;
}

export class ConfiguredExchangeRateProvider implements ExchangeRateProvider {
  constructor(
    private readonly rates: Readonly<Record<string, Readonly<Record<string, number>>>>,
    private readonly observedAt: string,
    private readonly source: string,
  ) {}

  async getRate(fromCurrency: string, toCurrency: string): Promise<ExchangeRate | null> {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();
    if (from === to) {
      return {
        fromCurrency: from,
        toCurrency: to,
        rate: 1,
        observedAt: this.observedAt,
        source: this.source,
      };
    }

    const rate = this.rates[from]?.[to];
    if (rate === undefined || !Number.isFinite(rate) || rate <= 0) {
      return null;
    }

    return {
      fromCurrency: from,
      toCurrency: to,
      rate,
      observedAt: this.observedAt,
      source: this.source,
    };
  }
}

export class FrankfurterExchangeRateProvider implements ExchangeRateProvider {
  private readonly apiUrl: string;
  private readonly cacheTtlMs: number;
  private readonly timeoutMs: number;
  private readonly dataProvider: string | null;
  private readonly fetchImpl: FetchImplementation;
  private readonly now: () => number;
  private readonly cache = new Map<string, { rate: ExchangeRate; expiresAt: number }>();
  private readonly inFlight = new Map<string, Promise<ExchangeRate | null>>();

  constructor(options: FrankfurterExchangeRateProviderOptions = {}) {
    this.apiUrl = (options.apiUrl ?? "https://api.frankfurter.dev/v2").replace(/\/+$/, "");
    this.cacheTtlMs = positiveOption(options.cacheTtlMs ?? 60 * 60 * 1_000, "cacheTtlMs");
    this.timeoutMs = positiveOption(options.timeoutMs ?? 5_000, "timeoutMs");
    this.dataProvider = options.dataProvider?.trim() || null;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? Date.now;
  }

  async getRate(fromCurrency: string, toCurrency: string): Promise<ExchangeRate | null> {
    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();
    if (!isCurrencyCode(from) || !isCurrencyCode(to)) {
      return null;
    }

    if (from === to) {
      return {
        fromCurrency: from,
        toCurrency: to,
        rate: 1,
        observedAt: new Date(this.now()).toISOString(),
        source: this.sourceName(),
      };
    }

    const key = `${from}:${to}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > this.now()) {
      return cached.rate;
    }

    const existingRequest = this.inFlight.get(key);
    if (existingRequest) {
      return existingRequest;
    }

    const request = this.fetchRate(from, to);
    this.inFlight.set(key, request);
    try {
      const rate = await request;
      if (rate) {
        this.cache.set(key, { rate, expiresAt: this.now() + this.cacheTtlMs });
      }
      return rate;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async fetchRate(fromCurrency: string, toCurrency: string) {
    const url = new URL(
      `${this.apiUrl}/rate/${encodeURIComponent(fromCurrency)}/${encodeURIComponent(toCurrency)}`,
    );
    if (this.dataProvider) {
      url.searchParams.set("providers", this.dataProvider);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url.toString(), {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        return null;
      }

      const payload: unknown = await response.json();
      return parseFrankfurterRate(payload, fromCurrency, toCurrency, this.sourceName());
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private sourceName() {
    return this.dataProvider ? `frankfurter/${this.dataProvider}` : "frankfurter";
  }
}

export function createConfiguredExchangeRateProvider(
  env: NodeJS.ProcessEnv = process.env,
): ExchangeRateProvider | undefined {
  const serializedRates = env.DEALDROP_EXCHANGE_RATES_JSON?.trim();
  if (serializedRates) {
    let rates: unknown;
    try {
      rates = JSON.parse(serializedRates);
    } catch {
      throw new Error("DEALDROP_EXCHANGE_RATES_JSON must contain valid JSON.");
    }

    if (!isRateTable(rates)) {
      throw new Error(
        "DEALDROP_EXCHANGE_RATES_JSON must map source currencies to target currency rates.",
      );
    }

    const observedAt = env.DEALDROP_EXCHANGE_RATES_AS_OF?.trim();
    if (!observedAt || !Number.isFinite(Date.parse(observedAt))) {
      throw new Error("DEALDROP_EXCHANGE_RATES_AS_OF must be a valid ISO timestamp.");
    }

    return new ConfiguredExchangeRateProvider(
      rates,
      new Date(observedAt).toISOString(),
      env.DEALDROP_EXCHANGE_RATES_SOURCE?.trim() || "configured_rate_table",
    );
  }

  return undefined;
}

export function createEnvironmentExchangeRateProvider(
  env: NodeJS.ProcessEnv = process.env,
): ExchangeRateProvider | undefined {
  const configured = createConfiguredExchangeRateProvider(env);
  if (configured) {
    return configured;
  }

  const provider = env.DEALDROP_EXCHANGE_RATES_PROVIDER?.trim().toLowerCase();
  if (!provider) {
    return undefined;
  }
  if (provider !== "frankfurter") {
    throw new Error(
      "DEALDROP_EXCHANGE_RATES_PROVIDER must be frankfurter or left empty to disable conversion.",
    );
  }

  return new FrankfurterExchangeRateProvider({
    apiUrl: env.DEALDROP_EXCHANGE_RATES_API_URL,
    cacheTtlMs: parsePositiveEnvironmentNumber(
      env.DEALDROP_EXCHANGE_RATES_CACHE_TTL_MS,
      "DEALDROP_EXCHANGE_RATES_CACHE_TTL_MS",
      60 * 60 * 1_000,
    ),
    timeoutMs: parsePositiveEnvironmentNumber(
      env.DEALDROP_EXCHANGE_RATES_TIMEOUT_MS,
      "DEALDROP_EXCHANGE_RATES_TIMEOUT_MS",
      5_000,
    ),
    dataProvider: env.DEALDROP_EXCHANGE_RATES_DATA_PROVIDER,
  });
}

function isRateTable(value: unknown): value is Record<string, Readonly<Record<string, number>>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.entries(value).every(([from, targets]) => {
    if (!/^[A-Z]{3}$/.test(from) || !targets || typeof targets !== "object") {
      return false;
    }

    return Object.entries(targets).every(
      ([to, rate]) =>
        /^[A-Z]{3}$/.test(to) && typeof rate === "number" && Number.isFinite(rate) && rate > 0,
    );
  });
}

function parseFrankfurterRate(
  value: unknown,
  fromCurrency: string,
  toCurrency: string,
  source: string,
): ExchangeRate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const rate = payload.rate;
  const date = payload.date;
  const base = payload.base;
  const quote = payload.quote;
  if (
    typeof rate !== "number" ||
    !Number.isFinite(rate) ||
    rate <= 0 ||
    typeof date !== "string" ||
    !Number.isFinite(Date.parse(date)) ||
    (typeof base === "string" && base.toUpperCase() !== fromCurrency) ||
    (typeof quote === "string" && quote.toUpperCase() !== toCurrency)
  ) {
    return null;
  }

  return {
    fromCurrency,
    toCurrency,
    rate,
    observedAt: new Date(date).toISOString(),
    source,
  };
}

function isCurrencyCode(value: string) {
  return /^[A-Z]{3}$/.test(value);
}

function positiveOption(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}

function parsePositiveEnvironmentNumber(value: string | undefined, name: string, fallback: number) {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return parsed;
}
