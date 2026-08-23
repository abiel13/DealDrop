import assert from "node:assert/strict";
import test from "node:test";

import type { ApiSourcingList } from "@/services/api";

import {
  buildSourcingCsvReport,
  createSourcingListCsv,
  createSourcingListCsvTemplate,
  fingerprintCsv,
  parseSourcingListCsv,
  type SourcingCsvDraft,
} from "./sourcing-list-csv";

const options = {
  marketplaces: [{ source: "ebay" as const }],
  existingProducts: [],
  defaultCurrency: "USD",
};

test("parses quoted CSV cells and reports invalid and duplicate rows", async () => {
  const report = await parseSourcingListCsv(
    [
      "product name,SKU,quantity required,target unit price,keywords,category,marketplaces,notes",
      '"Camera, tripod",TRIPOD-1,10,25,"tripod|camera",Cameras,ebay,"Include a case"',
      "Missing quantity,TRIPOD-2,,25,,Cameras,ebay,",
      '"Camera, tripod",TRIPOD-1,10,25,"tripod|camera",Cameras,ebay,"Duplicate"',
    ].join("\r\n"),
    options,
  );

  assert.deepEqual(report.headerErrors, []);
  assert.equal(report.rows[0]?.status, "valid");
  assert.equal(report.rows[0]?.input?.productName, "Camera, tripod");
  assert.equal(report.rows[1]?.status, "invalid");
  assert.match(report.rows[1]?.reasons[0] ?? "", /quantity required/i);
  assert.equal(report.rows[2]?.status, "duplicate");
  assert.equal(report.rows[2]?.included, false);
});

test("defaults blank marketplace cells to enabled sources and supports row correction", () => {
  const draft: SourcingCsvDraft = {
    productName: "Tripod",
    sku: "TRIPOD-1",
    upc: "",
    gtin: "",
    mpn: "",
    quantityRequired: "",
    targetUnitPrice: "25",
    maxUnitCostCurrency: "",
    keywords: "camera|tripod",
    category: "Cameras",
    notes: "",
    marketplaces: "",
    preferredCondition: "New",
    requiredBy: "",
  };
  const invalid = buildSourcingCsvReport([draft], options, "10-deadbeef");
  assert.equal(invalid.rows[0]?.status, "invalid");

  const corrected = buildSourcingCsvReport(
    [{ ...draft, quantityRequired: "4" }],
    options,
    "10-deadbeef",
  );
  assert.equal(corrected.rows[0]?.status, "valid");
  assert.deepEqual(corrected.rows[0]?.input?.marketplaceIds, ["ebay"]);
});

test("exports a sourcing list and a reusable CSV template", () => {
  const list: ApiSourcingList = {
    id: "list-1",
    workspaceId: "workspace-1",
    name: "Camera restock",
    status: "active",
    products: [
      {
        id: "product-1",
        category: "Cameras",
        productName: "Camera, tripod",
        sku: "TRIPOD-1",
        upc: null,
        gtin: null,
        mpn: null,
        keywords: ["camera", "tripod"],
        targetQuantity: 4,
        sourcedQuantity: 0,
        targetUnitCost: null,
        targetUnitCostCurrency: null,
        maxUnitCost: 25,
        maxUnitCostCurrency: "USD",
        estimatedShippingCost: null,
        estimatedShippingCurrency: null,
        estimatedDutiesTaxes: null,
        estimatedDutiesTaxesCurrency: null,
        otherSourcingCost: null,
        otherSourcingCostCurrency: null,
        desiredRetailPrice: null,
        desiredRetailPriceCurrency: null,
        minimumDesiredMarginPercent: null,
        maxLandedUnitCost: null,
        maxLandedUnitCostCurrency: null,
        alertCostBasis: "marketplace_price",
        alertEnabled: true,
        alertTargetPriceReached: true,
        alertNewCheaperSource: true,
        alertPriceDropped: true,
        alertQuantityAvailable: true,
        alertBackInStock: true,
        alertCooldownMinutes: 1440,
        preferredCondition: "New",
        marketplaceIds: ["ebay"],
        notes: "Include a case",
        requiredBy: null,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    ],
    progress: {
      totalProducts: 1,
      completedProducts: 0,
      targetQuantity: 4,
      sourcedQuantity: 0,
      percentComplete: 0,
    },
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
  const exported = createSourcingListCsv(list);
  const template = createSourcingListCsvTemplate(options.marketplaces);

  assert.match(exported, /"Camera, tripod"/);
  assert.match(exported, /TRIPOD-1/);
  assert.match(template, /product name,SKU,UPC/);
  assert.match(template, /Example camera tripod/);
  assert.equal(fingerprintCsv(exported), fingerprintCsv(exported));
  assert.notEqual(fingerprintCsv(exported), fingerprintCsv(template));
});
