import assert from "node:assert/strict";
import test from "node:test";

import {
  ConfiguredExchangeRateProvider,
  createEnvironmentExchangeRateProvider,
  FrankfurterExchangeRateProvider,
} from "../../src/pricing/currency";

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  } as Response;
}

test("fetches Frankfurter rates, records the observation date, and caches them", async () => {
  let calls = 0;
  let now = Date.parse("2026-08-26T12:00:00.000Z");
  const provider = new FrankfurterExchangeRateProvider({
    apiUrl: "https://rates.example/v2",
    cacheTtlMs: 60_000,
    now: () => now,
    fetchImpl: async (input) => {
      calls += 1;
      assert.equal(input, "https://rates.example/v2/rate/USD/NGN");
      return response({ date: "2026-08-26", base: "USD", quote: "NGN", rate: 1_500 });
    },
  });

  const first = await provider.getRate("usd", "ngn");
  const second = await provider.getRate("USD", "NGN");

  assert.deepEqual(first, {
    fromCurrency: "USD",
    toCurrency: "NGN",
    rate: 1_500,
    observedAt: "2026-08-26T00:00:00.000Z",
    source: "frankfurter",
  });
  assert.deepEqual(second, first);
  assert.equal(calls, 1);

  now += 60_001;
  await provider.getRate("USD", "NGN");
  assert.equal(calls, 2);
});

test("returns null for provider failures or malformed rate responses", async () => {
  const failedProvider = new FrankfurterExchangeRateProvider({
    fetchImpl: async () => response({ message: "not found" }, 404),
  });
  const malformedProvider = new FrankfurterExchangeRateProvider({
    fetchImpl: async () => response({ date: "2026-08-26", base: "USD", quote: "NGN" }),
  });

  assert.equal(await failedProvider.getRate("USD", "NGN"), null);
  assert.equal(await malformedProvider.getRate("USD", "NGN"), null);
  assert.equal(await malformedProvider.getRate("US", "NGN"), null);
});

test("selects the provider from server environment configuration while retaining overrides", () => {
  const provider = createEnvironmentExchangeRateProvider({
    DEALDROP_EXCHANGE_RATES_PROVIDER: "frankfurter",
    DEALDROP_EXCHANGE_RATES_DATA_PROVIDER: "ECB",
  });
  assert.ok(provider instanceof FrankfurterExchangeRateProvider);

  const override = createEnvironmentExchangeRateProvider({
    DEALDROP_EXCHANGE_RATES_PROVIDER: "frankfurter",
    DEALDROP_EXCHANGE_RATES_JSON: '{"USD":{"NGN":1500}}',
    DEALDROP_EXCHANGE_RATES_AS_OF: "2026-08-26T00:00:00.000Z",
  });
  assert.ok(override instanceof ConfiguredExchangeRateProvider);
});

test("does not enable a network provider unless explicitly configured", () => {
  assert.equal(createEnvironmentExchangeRateProvider({}), undefined);
  assert.throws(
    () => createEnvironmentExchangeRateProvider({ DEALDROP_EXCHANGE_RATES_PROVIDER: "unknown" }),
    /must be frankfurter/i,
  );
});
