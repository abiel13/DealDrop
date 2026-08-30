export interface RevenueCatProEntitlement {
  startsAt: string;
  expiresAt: string | null;
  productIdentifier: string | null;
  store: string | null;
  environment: string | null;
}

export interface RevenueCatProSubscriptionVerifier {
  getActiveProEntitlement(userId: string): Promise<RevenueCatProEntitlement | null>;
}

export interface RevenueCatProSubscriptionSink {
  syncProSubscriptionEntitlement(
    userId: string,
    entitlement: RevenueCatProEntitlement | null,
  ): Promise<void>;
}

interface RevenueCatIntegrationOptions {
  apiKey: string;
  entitlementId: string;
  baseUrl?: string;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface RevenueCatWebhookResult {
  userId: string;
  entitlement: RevenueCatProEntitlement | null;
}

export class RevenueCatProIntegration implements RevenueCatProSubscriptionVerifier {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly requestTimeoutMs: number;

  constructor(private readonly options: RevenueCatIntegrationOptions) {
    this.baseUrl = options.baseUrl?.replace(/\/+$/, "") ?? "https://api.revenuecat.com/v1";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
  }

  async getActiveProEntitlement(userId: string): Promise<RevenueCatProEntitlement | null> {
    const response = await this.request(
      `/subscribers/${encodeURIComponent(userId)}`,
      "RevenueCat entitlement verification failed.",
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error("RevenueCat entitlement verification failed.");
    }

    const body = await readJson(response);
    return parseActiveProEntitlement(body, this.options.entitlementId);
  }

  async handleWebhook(payload: unknown, sink: RevenueCatProSubscriptionSink): Promise<boolean> {
    const result = parseRevenueCatWebhook(payload, this.options.entitlementId);
    if (!result) {
      return false;
    }

    await sink.syncProSubscriptionEntitlement(result.userId, result.entitlement);
    return true;
  }

  private request(path: string, failureMessage: string) {
    return fetchWithTimeout(
      this.fetchImpl,
      `${this.baseUrl}${path}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.options.apiKey}`,
        },
      },
      this.requestTimeoutMs,
      failureMessage,
    );
  }
}

export function parseActiveProEntitlement(
  payload: unknown,
  entitlementId: string,
  now = new Date(),
): RevenueCatProEntitlement | null {
  const root = asRecord(payload);
  const subscriber = asRecord(root?.subscriber);
  const entitlements = asRecord(subscriber?.entitlements);
  const entitlement = asRecord(entitlements?.[entitlementId]);
  if (!entitlement) {
    return null;
  }

  const expiresAt = parseDateValue(entitlement.expires_date);
  if (expiresAt && expiresAt <= now) {
    return null;
  }

  return {
    startsAt: parseDateValue(entitlement.purchase_date)?.toISOString() ?? now.toISOString(),
    expiresAt: expiresAt?.toISOString() ?? null,
    productIdentifier: stringValue(entitlement.product_identifier),
    store: stringValue(entitlement.store),
    environment: null,
  };
}

export function parseRevenueCatWebhook(
  payload: unknown,
  entitlementId: string,
  now = new Date(),
): RevenueCatWebhookResult | null {
  const root = asRecord(payload);
  const event = asRecord(root?.event) ?? root;
  const userId = stringValue(event?.app_user_id);
  if (!userId || !isUuid(userId)) {
    return null;
  }

  const entitlementIds = Array.isArray(event?.entitlement_ids)
    ? event.entitlement_ids.filter((value): value is string => typeof value === "string")
    : [];
  const legacyEntitlementId = stringValue(event?.entitlement_id);
  if (!entitlementIds.includes(entitlementId) && legacyEntitlementId !== entitlementId) {
    return null;
  }

  const eventType = stringValue(event?.type);
  if (eventType === "EXPIRATION") {
    return { userId, entitlement: null };
  }

  const expiresAt = parseMillisecondsValue(event?.expiration_at_ms);
  if (expiresAt && expiresAt <= now) {
    return { userId, entitlement: null };
  }

  return {
    userId,
    entitlement: {
      startsAt: parseMillisecondsValue(event?.purchased_at_ms)?.toISOString() ?? now.toISOString(),
      expiresAt: expiresAt?.toISOString() ?? null,
      productIdentifier: stringValue(event?.product_id),
      store: stringValue(event?.store),
      environment: stringValue(event?.environment),
    },
  };
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: string,
  init: RequestInit,
  timeoutMs: number,
  failureMessage: string,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } catch {
    throw new Error(failureMessage);
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new Error("RevenueCat returned an invalid entitlement response.");
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseDateValue(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseMillisecondsValue(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
