import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Loading } from "@/components/ui/Loading";
import { AppText } from "@/components/ui/Text";
import { useAuth } from "@/features/auth/hooks/AuthProvider";
import { authRoutes, watchlistRoute } from "@/features/auth/routes";
import { trackProductEventNonBlocking } from "@/features/analytics/services/analytics.service";
import { formatMarketplaceName } from "@/features/listings/utils/listing.utils";
import {
  createWatchlist,
  getWatchlists,
  getSupportedMarketplaces,
} from "@/features/watchlists/services/watchlist.service";
import type { Watchlist, WatchlistInput } from "@/features/watchlists/types/watchlist.types";
import { AppHeader } from "@/features/navigation/components";
import type {
  ApiProductCapture,
  ApiProductCaptureInput,
  ApiSearchFilters,
  MarketplaceSource,
} from "@/services/api";

import {
  createProductCapture,
  getProductCaptureDefaults,
  getProductCaptureFailureMessage,
  validatePastedProductUrl,
} from "../services/product-capture.service";
import { findSharedProductDuplicate } from "../services/share-intent.service";

export interface ProductCaptureScreenProps {
  captureSource?: "pasted_url" | "share_sheet";
  initialCaptureInput?: ApiProductCaptureInput | null;
  initialUrl?: string | null;
  autoCapture?: boolean;
  onCancel?: () => void;
}

