export interface AccountLinks {
  privacy: string | null;
  terms: string | null;
  support: string | null;
}

export interface LegalConfigurationIssue {
  variableName: string;
  message: string;
}

type PublicEnvironment = Record<string, string | undefined>;

const LINK_DEFINITIONS = [
  {
    key: "privacy" as const,
    variableName: "EXPO_PUBLIC_PRIVACY_POLICY_URL",
    label: "Privacy policy",
    allowMailto: false,
  },
  {
    key: "terms" as const,
    variableName: "EXPO_PUBLIC_TERMS_URL",
    label: "Terms of service",
    allowMailto: false,
  },
  {
    key: "support" as const,
    variableName: "EXPO_PUBLIC_SUPPORT_URL",
    label: "Support",
    allowMailto: true,
  },
] as const;

export function getAccountLinks(environment: PublicEnvironment = process.env): AccountLinks {
  return {
    privacy: readConfiguredLink(environment["EXPO_PUBLIC_PRIVACY_POLICY_URL"], false),
    terms: readConfiguredLink(environment["EXPO_PUBLIC_TERMS_URL"], false),
    support: readConfiguredLink(environment["EXPO_PUBLIC_SUPPORT_URL"], true),
  };
}

export function getLegalConfigurationIssues(
  environment: PublicEnvironment = process.env,
): LegalConfigurationIssue[] {
  return LINK_DEFINITIONS.flatMap(({ variableName, label, allowMailto }) => {
    const value = environment[variableName]?.trim();
    if (!value) {
      return [{ variableName, message: `${label} must be configured for a production build.` }];
    }

    if (!isSupportedLink(value, allowMailto)) {
      return [
        {
          variableName,
          message: `${label} must be an HTTPS URL${allowMailto ? " or a mailto link" : ""}.`,
        },
      ];
    }

    return [];
  });
}

function readConfiguredLink(value: string | undefined, allowMailto: boolean) {
  const normalized = value?.trim();
  return normalized && isSupportedLink(normalized, allowMailto) ? normalized : null;
}

function isSupportedLink(value: string, allowMailto: boolean) {
  if (allowMailto && value.startsWith("mailto:")) {
    return value.length > "mailto:".length;
  }

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
