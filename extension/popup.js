/* global chrome */

const STORAGE_KEY = "dealdrop.session";
const CONFIG = globalThis.DEALDROP_EXTENSION_CONFIG || {};

const state = {
  session: null,
  capture: null,
  pageUrl: null,
  busy: false,
};

const sections = [
  "configuration-state",
  "signed-out-state",
  "ready-state",
  "capture-state",
  "review-state",
  "success-state",
  "error-state",
];

const byId = (id) => document.getElementById(id);

class UserFacingError extends Error {}

function init() {
  bindEvents();

  const configurationError = validateConfiguration();
  if (configurationError) {
    byId("configuration-message").textContent = configurationError;
    showSection("configuration-state");
    return;
  }

  void loadSession();
}

function bindEvents() {
  byId("sign-in-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void signIn();
  });
  byId("capture-button").addEventListener("click", () => void captureCurrentPage());
  byId("retry-button").addEventListener("click", () => void captureCurrentPage());
  byId("save-button").addEventListener("click", () => void saveTracking());
  byId("cancel-review-button").addEventListener("click", resetToReady);
  byId("capture-another-button").addEventListener("click", resetToReady);
  byId("sign-out-button").addEventListener("click", () => void signOut());
  byId("error-sign-out-button").addEventListener("click", () => void signOut());
  byId("open-app-from-sign-in").addEventListener("click", openDealDrop);
  byId("open-product-button").addEventListener("click", openCapturedProduct);
  byId("open-product-success-button").addEventListener("click", openCapturedProduct);
}

async function loadSession() {
  try {
    state.session = await getStoredSession();
    showSection(state.session ? "ready-state" : "signed-out-state");
  } catch {
    state.session = null;
    showSection("signed-out-state");
  }
}

function validateConfiguration() {
  if (!isHttpUrl(CONFIG.apiBaseUrl) || !isHttpUrl(CONFIG.supabaseUrl)) {
    return "Copy config.example.js to config.js and set the public API and Supabase URLs.";
  }
  if (typeof CONFIG.supabaseAnonKey !== "string" || !CONFIG.supabaseAnonKey.trim()) {
    return "Set the public Supabase anon key in config.js. Never use a service-role key here.";
  }
  return null;
}

async function signIn() {
  const email = byId("email").value.trim();
  const password = byId("password").value;
  const button = byId("sign-in-button");
  const message = byId("sign-in-message");

  message.hidden = true;
  button.disabled = true;
  button.textContent = "Signing in…";

  try {
    const session = await requestSupabaseToken("password", { email, password });
    state.session = session;
    byId("password").value = "";
    showSection("ready-state");
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : "We couldn't sign you in.";
    message.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
}

async function signOut() {
  state.session = null;
  state.capture = null;
  state.pageUrl = null;
  await chrome.storage.local.remove(STORAGE_KEY);
  showSection("signed-out-state");
}

async function getStoredSession() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const session = normalizeSession(stored[STORAGE_KEY]);
  if (!session) return null;
  if (session.expiresAt > Math.floor(Date.now() / 1000) + 30) return session;

  try {
    return await refreshSession(session);
  } catch {
    await chrome.storage.local.remove(STORAGE_KEY);
    return null;
  }
}

async function ensureSession() {
  if (!state.session) {
    throw new UserFacingError("Sign in to DealDrop before tracking a product.");
  }

  if (state.session.expiresAt > Math.floor(Date.now() / 1000) + 30) {
    return state.session;
  }

  return refreshSession(state.session);
}

