import assert from "node:assert/strict";
import test from "node:test";

import {
  barcodeFormatLabel,
  normalizeScannedBarcode,
  SCANNABLE_BARCODE_TYPES,
} from "./barcode.service";

test("accepts common retail barcode formats", () => {
  assert.deepEqual(normalizeScannedBarcode("012345678905", "upc_a"), {
    value: "012345678905",
    format: "upc_a",
  });
  assert.deepEqual(normalizeScannedBarcode("0123456789012", "ean13"), {
    value: "0123456789012",
    format: "ean13",
  });
  assert.deepEqual(normalizeScannedBarcode("00012345600012", "itf14"), {
    value: "00012345600012",
    format: "itf14",
  });
  assert.deepEqual(SCANNABLE_BARCODE_TYPES, ["ean13", "ean8", "upc_a", "upc_e", "itf14"]);
});

test("rejects malformed scan data without inventing an identifier", () => {
  assert.equal(normalizeScannedBarcode("camera-label", "upc_a"), null);
  assert.equal(normalizeScannedBarcode("012345678905", "ean13"), null);
  assert.equal(normalizeScannedBarcode("012345678905", "code128"), null);
  assert.equal(barcodeFormatLabel("itf14"), "ITF-14 / GTIN-14");
});
