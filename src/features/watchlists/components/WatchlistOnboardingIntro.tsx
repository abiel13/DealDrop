import { Pressable, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { AppIcon } from "@/components/ui/Icon";
import { AppText } from "@/components/ui/Text";
import { formatMarketplaceName } from "@/features/listings/utils/listing.utils";
import type { ApiMarketplace } from "@/services/api";
import { useTheme } from "@/providers/ThemeProvider";

import {
  getEnabledOnboardingMarketplaces,
  getMarketplaceOnboardingDetails,
  type WatchlistTemplate,
  WATCHLIST_TEMPLATES,
} from "../utils/watchlist-onboarding";

interface WatchlistOnboardingIntroProps {
  marketplaces: readonly ApiMarketplace[];
  onSelectTemplate: (template: WatchlistTemplate) => void;
}

export function WatchlistOnboardingIntro({
  marketplaces,
  onSelectTemplate,
}: WatchlistOnboardingIntroProps) {
  const theme = useTheme();
  const enabledMarketplaces = getEnabledOnboardingMarketplaces(marketplaces);

  return (
    <View className="gap-4">
      <Card padding="md" className="gap-3 bg-primary-soft">
        <View className="flex-row items-start gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-surface">
            <AppIcon name="star" size={19} color={theme.colors.primary} />
          </View>
          <View className="flex-1 gap-1">
            <AppText variant="title">Start with a simple search</AppText>
            <AppText variant="bodySmall">
              Pick an example or enter your own. You can change every field before saving.
            </AppText>
          </View>
        </View>
        <View className="gap-2">
          {WATCHLIST_TEMPLATES.map((template) => (
            <Pressable
              key={template.id}
              accessibilityLabel={`Use ${template.label} example`}
              accessibilityRole="button"
              className="rounded-2xl bg-surface p-3"
              onPress={() => onSelectTemplate(template)}
            >
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1 gap-1">
                  <AppText variant="label">{template.label}</AppText>
                  <AppText variant="caption">{template.description}</AppText>
                </View>
                <AppIcon name="arrow-forward" size={17} color={theme.colors.primary} />
              </View>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card padding="md" className="gap-4">
        <View className="gap-1">
          <AppText variant="title">Enabled marketplaces</AppText>
          <AppText variant="bodySmall">
            These are the sources available in this environment. Their filter differences are shown
            before you save.
          </AppText>
        </View>

        {enabledMarketplaces.map((marketplace) => {
          const details = getMarketplaceOnboardingDetails(marketplace);
          return (
            <View key={marketplace.source} className="gap-2 rounded-2xl bg-background-muted p-3">
              <AppText variant="label">{formatMarketplaceName(marketplace.source)}</AppText>
              <AppText variant="caption">
                {details.supportedFilters.length > 0
                  ? `Supports ${details.supportedFilters.join(", ")} filters.`
                  : "Basic keyword matching only."}
              </AppText>
              {details.limitations.length > 0 && (
                <AppText variant="caption" className="text-text-secondary">
                  Not available here: {details.limitations.join(", ")}.
                </AppText>
              )}
              <AppText variant="caption" className="text-text-secondary">
                {details.currencyNote}
              </AppText>
            </View>
          );
        })}
      </Card>

      <Card padding="md" className="gap-3">
        <AppText variant="title">What happens after you save</AppText>
        <ExpectationRow
          title="First check"
          description="Your active watchlist is checked on the next monitoring run, usually within a few minutes."
        />
        <ExpectationRow
          title="No matches yet"
          description="That is normal. Your watchlist stays active and keeps checking until a match appears."
        />
        <ExpectationRow
          title="Alerts"
          description="Instant sends each match as it is found. Digest groups matches from a monitoring run."
        />
      </Card>
    </View>
  );
}

function ExpectationRow({ title, description }: { title: string; description: string }) {
  return (
    <View className="flex-row items-start gap-3">
      <View className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
      <View className="flex-1 gap-1">
        <AppText variant="label">{title}</AppText>
        <AppText variant="bodySmall">{description}</AppText>
      </View>
    </View>
  );
}
