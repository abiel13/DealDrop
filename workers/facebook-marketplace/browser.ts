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

async function loginFormVisible(page: Page) {
  return (
    /\/login(?:\/|$)/i.test(page.url()) ||
    (await page
      .locator('input[name="email"]')
      .first()
      .isVisible()
      .catch(() => false))
  );
}

export async function ensureAuthenticated(page: Page, config: FacebookWorkerConfig) {
  if (!(await loginFormVisible(page))) {
    return false;
  }

  if (!config.facebookEmail || !config.facebookPassword) {
    throw new FacebookAuthenticationError(
      "Facebook requires authentication. Provide FACEBOOK_STORAGE_STATE_PATH or both FACEBOOK_EMAIL and FACEBOOK_PASSWORD.",
    );
  }

  await page.goto(config.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: config.requestTimeoutMs,
  });
  await page.locator('input[name="email"]').fill(config.facebookEmail);
  await page.locator('input[name="pass"]').fill(config.facebookPassword);
  await page.locator('button[name="login"], button[type="submit"]').first().click();
  await page
    .waitForLoadState("domcontentloaded", { timeout: config.requestTimeoutMs })
    .catch(() => undefined);

  if ((await loginFormVisible(page)) || /checkpoint|challenge/i.test(page.url())) {
    throw new FacebookAuthenticationError(
      "Facebook login did not complete. A checkpoint, challenge, or additional verification may be required.",
    );
  }

  if (config.facebookStorageStatePath) {
    mkdirSync(dirname(config.facebookStorageStatePath), { recursive: true });
    await page.context().storageState({ path: config.facebookStorageStatePath });
  }

  return true;
}