async function requestSupabaseToken(grantType, body) {
  const response = await fetch(
    `${String(CONFIG.supabaseUrl).replace(/\/+$/, "")}/auth/v1/token?grant_type=${grantType}`,
    {
      method: "POST",
      headers: {
        apikey: CONFIG.supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const payload = await readJson(response);
  if (!response.ok) {
    throw new UserFacingError(
      grantType === "password"
        ? "We couldn't sign you in. Check your email and password."
        : "Your DealDrop session expired. Please sign in again.",
    );
  }

  const session = normalizeSession(payload);
  if (!session) throw new UserFacingError("DealDrop returned an invalid sign-in session.");
  await chrome.storage.local.set({ [STORAGE_KEY]: session });
  return session;
}

function normalizeSession(value) {
  if (!value || typeof value !== "object") return null;
  const accessToken = typeof value.access_token === "string" ? value.access_token : null;
  const refreshToken = typeof value.refresh_token === "string" ? value.refresh_token : null;
  if (!accessToken || !refreshToken) return null;

  const expiresAt =
    Number(value.expires_at) || Math.floor(Date.now() / 1000) + Number(value.expires_in || 3600);
  return { accessToken, refreshToken, expiresAt };
}

function refreshSession(session) {
  return requestSupabaseToken("refresh_token", { refresh_token: session.refreshToken });
}

async function apiRequest(path, options = {}, retryAfterRefresh = true) {
  const session = await ensureSession();
  const response = await fetch(`${String(CONFIG.apiBaseUrl).replace(/\/+$/, "")}${path}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${session.accessToken}`,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 401 && retryAfterRefresh) {
    try {
      await refreshSession(session);
      return apiRequest(path, options, false);
    } catch {
      state.session = null;
      await chrome.storage.local.remove(STORAGE_KEY);
      throw new UserFacingError("Your DealDrop session expired. Please sign in again.");
    }
  }

  const payload = await readJson(response);
  if (!response.ok) {
    throw new UserFacingError(getApiErrorMessage(payload, response.status));
  }
  if (!payload || typeof payload !== "object" || !("data" in payload)) {
    throw new UserFacingError("DealDrop returned an invalid response.");
  }
  return payload.data;
}

async function readJson(response) {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getApiErrorMessage(payload, status) {
  const message = payload?.error?.message;
  if (typeof message === "string" && message.trim()) return message;
  if (status === 401) return "Your DealDrop session expired. Please sign in again.";
  if (status === 429) return "DealDrop is receiving too many requests. Try again shortly.";
  return "DealDrop couldn't save this product. Please try again.";
}

async function captureCurrentPage() {
  if (state.busy) return;
  state.busy = true;
  showSection("capture-state");

  try {
    await ensureSession();
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id || !isHttpUrl(tab.url)) {
      throw new UserFacingError(
        "This page cannot be captured. Open a public product page and try again.",
      );
    }

    state.pageUrl = tab.url;
    const execution = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractProductMetadataFromPage,
    });
    const extractedMetadata = execution[0]?.result;
    if (!extractedMetadata?.hasProductSignals) {
      throw new UserFacingError("No product details were detected on this page.");
    }
    const pageMetadata = { ...extractedMetadata };
    delete pageMetadata.hasProductSignals;

    const capture = await apiRequest("/product-captures", {
      method: "POST",
      body: {
        captureSource: "browser_extension",
        url: tab.url,
        rawText: pageMetadata.title,
        pageMetadata,
        country: String(CONFIG.country || "US"),
        preferredCurrency: String(CONFIG.currency || "USD").toUpperCase(),
      },
    });

    if (!capture?.normalizedProduct || capture.status === "failed") {
      throw new UserFacingError(
        capture?.failureReason || "DealDrop couldn't identify this product.",
      );
    }

    state.capture = capture;
    renderReview(capture);
    showSection("review-state");
  } catch (error) {
    showError(
      "Product not detected",
      error instanceof UserFacingError
        ? error.message
        : "This page does not allow safe capture. Open a public product page and try again.",
    );
  } finally {
    state.busy = false;
  }
}

function renderReview(capture) {
  const product = capture.normalizedProduct;
  const title = product?.title || "Product details";
  const imageUrl = product?.imageUrls?.find(isHttpUrl) || null;
  const source = [product?.merchant, product?.sourceDomain].filter(Boolean).join(" · ");

  byId("product-title").value = title;
  byId("product-source").textContent = source || "Source details unavailable";
  byId("product-price").textContent =
    product?.price === null || product?.price === undefined
      ? ""
      : formatPrice(product.price, product.currency);
  byId("product-price").hidden = product?.price === null || product?.price === undefined;
  byId("review-message").hidden = true;

  const image = byId("product-image");
  image.onerror = () => {
    image.hidden = true;
  };
  image.src = imageUrl || "";
  image.alt = title;
  image.hidden = !imageUrl;
  byId("target-price").value = "";
}

async function saveTracking() {
  if (!state.capture?.normalizedProduct || state.busy) return;
  const product = state.capture.normalizedProduct;
  const title = byId("product-title").value.trim();
  const targetText = byId("target-price").value.trim();
  const targetPrice = targetText ? Number(targetText) : null;
  const message = byId("review-message");

  message.hidden = true;
  if (!title) {
    message.textContent = "Add a product name before saving.";
    message.hidden = false;
    return;
  }
  if (targetText && (!Number.isFinite(targetPrice) || targetPrice < 0)) {
    message.textContent = "Enter a valid target price or leave it blank.";
    message.hidden = false;
    return;
  }

  state.busy = true;
  const button = byId("save-button");
  button.disabled = true;
  button.textContent = "Saving…";

  try {
    const identifiers = (product.identifiers || [])
      .map((identifier) => identifier.value)
      .filter((value) => typeof value === "string" && value.trim())
      .slice(0, 20);
    const filters = {
      ...(identifiers.length ? { aliases: identifiers } : {}),
      ...(targetPrice !== null
        ? {
            price: {
              max: targetPrice,
              currency: product.currency || String(CONFIG.currency || "USD").toUpperCase(),
            },
          }
        : {}),
    };
    const tracked = await apiRequest("/watchlists", {
      method: "POST",
      body: {
        name: title.slice(0, 120),
        searchQuery: title.slice(0, 200),
        filters,
        alertMode: "instant",
        marketplaceScope: "all",
        isActive: true,
        isFavorite: false,
      },
    });
    byId("success-title").textContent = tracked?.name
      ? `${tracked.name} is being tracked`
      : "Product saved";
    showSection("success-state");
  } catch (error) {
    message.textContent =
      error instanceof Error ? error.message : "DealDrop couldn't save this product.";
    message.hidden = false;
  } finally {
    state.busy = false;
    button.disabled = false;
    button.textContent = "Save to DealDrop";
  }
}

function resetToReady() {
  state.capture = null;
  state.pageUrl = null;
  byId("target-price").value = "";
  showSection("ready-state");
}

function showError(title, message) {
  byId("error-title").textContent = title;
  byId("error-message").textContent = message;
  byId("error-sign-out-button").hidden = !state.session;
  showSection("error-state");
}

function showSection(sectionId) {
  sections.forEach((id) => {
    byId(id).hidden = id !== sectionId;
  });
}

function openCapturedProduct() {
  const url = state.capture?.normalizedProduct?.canonicalUrl || state.pageUrl;
  if (!isHttpUrl(url)) {
    showError("Product link unavailable", "This product does not have a safe link to open.");
    return;
  }

  const template = String(CONFIG.openProductUrlTemplate || "dealdrop://paste-product?url={url}");
  const destination = template.includes("{url}")
    ? template.replace("{url}", encodeURIComponent(url))
    : template;
  void chrome.tabs.create({ url: destination });
}

function openDealDrop() {
  const destination = String(CONFIG.openAppUrl || "dealdrop://");
  void chrome.tabs.create({ url: destination });
}

function isHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

function formatPrice(price, currency) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `${currency || ""} ${Number(price).toFixed(2)}`.trim();
  }
}

