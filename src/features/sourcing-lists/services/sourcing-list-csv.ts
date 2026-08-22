import type {
  ApiMarketplace,
  ApiSourcingList,
  ApiSourcingListProduct,
  ApiSourcingListProductInput,
  MarketplaceSource,
} from "@/services/api";

export const SOURCING_LIST_CSV_HEADERS = [
  "product name",
  "SKU",
  "UPC",
  "GTIN",
  "MPN",
  "quantity required",
  "target unit price",
  "max unit cost currency",
  "keywords",
  "category",
  "notes",
  "marketplaces",
  "preferred condition",
  "required by",
] as const;

export const MAX_SOURCING_CSV_ROWS = 1_000;

export interface SourcingCsvDraft {
  productName: string;
  sku: string;
  upc: string;
  gtin: string;
  mpn: string;
  quantityRequired: string;
  targetUnitPrice: string;
  maxUnitCostCurrency: string;
  keywords: string;
  category: string;
  notes: string;
  marketplaces: string;
  preferredCondition: string;
  requiredBy: string;
}

export type SourcingCsvRowStatus = "valid" | "invalid" | "duplicate";

export interface SourcingCsvRow {
  rowNumber: number;
  draft: SourcingCsvDraft;
  status: SourcingCsvRowStatus;
  reasons: string[];
  included: boolean;
  input: ApiSourcingListProductInput | null;
}

export interface SourcingCsvReport {
  fileFingerprint: string;
  headerErrors: string[];
  rows: SourcingCsvRow[];
}

export interface SourcingCsvValidationOptions {
  marketplaces: readonly Pick<ApiMarketplace, "source">[];
  existingProducts: readonly ApiSourcingListProduct[];
  defaultCurrency: string;
}

type DraftField = keyof SourcingCsvDraft;

const HEADER_ALIASES: Record<string, DraftField> = {
  "product name": "productName",
  product: "productName",
  name: "productName",
  sku: "sku",
  "internal reference": "sku",
  "internal ref": "sku",
  "sku internal ref": "sku",
  upc: "upc",
  gtin: "gtin",
  ean: "gtin",
  mpn: "mpn",
  "part number": "mpn",
  "quantity required": "quantityRequired",
  quantity: "quantityRequired",
  "target quantity": "quantityRequired",
  "target qty": "quantityRequired",
  "target unit price": "targetUnitPrice",
  "target price": "targetUnitPrice",
  "max unit cost": "targetUnitPrice",
  "max unit price": "targetUnitPrice",
  "unit price": "targetUnitPrice",
  "max unit cost currency": "maxUnitCostCurrency",
  currency: "maxUnitCostCurrency",
  keywords: "keywords",
  "search keywords": "keywords",
  category: "category",
  notes: "notes",
  marketplaces: "marketplaces",
  marketplace: "marketplaces",
  sources: "marketplaces",
  source: "marketplaces",
  "preferred condition": "preferredCondition",
  condition: "preferredCondition",
  "required by": "requiredBy",
  "required by date": "requiredBy",
};

export async function parseSourcingListCsv(
  csv: string,
  options: SourcingCsvValidationOptions,
): Promise<SourcingCsvReport> {
  const records = await parseCsvRecords(csv);
  if (records.length === 0) {
    return {
      fileFingerprint: fingerprintCsv(csv),
      headerErrors: ["The CSV file is empty."],
      rows: [],
    };
  }

  const { fields, headerErrors } = resolveHeaderFields(records[0] ?? []);
  const drafts = records.slice(1).map((record) => draftFromRecord(record, fields));
  const rowLimitError =
    drafts.length > MAX_SOURCING_CSV_ROWS
      ? `Only the first ${MAX_SOURCING_CSV_ROWS.toLocaleString()} rows can be reviewed at once.`
      : null;
  const report = buildSourcingCsvReport(
    drafts.slice(0, MAX_SOURCING_CSV_ROWS),
    options,
    fingerprintCsv(csv),
  );
  return {
    ...report,
    headerErrors: rowLimitError ? [...headerErrors, rowLimitError] : headerErrors,
  };
}

