import type { MarketplaceSource } from "../marketplaces/shared/types";

export type DealRoomLiveAvailability = "available" | "unavailable" | "unknown";

export type DealRoomLiveUpdateType =
  | "initial"
  | "price_changed"
  | "availability_changed"
  | "listing_unavailable"
  | "better_alternative";

export interface DealRoomLiveAlternative {
  listingId: string;
  source: MarketplaceSource;
  price: number | null;
  currency: string | null;
  url: string | null;
}

export interface DealRoomLiveSnapshot {
  listingId: string | null;
  productIdentityId: string | null;
  title: string;
  imageUrl: string | null;
  currentPrice: number | null;
  currency: string | null;
  availability: DealRoomLiveAvailability;
  source: MarketplaceSource | null;
  url: string | null;
  betterAlternative: DealRoomLiveAlternative | null;
}

export interface DealRoomLiveState extends DealRoomLiveSnapshot {
  previousPrice: number | null;
  priceChange: number | null;
  priceChangePercent: number | null;
  priceChangedAt: string | null;
  availabilityChangedAt: string | null;
  lastUpdateType: DealRoomLiveUpdateType;
  lastChangedAt: string | null;
  lastNotifiedAt: string | null;
  lastNotifiedType: DealRoomLiveUpdateType | null;
}

export interface DealRoomLiveUpdateEvaluation {
  state: DealRoomLiveState;
  changeType: DealRoomLiveUpdateType | null;
  shouldNotify: boolean;
}

const MINIMUM_MEANINGFUL_PRICE_CHANGE = 0.01;
const MEANINGFUL_PRICE_CHANGE_PERCENT = 0.01;

export function evaluateDealRoomLiveUpdate(
  previous: DealRoomLiveState | null,
  next: DealRoomLiveSnapshot,
  observedAt: string,
  notificationCooldownMinutes = 360,
): DealRoomLiveUpdateEvaluation {
  if (!previous) {
    return {
      state: {
        ...next,
        previousPrice: null,
        priceChange: null,
        priceChangePercent: null,
        priceChangedAt: null,
        availabilityChangedAt: null,
        lastUpdateType: "initial",
        lastChangedAt: null,
        lastNotifiedAt: null,
        lastNotifiedType: null,
      },
      changeType: "initial",
      shouldNotify: false,
    };
  }

  const priceChange = getMeaningfulPriceChange(previous, next);
  const availabilityChanged = previous.availability !== next.availability;
  const listingUnavailable =
    previous.availability !== "unavailable" && next.availability === "unavailable";
  const betterAlternativeAppeared = hasBetterAlternativeAppeared(
    previous.betterAlternative,
    next.betterAlternative,
  );
  const changeType = listingUnavailable
    ? "listing_unavailable"
    : availabilityChanged
      ? "availability_changed"
      : priceChange
        ? "price_changed"
        : betterAlternativeAppeared
          ? "better_alternative"
          : null;
  const shouldNotify =
    changeType !== null &&
    isNotificationCooldownComplete(previous, observedAt, notificationCooldownMinutes);

  const state: DealRoomLiveState = {
    ...next,
    previousPrice: priceChange ? previous.currentPrice : previous.previousPrice,
    priceChange: priceChange?.amount ?? previous.priceChange,
    priceChangePercent: priceChange?.percent ?? previous.priceChangePercent,
    priceChangedAt: priceChange ? observedAt : previous.priceChangedAt,
    availabilityChangedAt: availabilityChanged ? observedAt : previous.availabilityChangedAt,
    lastUpdateType: changeType ?? previous.lastUpdateType,
    lastChangedAt: changeType ? observedAt : previous.lastChangedAt,
    lastNotifiedAt: shouldNotify ? observedAt : previous.lastNotifiedAt,
    lastNotifiedType: shouldNotify ? changeType : previous.lastNotifiedType,
  };

  return { state, changeType, shouldNotify };
}

function getMeaningfulPriceChange(previous: DealRoomLiveState, next: DealRoomLiveSnapshot) {
  if (
    previous.currentPrice === null ||
    next.currentPrice === null ||
    normalizeCurrency(previous.currency) !== normalizeCurrency(next.currency)
  ) {
    return null;
  }

  const amount = next.currentPrice - previous.currentPrice;
  const percent = previous.currentPrice === 0 ? null : amount / Math.abs(previous.currentPrice);
  const threshold = Math.max(
    MINIMUM_MEANINGFUL_PRICE_CHANGE,
    Math.abs(previous.currentPrice) * MEANINGFUL_PRICE_CHANGE_PERCENT,
  );
  if (Math.abs(amount) < threshold) return null;

  return { amount, percent };
}

function hasBetterAlternativeAppeared(
  previous: DealRoomLiveAlternative | null,
  next: DealRoomLiveAlternative | null,
) {
  if (!next) return false;
  if (!previous) return true;
  if (previous.listingId === next.listingId) return false;
  if (
    previous.price === null ||
    next.price === null ||
    normalizeCurrency(previous.currency) !== normalizeCurrency(next.currency)
  ) {
    return true;
  }

  return (
    next.price < previous.price && previous.price - next.price >= MINIMUM_MEANINGFUL_PRICE_CHANGE
  );
}

function isNotificationCooldownComplete(
  previous: DealRoomLiveState,
  observedAt: string,
  cooldownMinutes: number,
) {
  if (!previous.lastNotifiedAt) return true;
  const elapsed = Date.parse(observedAt) - Date.parse(previous.lastNotifiedAt);
  return !Number.isFinite(elapsed) || elapsed >= Math.max(0, cooldownMinutes) * 60_000;
}

function normalizeCurrency(value: string | null) {
  return value?.trim().toUpperCase() || null;
}
