# DealDrop Chromium extension MVP

This directory contains the lightweight Chrome/Chromium Manifest V3 extension for capturing the active product page. It uses `activeTab` and `scripting`, so it only reads the page after the user clicks **Capture current page**. It does not run a persistent content script or access pages in the background.

## Configure locally

1. Copy `config.example.js` to `config.js`.
2. Set the public DealDrop API URL, Supabase project URL, and Supabase anon key.
3. Set `openProductUrlTemplate` to the reviewed DealDrop handoff URL. The default uses the native `dealdrop://` scheme.
4. Add the exact extension origin to the API server's allowed origins:

   ```env
   SERVER_ALLOWED_ORIGINS=chrome-extension://<32-character-extension-id>
   ```

   Chrome shows the extension ID at `chrome://extensions` after loading it. Do not use a wildcard origin.

The Supabase anon key is a public client key. Never put `SUPABASE_SERVICE_ROLE_KEY`, marketplace credentials, RevenueCat server keys, or any other privileged secret in `config.js` or the extension bundle.

## Load and test

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this `extension/` directory.
3. Open a public product page on an `http` or `https` URL.
4. Open the DealDrop extension, sign in with an existing DealDrop account, and choose **Capture current page**.
5. Confirm the detected title and optional target price, then choose **Save to DealDrop**.

Chrome internal pages, file URLs, private pages, and pages without useful product metadata are reported as unsupported. The extension sends only bounded page metadata and the active URL through `/api/v1/product-captures`; the API remains responsible for authentication, validation, normalization, and watchlist creation.

## Release checklist

1. Bump `version` in `manifest.json`.
2. Create the production `config.js` from `config.example.js` using public deployment values. Keep it out of source control.
3. Confirm the production API allows the exact published `chrome-extension://<extension-id>` origin.
4. Test sign-in, capture, target-price save, save-without-target, unsupported-page handling, token refresh, and **Open in DealDrop**.
5. Zip the extension directory with `manifest.json`, `popup.html`, `popup.css`, `popup.js`, and the configured `config.js` for the Chrome Web Store submission. Do not include repository files or server credentials.

The extension uses the same Supabase email/password session and DealDrop bearer API as the mobile client. Access and refresh tokens are stored in extension-scoped `chrome.storage.local`; passwords are never stored. A user must sign in again if the refresh session is revoked.
