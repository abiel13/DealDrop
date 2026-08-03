import { ScrollView, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { AppText } from "@/components/ui/Text";

export default function HomeScreen() {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="p-6 gap-8"
    >
      {/* Typography */}

      <View className="gap-2">
        <AppText variant="display">DealDrop</AppText>

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
          Body text looks like this.
        </AppText>

        <AppText variant="bodySmall">
          Small body text.
        </AppText>

        <AppText variant="caption">
          Caption text.
        </AppText>

        <AppText variant="error">
          Something went wrong.
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
          Loading...
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
      </View>

      {/* Cards */}

      <Card>
        <AppText variant="title">
          MacBook Pro M2
        </AppText>

        <AppText variant="body">
          Excellent condition.
        </AppText>

        <AppText variant="heading">
          $850
        </AppText>
      </Card>

      <Card padding="lg">
        <AppText variant="title">
          iPhone 15 Pro
        </AppText>

        <AppText variant="caption">
          Posted 2 minutes ago
        </AppText>
      </Card>
    </ScrollView>
  );
}