export function ProductCaptureScreen({
  captureSource = "pasted_url",
  initialCaptureInput = null,
  initialUrl = null,
  autoCapture = false,
  onCancel,
}: ProductCaptureScreenProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [url, setUrl] = useState(initialCaptureInput?.url ?? initialUrl ?? "");
  const [capture, setCapture] = useState<ApiProductCapture | null>(null);
  const [title, setTitle] = useState("");
  const [variant, setVariant] = useState("");
  const [condition, setCondition] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [marketplaceScope, setMarketplaceScope] = useState<"all" | "selected">("all");
  const [marketplaceIds, setMarketplaceIds] = useState<MarketplaceSource[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicateWatchlist, setDuplicateWatchlist] = useState<Watchlist | null>(null);
  const [duplicateWithoutTargetPrice, setDuplicateWithoutTargetPrice] = useState(false);
  const autoCaptureKeyRef = useRef<string | null>(null);

  const marketplacesQuery = useQuery({
    queryKey: ["marketplaces"],
    queryFn: getSupportedMarketplaces,
    enabled: Boolean(user),
    staleTime: 5 * 60 * 1000,
  });
  const defaults = useMemo(() => getProductCaptureDefaults(), []);
  const normalizedProduct = capture?.normalizedProduct;

  const captureMutation = useMutation({
    mutationFn: async (input: ApiProductCaptureInput) => {
      if (input.captureSource === "pasted_url") {
        trackProductEventNonBlocking("url_pasted", { captureSource: "pasted_url" });
      }
      return createProductCapture(input);
    },
    onSuccess: (nextCapture) => {
      setFormError(null);
      setCapture(nextCapture);

      if (nextCapture.status === "failed" || !nextCapture.normalizedProduct) {
        if (nextCapture.captureSource === "pasted_url") {
          trackProductEventNonBlocking("capture_failed", {
            captureSource: "pasted_url",
            reason: getCaptureFailureReason(nextCapture),
          });
        }
        setFormError(getProductCaptureFailureMessage(nextCapture));
        return;
      }

      const product = nextCapture.normalizedProduct;
      setTitle(product.title ?? "");
      setVariant(product.variant ?? "");
      setCondition(product.condition ?? "");
      setTargetPrice("");
      if (nextCapture.captureSource === "pasted_url") {
        trackProductEventNonBlocking("product_identified", {
          captureSource: "pasted_url",
          hasPrice: product.price !== null,
          hasIdentifier: product.identifiers.length > 0,
          needsConfirmation: nextCapture.status === "needs_confirmation",
        });
      }
    },
    onError: (error) => {
      if (captureSource === "pasted_url") {
        trackProductEventNonBlocking("capture_failed", {
          captureSource: "pasted_url",
          reason: "request_failed",
        });
      }
      setFormError(error instanceof Error ? error.message : "We couldn't look up that link.");
    },
  });

  const captureProduct = captureMutation.mutate;

  useEffect(() => {
    const input =
      initialCaptureInput ??
      (autoCapture && captureSource === "pasted_url" && initialUrl
        ? {
            captureSource: "pasted_url" as const,
            url: initialUrl,
            country: defaults.country,
            preferredCurrency: defaults.currency,
          }
        : null);
    if (!input) return;

    const captureKey = [input.captureSource, input.url, input.rawText, input.barcode]
      .map((value) => value ?? "")
      .join("|");
    if (autoCaptureKeyRef.current === captureKey) return;

    autoCaptureKeyRef.current = captureKey;
    setFormError(null);
    setCapture(null);
    captureProduct(input);
  }, [autoCapture, captureProduct, captureSource, defaults, initialCaptureInput, initialUrl]);

  const trackingMutation = useMutation({
    mutationFn: async ({
      withoutTargetPrice,
      allowDuplicate,
    }: {
      withoutTargetPrice: boolean;
      allowDuplicate: boolean;
    }) => {
      if (!user || !normalizedProduct) {
        throw new Error("Confirm a product before tracking it.");
      }

      const normalizedTitle = title.trim();
      if (normalizedTitle.length < 2) {
        throw new Error("Add a product name before tracking it.");
      }

      const parsedTargetPrice = withoutTargetPrice ? undefined : parseOptionalPrice(targetPrice);
      if (!withoutTargetPrice && targetPrice.trim() && parsedTargetPrice === undefined) {
        throw new Error("Enter a valid non-negative target price.");
      }

      const filters: ApiSearchFilters = {
        ...(normalizedProduct.identifiers.length > 0
          ? { aliases: normalizedProduct.identifiers.map((identifier) => identifier.value) }
          : {}),
        ...(parsedTargetPrice !== undefined
          ? {
              price: {
                max: parsedTargetPrice,
                currency: (normalizedProduct.currency ?? defaults.currency).toUpperCase(),
              },
            }
          : {}),
        ...(condition.trim() ? { conditions: [condition.trim()] } : {}),
      };
      const searchQuery = [normalizedTitle, variant.trim()].filter(Boolean).join(" ");

      const input: WatchlistInput = {
        name: normalizedTitle.slice(0, 120),
        searchQuery: searchQuery.slice(0, 200),
        filters,
        alertMode: "instant",
        marketplaceScope,
        marketplaceIds: marketplaceScope === "all" ? [] : marketplaceIds,
      };

      if (captureSource === "share_sheet" && !allowDuplicate) {
        const duplicate = findSharedProductDuplicate(
          await getWatchlists(),
          input.searchQuery,
          normalizedProduct.identifiers,
        );
        if (duplicate) return { watchlist: null, duplicate, withoutTargetPrice };
      }

      return {
        watchlist: await createWatchlist(input),
        duplicate: null,
        withoutTargetPrice,
      };
    },
    onSuccess: async (result) => {
      if (result.duplicate) {
        setDuplicateWatchlist(result.duplicate);
        setDuplicateWithoutTargetPrice(result.withoutTargetPrice);
        return;
      }

      const watchlist = result.watchlist;
      if (!watchlist) {
        setFormError("We couldn't create the tracking item yet.");
        return;
      }

      setDuplicateWatchlist(null);
      setDuplicateWithoutTargetPrice(false);
      await queryClient.invalidateQueries({ queryKey: ["watchlists", user?.id] });
      trackProductEventNonBlocking(
        "tracking_created",
        { watchlistId: watchlist.id },
        `tracking-created:${watchlist.id}`,
      );
      router.replace(watchlistRoute(watchlist.id));
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "We couldn't start tracking yet.");
    },
  });

  if (!user) {
    return <Redirect href={authRoutes.login} />;
  }

  function handleCapture() {
    const validationError = validatePastedProductUrl(url);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);
    setCapture(null);
    captureProduct({
      captureSource: "pasted_url",
      url: url.trim(),
      country: defaults.country,
      preferredCurrency: defaults.currency,
    });
  }

  function selectAllMarketplaces() {
    setMarketplaceScope("all");
    setMarketplaceIds([]);
  }

  function toggleMarketplace(source: MarketplaceSource) {
    const nextIds = marketplaceIds.includes(source)
      ? marketplaceIds.filter((item) => item !== source)
      : [...marketplaceIds, source];
    if (nextIds.length === 0) return;
    setMarketplaceScope("selected");
    setMarketplaceIds(nextIds);
  }

  function handleTrack(withoutTargetPrice = false, allowDuplicate = false) {
    setFormError(null);
    setDuplicateWatchlist(null);
    setDuplicateWithoutTargetPrice(false);
    trackingMutation.mutate({ withoutTargetPrice, allowDuplicate });
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerClassName="grow gap-5 px-5 pb-10 pt-6"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          title={captureSource === "share_sheet" ? "Review shared product" : "Paste a product link"}
          subtitle="DealDrop will identify the product before you start tracking it."
          onBack={onCancel ?? (() => router.back())}
        />

        {captureSource === "pasted_url" ? (
          <Card padding="md" className="gap-4">
            <View className="gap-1">
              <AppText variant="label">Product URL</AppText>
              <AppText variant="bodySmall">
                Use a public product page from a supported marketplace or store.
              </AppText>
            </View>
            <Input
              label=""
              placeholder="https://example.com/product"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              value={url}
              onChangeText={setUrl}
              onSubmitEditing={handleCapture}
            />
            <Button loading={captureMutation.isPending} onPress={handleCapture}>
              Find product
            </Button>
            {formError && !normalizedProduct && <AppText variant="error">{formError}</AppText>}
          </Card>
        ) : (
          <Card padding="md" className="gap-2">
            <AppText variant="label">Shared content</AppText>
            <AppText variant="bodySmall" numberOfLines={4}>
              {initialCaptureInput?.url ??
                initialCaptureInput?.rawText ??
                "Reading shared content…"}
            </AppText>
          </Card>
        )}

        {captureMutation.isPending && <Loading size="small" />}

        {normalizedProduct && (
          <Card padding="md" className="gap-5">
            <View className="gap-1">
              <AppText variant="caption" className="font-semibold uppercase text-primary">
                Check the details
              </AppText>
              <AppText variant="bodySmall">
                Correct anything uncertain before creating your watchlist.
              </AppText>
            </View>

            {normalizedProduct.imageUrls[0] && (
              <Image
                accessibilityLabel="Detected product image"
                className="h-44 w-full rounded-2xl bg-background-muted"
                resizeMode="cover"
                source={{ uri: normalizedProduct.imageUrls[0] }}
              />
            )}

            <View className="gap-2 rounded-2xl bg-primary-soft p-4">
              <AppText variant="title">{normalizedProduct.title ?? "Product details"}</AppText>
              <AppText variant="bodySmall">
                {[normalizedProduct.merchant, normalizedProduct.sourceDomain]
                  .filter(Boolean)
                  .join(" · ") || "Source details unavailable"}
              </AppText>
              {normalizedProduct.price !== null && (
                <AppText variant="label" className="text-primary">
                  {formatPrice(normalizedProduct.price, normalizedProduct.currency)}
                </AppText>
              )}
              {normalizedProduct.availability && (
                <AppText variant="caption">Availability: {normalizedProduct.availability}</AppText>
              )}
            </View>

            {capture.status === "needs_confirmation" && capture.failureReason && (
              <AppText variant="bodySmall" className="text-warning">
                {capture.failureReason}
              </AppText>
            )}

            <Input label="Product name" value={title} onChangeText={setTitle} />
            <Input
              label="Variant (optional)"
              placeholder="e.g. 128GB, black"
              value={variant}
              onChangeText={setVariant}
            />
            <Input
              label="Condition (optional)"
              placeholder="e.g. new or refurbished"
              value={condition}
              onChangeText={setCondition}
            />

            <View className="gap-3">
              <View className="gap-1">
                <AppText variant="label">Marketplaces to monitor</AppText>
                <AppText variant="bodySmall">
                  Choose all, or limit this product to selected sources.
                </AppText>
              </View>
              <View className="flex-row flex-wrap gap-2">
                <MarketplaceOption
                  label="All marketplaces"
                  selected={marketplaceScope === "all"}
                  onPress={selectAllMarketplaces}
                />
                {marketplacesQuery.data?.map((marketplace) => (
                  <MarketplaceOption
                    key={marketplace.source}
                    label={formatMarketplaceName(marketplace.source)}
                    selected={
                      marketplaceScope === "selected" && marketplaceIds.includes(marketplace.source)
                    }
                    onPress={() => toggleMarketplace(marketplace.source)}
                  />
                ))}
              </View>
              {marketplacesQuery.isLoading && <Loading size="small" />}
              {marketplacesQuery.isError && (
                <AppText variant="caption">
                  Marketplace choices are unavailable; all sources will be monitored.
                </AppText>
              )}
            </View>

            <Input
              label={`Target price${normalizedProduct.currency ? ` (${normalizedProduct.currency})` : ""} (optional)`}
              placeholder="Leave blank to save without a target"
              keyboardType="decimal-pad"
              value={targetPrice}
              onChangeText={setTargetPrice}
            />

            {duplicateWatchlist && (
              <Card padding="sm" className="gap-3 border border-warning">
                <AppText variant="label">This product is already being tracked</AppText>
                <AppText variant="bodySmall">
                  Open “{duplicateWatchlist.name}”, or intentionally create another tracker.
                </AppText>
                <Button onPress={() => router.replace(watchlistRoute(duplicateWatchlist.id))}>
                  Open existing tracker
                </Button>
                <Button
                  disabled={trackingMutation.isPending}
                  variant="outline"
                  onPress={() => handleTrack(duplicateWithoutTargetPrice, true)}
                >
                  Track again anyway
                </Button>
              </Card>
            )}

            {formError && <AppText variant="error">{formError}</AppText>}
            <Button loading={trackingMutation.isPending} onPress={() => handleTrack()}>
              Track this product
            </Button>
            {targetPrice.trim() && (
              <Button
                disabled={trackingMutation.isPending}
                variant="outline"
                onPress={() => handleTrack(true)}
              >
                Save without a target price
              </Button>
            )}
          </Card>
        )}

        {capture?.status === "failed" && capture.failureReason && (
          <ErrorState title="Product unavailable" description={capture.failureReason} />
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function MarketplaceOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`rounded-full border px-4 py-2 ${
        selected ? "border-primary bg-primary-soft" : "border-border bg-surface"
      }`}
      onPress={onPress}
    >
      <AppText variant="bodySmall" className={selected ? "font-semibold text-primary" : undefined}>
        {label}
      </AppText>
    </Pressable>
  );
}

function parseOptionalPrice(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function formatPrice(price: number, currency: string | null) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency ?? "USD",
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    return `${currency ? `${currency} ` : ""}${price.toFixed(2)}`;
  }
}

function getCaptureFailureReason(capture: ApiProductCapture) {
  if (capture.failureReason?.toLowerCase().includes("no longer available")) return "expired";
  if (capture.failureReason?.toLowerCase().includes("private")) return "private";
  if (capture.failureReason?.toLowerCase().includes("valid")) return "malformed";
  return "not_identified";
}