export function buildSourcingCsvReport(
  drafts: readonly SourcingCsvDraft[],
  options: SourcingCsvValidationOptions,
  fileFingerprint: string,
  previousIncluded?: ReadonlyMap<number, boolean>,
): SourcingCsvReport {
  const existingKeys = new Set(options.existingProducts.map(productIdentityKey));
  const seenKeys = new Set<string>();
  const rows = drafts.map((draft, index) => {
    const rowNumber = index + 2;
    const validation = validateDraft(draft, options);
    let status: SourcingCsvRowStatus = validation.input ? "valid" : "invalid";
    let reasons = validation.reasons;

    if (validation.input) {
      const identityKey = productIdentityKey(validation.input);
      if (existingKeys.has(identityKey)) {
        status = "duplicate";
        reasons = ["This product already exists in the sourcing list."];
      } else if (seenKeys.has(identityKey)) {
        status = "duplicate";
        reasons = ["This row duplicates another row in the file."];
      }
      seenKeys.add(identityKey);
    }

    const defaultIncluded = status === "valid";
    const included = validation.input
      ? (previousIncluded?.get(rowNumber) ?? defaultIncluded)
      : false;

    return {
      rowNumber,
      draft,
      status,
      reasons,
      included,
      input: validation.input,
    } satisfies SourcingCsvRow;
  });

  return { fileFingerprint, headerErrors: [], rows };
}

export function createSourcingListCsv(list: ApiSourcingList): string {
  const rows = list.products.map((product) => [
    product.productName,
    product.sku ?? "",
    product.upc ?? "",
    product.gtin ?? "",
    product.mpn ?? "",
    String(product.targetQuantity),
    product.maxUnitCost === null ? "" : String(product.maxUnitCost),
    product.maxUnitCostCurrency ?? "",
    product.keywords.join("|"),
    product.category,
    product.notes ?? "",
    product.marketplaceIds.join("|"),
    product.preferredCondition ?? "",
    product.requiredBy ?? "",
  ]);
  return serializeCsv([SOURCING_LIST_CSV_HEADERS, ...rows]);
}

export function createSourcingListCsvTemplate(
  marketplaces: readonly Pick<ApiMarketplace, "source">[],
): string {
  const exampleSource = marketplaces[0]?.source ?? "ebay";
  return serializeCsv([
    SOURCING_LIST_CSV_HEADERS,
    [
      "Example camera tripod",
      "TRIPOD-001",
      "",
      "",
      "",
      "25",
      "75",
      "USD",
      "camera|tripod|aluminum",
      "Cameras",
      "Include a carrying case if available.",
      exampleSource,
      "New",
      "2026-12-01",
    ],
  ]);
}

