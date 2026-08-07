import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import type { FacebookWorkerConfig } from "./config";
import { FacebookAuthenticationError } from "./errors";

export interface FacebookBrowserSession {
  browser: Browser;
  context: BrowserContext;
}

export async function createBrowserSession(config: FacebookWorkerConfig) {
  const browser = await chromium.launch({ headless: config.headless });
  const storageState =
    config.facebookStorageStatePath && existsSync(config.facebookStorageStatePath)
      ? config.facebookStorageStatePath
      : undefined;
  const context = await browser.newContext({ storageState });

  return { browser, context } satisfies FacebookBrowserSession;
}

const AUTH_BLOCK_PATTERN = /captcha|checkpoint|challenge|security check|confirm your identity/i;

export async function getFacebookAuthBlock(page: Page) {
  if (AUTH_BLOCK_PATTERN.test(page.url())) {
    return "Facebook presented a CAPTCHA, checkpoint, or security challenge.";
  }

  const bodyText = await page
    .locator("body")
    .innerText({ timeout: 1000 })
    .catch(() => "");

  return AUTH_BLOCK_PATTERN.test(bodyText)
    ? "Facebook presented a CAPTCHA, checkpoint, or security challenge."
    : null;
}

async function loginFormVisible(page: Page) {
  return (
    /\/login(?:\/|$)/i.test(page.url()) ||
    (await page
      .locator('input[name="email"]')
      .first()
      .isVisible()
      .catch(() => false)) ||
    (await page
      .getByRole("button", { name: /log\s*in/i })
      .first()
      .isVisible()
      .catch(() => false))
  );
}

export async function ensureAuthenticated(page: Page, config: FacebookWorkerConfig) {
  const authBlock = await getFacebookAuthBlock(page);
  if (authBlock && config.facebookAuthMode !== "interactive") {
    throw new FacebookAuthenticationError(authBlock);
  }

  if (!(await loginFormVisible(page))) {
    return false;
  }

  if (config.facebookAuthMode === "storage") {
    throw new FacebookAuthenticationError(
      "Facebook storage state is missing or expired. Run the interactive auth bootstrap once, then restart the worker.",
    );
  }

  await page.goto(config.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: config.requestTimeoutMs,
  });

  if (config.facebookAuthMode === "interactive") {
    await waitForAuthentication(page, config);
  } else {
    await page.locator('input[name="email"]').fill(config.facebookEmail!);
    await page.locator('input[name="pass"]').fill(config.facebookPassword!);

    const submit = page.locator(
      'button[name="login"], button[type="submit"], input[type="submit"]',
    );
    if (
      await submit
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await submit.first().click();
    } else {
      await page.locator('input[name="pass"]').press("Enter");
    }

    await waitForAuthentication(page, config);
  }

  if (config.facebookStorageStatePath) {
    mkdirSync(dirname(config.facebookStorageStatePath), { recursive: true });
    await page.context().storageState({ path: config.facebookStorageStatePath });
  }

  return true;
}

async function waitForAuthentication(page: Page, config: FacebookWorkerConfig) {
  const deadline = Date.now() + config.authTimeoutMs;

  while (Date.now() < deadline) {
    const authBlock = await getFacebookAuthBlock(page);
    if (authBlock && config.facebookAuthMode !== "interactive") {
      throw new FacebookAuthenticationError(authBlock);
    }

    const cookies = await page.context().cookies();
    if (cookies.some((cookie) => cookie.name === "c_user")) {
      return;
    }

    await page.waitForTimeout(500);
  }

  throw new FacebookAuthenticationError(
    `Facebook authentication did not complete within ${Math.round(config.authTimeoutMs / 1000)} seconds.`,
  );
}
