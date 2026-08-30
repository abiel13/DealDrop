import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { config as loadEnvironment } from "dotenv";

loadEnvironment({ path: path.resolve("server/.env"), quiet: true });

const sourceDirectory = path.resolve("extension");
const outputDirectory = path.resolve("dist/extension");
const releaseFiles = [
  "manifest.json",
  "popup.html",
  "popup.css",
  "popup.js",
  "config.js",
  "README.md",
];

const manifest = JSON.parse(await readFile(path.join(sourceDirectory, "manifest.json"), "utf8"));
const configSource = await readFile(path.join(sourceDirectory, "config.js"), "utf8");
const issues = validateManifest(manifest).concat(
  validatePublicConfig(configSource),
  validateAllowedOrigin(process.env.SERVER_ALLOWED_ORIGINS),
);

if (issues.length > 0) {
  console.error("Extension production build check failed:");
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  await rm(outputDirectory, { force: true, recursive: true });
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all(
    releaseFiles.map((file) =>
      cp(path.join(sourceDirectory, file), path.join(outputDirectory, file)),
    ),
  );
  console.log(
    `Extension ${manifest.version} staged in dist/extension (${releaseFiles.length} files).`,
  );
}

function validateManifest(manifestValue) {
  const issues = [];
  if (manifestValue.manifest_version !== 3) issues.push("manifest_version must be 3.");
  if (!/^\d+\.\d+\.\d+$/.test(String(manifestValue.version ?? ""))) {
    issues.push("manifest version must use numeric major.minor.patch format.");
  }
  if (
    !Array.isArray(manifestValue.permissions) ||
    !manifestValue.permissions.includes("activeTab")
  ) {
    issues.push("the extension must retain explicit activeTab access.");
  }
  return issues;
}

function validatePublicConfig(source) {
  const issues = [];
  const apiBaseUrl = configString(source, "apiBaseUrl");
  const supabaseUrl = configString(source, "supabaseUrl");
  const supabaseAnonKey = configString(source, "supabaseAnonKey");
  const country = configString(source, "country");
  const currency = configString(source, "currency");

  if (!isProductionHttpsUrl(apiBaseUrl) || !apiBaseUrl.endsWith("/api/v1")) {
    issues.push("apiBaseUrl must be the deployed HTTPS DealDrop /api/v1 endpoint.");
  }
  if (!isProductionHttpsUrl(supabaseUrl)) {
    issues.push("supabaseUrl must be the deployed HTTPS Supabase endpoint.");
  }
  if (!supabaseAnonKey || supabaseAnonKey.length < 20 || isPlaceholder(supabaseAnonKey)) {
    issues.push("supabaseAnonKey must contain the public anon key, not a placeholder.");
  }
  if (!/^[A-Z]{2}$/.test(country)) issues.push("country must be a two-letter code.");
  if (!/^[A-Z]{3}$/.test(currency)) issues.push("currency must be a three-letter code.");
  return issues;
}

function validateAllowedOrigin(value) {
  const origins = String(value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.some((origin) => /^chrome-extension:\/\/[a-p]{32}$/.test(origin))
    ? []
    : ["SERVER_ALLOWED_ORIGINS must include the exact published chrome-extension origin."];
}

function configString(source, key) {
  const match = source.match(new RegExp(`${key}\\s*:\\s*["']([^"']*)["']`));
  return match?.[1]?.trim() ?? "";
}

function isProductionHttpsUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname !== "localhost" &&
      !url.hostname.endsWith(".example.com") &&
      !url.hostname.endsWith(".test")
    );
  } catch {
    return false;
  }
}

function isPlaceholder(value) {
  return /^(your_|replace_|placeholder|example)/i.test(value);
}