export function fingerprintCsv(csv: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < csv.length; index += 1) {
    hash ^= csv.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `${csv.length}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function validateDraft(
  draft: SourcingCsvDraft,
  options: SourcingCsvValidationOptions,
): { input: ApiSourcingListProductInput | null; reasons: string[] } {
  const reasons: string[] = [];
  const productName = draft.productName.trim();
  if (!productName) reasons.push("Product name is required.");
  if (productName.length > 200) reasons.push("Product name must be 200 characters or fewer.");

  const category = draft.category.trim() || "Other";
  if (category.length > 80) reasons.push("Category must be 80 characters or fewer.");

  const targetQuantity = Number(draft.quantityRequired.trim());
  if (!/^\d+$/.test(draft.quantityRequired.trim()) || targetQuantity < 1) {
    reasons.push("Quantity required must be a whole number greater than zero.");
  }

  const priceText = draft.targetUnitPrice.trim();
  const maxUnitCost = priceText === "" ? null : Number(priceText);
  if (
    priceText !== "" &&
    (maxUnitCost === null || !Number.isFinite(maxUnitCost) || maxUnitCost < 0)
  ) {
    reasons.push("Target unit price must be a non-negative number.");
  }

  const availableSources = new Set(options.marketplaces.map((marketplace) => marketplace.source));
  const marketplaceIds = draft.marketplaces.trim()
    ? parseMarketplaceIds(draft.marketplaces, availableSources)
    : [...availableSources];
  if (marketplaceIds.length === 0) {
    reasons.push(
      availableSources.size === 0
        ? "No marketplace sources are enabled."
        : "At least one marketplace source is required.",
    );
  }
  const unknownSources = parseMarketplaceTokens(draft.marketplaces).filter(
    (source) => !availableSources.has(source as MarketplaceSource),
  );
  if (unknownSources.length > 0) {
    reasons.push(`Unknown marketplace source: ${unknownSources.join(", ")}.`);
  }

  const requiredBy = draft.requiredBy.trim();
  if (requiredBy && (!/^\d{4}-\d{2}-\d{2}$/.test(requiredBy) || !isValidDate(requiredBy))) {
    reasons.push("Required by must use YYYY-MM-DD.");
  }

  const currency = draft.maxUnitCostCurrency.trim().toUpperCase() || options.defaultCurrency;
  if (maxUnitCost !== null && !/^[A-Z]{3}$/.test(currency)) {
    reasons.push("Currency must be a 3-letter code.");
  }

  const keywords = splitList(draft.keywords);
  if (keywords.length > 20) reasons.push("Use no more than 20 keywords.");
  if (keywords.some((keyword) => keyword.length > 100)) {
    reasons.push("Each keyword must be 100 characters or fewer.");
  }
  if (draft.notes.length > 2_000) reasons.push("Notes must be 2,000 characters or fewer.");

  if (reasons.length > 0) {
    return { input: null, reasons };
  }

  return {
    input: {
      category,
      productName,
      sku: optionalText(draft.sku),
      upc: optionalText(draft.upc),
      gtin: optionalText(draft.gtin),
      mpn: optionalText(draft.mpn),
      keywords,
      targetQuantity,
      maxUnitCost,
      maxUnitCostCurrency: maxUnitCost === null ? null : currency,
      preferredCondition: optionalText(draft.preferredCondition),
      marketplaceIds,
      notes: optionalText(draft.notes),
      requiredBy: requiredBy || null,
    },
    reasons: [],
  };
}

function resolveHeaderFields(headers: readonly string[]) {
  const fields = headers.map((header) => HEADER_ALIASES[normalizeHeader(header)] ?? null);
  const headerErrors: string[] = [];
  if (!fields.includes("productName")) headerErrors.push("A product name column is required.");
  if (!fields.includes("quantityRequired")) {
    headerErrors.push("A quantity required column is required.");
  }
  return { fields, headerErrors };
}

function draftFromRecord(record: readonly string[], fields: readonly (DraftField | null)[]) {
  const draft = emptyDraft();
  fields.forEach((field, index) => {
    if (field) draft[field] = record[index]?.trim() ?? "";
  });
  return draft;
}

function emptyDraft(): SourcingCsvDraft {
  return {
    productName: "",
    sku: "",
    upc: "",
    gtin: "",
    mpn: "",
    quantityRequired: "",
    targetUnitPrice: "",
    maxUnitCostCurrency: "",
    keywords: "",
    category: "",
    notes: "",
    marketplaces: "",
    preferredCondition: "",
    requiredBy: "",
  };
}

function parseMarketplaceTokens(value: string) {
  return value
    .split(/[|;,]/)
    .map((source) => source.trim().toLowerCase().replace(/\s+/g, "_"))
    .filter(Boolean);
}

function parseMarketplaceIds(value: string, availableSources: ReadonlySet<string>) {
  return [...new Set(parseMarketplaceTokens(value))].filter((source): source is MarketplaceSource =>
    availableSources.has(source),
  );
}

function splitList(value: string) {
  return [
    ...new Set(
      value
        .split(/[|;]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function productIdentityKey(product: ApiSourcingListProduct | ApiSourcingListProductInput) {
  const identifier = product.sku || product.upc || product.gtin || product.mpn;
  if (identifier) return `identifier:${identifier.trim().toLowerCase()}`;
  return `name:${product.productName.trim().toLowerCase()}|category:${product.category.trim().toLowerCase()}`;
}

function normalizeHeader(header: string) {
  return header
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function isValidDate(value: string) {
  return !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

async function parseCsvRecords(csv: string): Promise<string[][]> {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (inQuotes && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && character === ",") {
      record.push(field);
      field = "";
    } else if (!inQuotes && (character === "\n" || character === "\r")) {
      record.push(field);
      field = "";
      if (record.some((value) => value.trim() !== "")) records.push(record);
      record = [];
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
    } else {
      field += character;
    }

    if (index > 0 && index % 8_192 === 0) await yieldToUi();
  }

  if (field !== "" || record.length > 0) {
    record.push(field);
    if (record.some((value) => value.trim() !== "")) records.push(record);
  }
  return records;
}

function serializeCsv(rows: readonly (readonly string[])[]) {
  return rows
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n")
    .concat("\r\n");
}

function escapeCsvCell(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function yieldToUi() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}
