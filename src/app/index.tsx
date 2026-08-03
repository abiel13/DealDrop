import { ScrollView, View } from "react-native";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { SearchBar } from "@/components/ui/Searchbar";
import { AppText } from "@/components/ui/Text";

export default function HomeScreen() {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-8 p-6"
    >
      {/* Typography */}

      <View className="gap-2">
        <AppText variant="display">
          DealDrop
        </AppText>

        <AppText variant="heading">
          Heading
        </AppText>

        <AppText variant="title">
          Title
        </AppText>

        <AppText variant="subtitle">
          Subtitle
        </AppText>

        <AppText variant="body">
          Never miss another marketplace deal.
        </AppText>

        <AppText variant="bodySmall">
          Smaller body text.
        </AppText>

        <AppText variant="caption">
          Posted 3 minutes ago
        </AppText>

        <AppText variant="error">
          Invalid email address
        </AppText>
      </View>

      {/* Buttons */}

      <View className="gap-4">
        <Button>
          Primary Button
        </Button>

        <Button variant="secondary">
          Secondary Button
        </Button>

        <Button variant="outline">
          Outline Button
        </Button>

        <Button variant="ghost">
          Ghost Button
        </Button>

        <Button variant="danger">
          Delete
        </Button>

        <Button loading>
          Loading
        </Button>

        <Button disabled>
          Disabled
        </Button>
      </View>

      {/* Inputs */}

      <View className="gap-4">
        <Input
          label="Email"
          placeholder="john@example.com"
        />

        <Input
          label="Password"
          placeholder="Password"
          secureTextEntry
        />

        <Input
          label="Email"
          error="Email is required"
        />

        <SearchBar />
      </View>

      {/* Cards */}

      <Card>
        <AppText variant="title">
          MacBook Pro M2
        </AppText>

        <AppText variant="body">
          Excellent condition
        </AppText>

        <AppText variant="heading">
          $850
        </AppText>
      </Card>

      <Card padding="lg">
        <View className="flex-row items-center gap-4">
          <Avatar
            fallback="A"
            size="lg"
          />

          <View>
            <AppText variant="title">
              Abiel
            </AppText>

            <AppText variant="caption">
              Premium User
            </AppText>
          </View>
        </View>
      </Card>

      {/* Empty State */}

      <EmptyState
        title="No Watchlists"
        description="Create your first watchlist to start tracking deals."
      />

      {/* Error State */}

      <ErrorState
        title="Something went wrong"
        description="Please try again in a few moments."
      />

      {/* Loading */}

      <Loading />
    </ScrollView>
  );
}