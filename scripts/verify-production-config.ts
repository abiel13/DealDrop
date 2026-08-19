import { getLegalConfigurationIssues } from "../src/features/profile/utils/legal-links";

const issues = getLegalConfigurationIssues();

if (issues.length > 0) {
  console.error("Production public configuration check failed:");
  for (const issue of issues) {
    console.error(`- ${issue.variableName}: ${issue.message}`);
  }
  process.exitCode = 1;
} else {
  console.log("Production legal and support destinations are configured.");
}
