// Copy this file to config.js before loading the extension.
// These are public client values. Never place a Supabase service-role key,
// marketplace credential, or other privileged DealDrop secret here.
globalThis.DEALDROP_EXTENSION_CONFIG = Object.freeze({
  apiBaseUrl: "https://api.example.com/api/v1",
  supabaseUrl: "https://your-project.supabase.co",
  supabaseAnonKey: "your_public_supabase_anon_key",
  country: "US",
  currency: "USD",
  // The native app registers the dealdrop:// scheme. Replace this with a
  // reviewed web handoff when a DealDrop web app is available.
  openProductUrlTemplate: "dealdrop://paste-product?url={url}",
  openAppUrl: "dealdrop://",
});
