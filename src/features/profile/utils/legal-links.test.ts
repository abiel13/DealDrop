import assert from "node:assert/strict";
import test from "node:test";

import { getAccountLinks, getLegalConfigurationIssues } from "./legal-links";

test("accepts reviewed HTTPS legal destinations and a support mailto link", () => {
  const environment = {
    EXPO_PUBLIC_PRIVACY_POLICY_URL: "https://legal.example.com/privacy",
    EXPO_PUBLIC_TERMS_URL: "https://legal.example.com/terms",
    EXPO_PUBLIC_SUPPORT_URL: "mailto:support@example.com",
  };

  assert.deepEqual(getLegalConfigurationIssues(environment), []);
  assert.deepEqual(getAccountLinks(environment), {
    privacy: environment.EXPO_PUBLIC_PRIVACY_POLICY_URL,
    terms: environment.EXPO_PUBLIC_TERMS_URL,
    support: environment.EXPO_PUBLIC_SUPPORT_URL,
  });
});

test("rejects missing, non-HTTPS, and malformed legal destinations", () => {
  const environment = {
    EXPO_PUBLIC_PRIVACY_POLICY_URL: "http://legal.example.com/privacy",
    EXPO_PUBLIC_TERMS_URL: "not a url",
    EXPO_PUBLIC_SUPPORT_URL: "",
  };

  assert.deepEqual(
    getLegalConfigurationIssues(environment).map((issue) => issue.variableName),
    ["EXPO_PUBLIC_PRIVACY_POLICY_URL", "EXPO_PUBLIC_TERMS_URL", "EXPO_PUBLIC_SUPPORT_URL"],
  );
  assert.deepEqual(getAccountLinks(environment), {
    privacy: null,
    terms: null,
    support: null,
  });
});