function extractProductMetadataFromPage() {
  const text = (value) =>
    typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  const safeUrl = (value) => {
    const candidate = text(value);
    if (!candidate) return null;
    try {
      const parsed = new URL(candidate, location.href);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return null;
    }
  };
  const meta = (key) => {
    const element = document.querySelector(`meta[property="${key}"], meta[name="${key}"]`);
    return text(element?.getAttribute("content"));
  };
  const asObject = (value) =>
    value && typeof value === "object" && !Array.isArray(value) ? value : null;
  const asArray = (value) =>
    value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
  const firstObject = (value) => asArray(value).map(asObject).find(Boolean) || null;
  const hasType = (value, type) =>
    asArray(value?.["@type"]).some(
      (item) => text(item).split("/").pop()?.toLowerCase() === type.toLowerCase(),
    );
  const nodes = [];

  document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
    try {
      const collect = (value) => {
        if (Array.isArray(value)) return value.forEach(collect);
        const object = asObject(value);
        if (!object) return;
        nodes.push(object);
        if (object["@graph"]) collect(object["@graph"]);
      };
      collect(JSON.parse(script.textContent || ""));
    } catch {
      // Ignore malformed JSON-LD and use the page's Open Graph metadata.
    }
  });

  const product = nodes.find((node) => hasType(node, "Product")) || null;
  const offer = firstObject(product?.offers);
  const seller = firstObject(offer?.seller);
  const additionalProperties = asArray(product?.additionalProperty).map(asObject).filter(Boolean);
  const variant =
    text(product?.variant) ||
    text(product?.color) ||
    text(additionalProperties.find((item) => text(item.name).toLowerCase() === "variant")?.value);
  const identifiers = [];
  const addIdentifier = (type, value) => {
    const normalized = text(value);
    if (
      normalized &&
      !identifiers.some(
        (item) => item.type === type && item.value.toLowerCase() === normalized.toLowerCase(),
      )
    ) {
      identifiers.push({ type, value: normalized });
    }
  };
  addIdentifier("sku", product?.sku);
  addIdentifier("mpn", product?.mpn);
  addIdentifier("isbn", product?.isbn);
  addIdentifier("gtin", product?.gtin8);
  addIdentifier("upc", product?.gtin12);
  addIdentifier("ean", product?.gtin13);
  addIdentifier("gtin", product?.gtin14);
  addIdentifier("gtin", product?.gtin);
  addIdentifier("sku", meta("product:retailer_item_id"));
  const asin = location.pathname.match(
    /(?:^|\/(?:dp|gp\/product|product)\/)([A-Z0-9]{10})(?:[/?]|$)/i,
  )?.[1];
  addIdentifier("asin", asin);

  const images = [];
  const addImage = (value) => {
    const image = safeUrl(value);
    if (image && !images.includes(image)) images.push(image);
  };
  asArray(product?.image).forEach(addImage);
  addImage(meta("og:image"));
  addImage(meta("twitter:image"));

  const canonicalLink = document.querySelector('link[rel~="canonical"]')?.getAttribute("href");
  const canonicalUrl = safeUrl(canonicalLink) || safeUrl(meta("og:url")) || safeUrl(location.href);
  const title = text(product?.name) || meta("og:title") || text(document.title) || null;
  const priceValue = text(offer?.price) || meta("product:price:amount");
  const parsedPrice = priceValue ? Number(priceValue.replace(/[^0-9.-]/g, "")) : null;
  const price = Number.isFinite(parsedPrice) && parsedPrice >= 0 ? parsedPrice : null;
  const currency = (
    text(offer?.priceCurrency) ||
    meta("product:price:currency") ||
    ""
  ).toUpperCase();
  const condition =
    text(product?.itemCondition)
      .split("/")
      .pop()
      ?.replace(/Condition$/i, "") || null;

  return {
    hasProductSignals: Boolean(
      product ||
      price !== null ||
      identifiers.length ||
      meta("product:price:amount") ||
      meta("og:type").toLowerCase() === "product",
    ),
    title,
    canonicalUrl,
    imageUrls: images.slice(0, 8),
    price,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : null,
    identifiers: identifiers.slice(0, 20),
    variant: variant || null,
    condition: condition?.trim().toLowerCase() || null,
    merchant: text(seller?.name) || meta("og:site_name") || null,
  };
}

init();
