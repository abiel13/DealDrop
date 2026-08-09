export function normalizeText(value: string | null | undefined) {
  const normalized = value
    ?.replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
}

export function normalizeCurrency(value: string | null | undefined) {
  const token = normalizeText(value)?.toUpperCase();

  if (!token) {
    return null;
  }

  const normalized =
    token === "$" || token === "US$"
      ? "USD"
      : token === "\u20AC"
        ? "EUR"
        : token === "\u00A3"
          ? "GBP"
          : token === "\u20A6"
            ? "NGN"
            : token;

  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}
