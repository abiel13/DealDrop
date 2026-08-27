import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  MerchantAttributionRecorder,
  MerchantLinkClickEvent,
  PublicPageOpenedEvent,
} from "../merchant-links/types";

const PUBLIC_SLUG_PATTERN = /^[a-f0-9]{24}$/;

interface PublicRoomRow {
  id: string;
  user_id: string;
}

interface PublicCreatorRow {
  user_id: string;
}

interface ListingRow {
  id: string;
  marketplace_id: string;
  url: string;
  product_identity_id: string | null;
}

interface ProductIdentityRow {
  id: string;
}

export class MerchantAttributionRepository implements MerchantAttributionRecorder {
  constructor(private readonly client: SupabaseClient) {}

  async recordPublicPageOpened(event: PublicPageOpenedEvent) {
    await this.client.from("merchant_attribution_events").insert({
      event_type: "public_page_opened",
      page_type: event.pageType,
      page_slug: event.pageSlug,
      deal_room_slug: event.dealRoomSlug ?? null,
      creator_slug: event.creatorSlug ?? null,
      source_marketplace: null,
      merchant_url: null,
      merchant_url_host: null,
      affiliate_program: null,
      affiliate_applied: false,
    });
  }

  async recordMerchantLinkClicked(event: MerchantLinkClickEvent) {
    const context = await this.resolveContext(event);
    await this.client.from("merchant_attribution_events").insert({
      event_type: "merchant_link_clicked",
      page_type: null,
      page_slug: null,
      deal_room_slug: context.dealRoomSlug,
      creator_slug: context.creatorSlug,
      source_marketplace: event.source,
      merchant_url: event.merchantUrl,
      merchant_url_host: event.merchantUrlHost,
      product_identity_id: context.productIdentityId,
      listing_id: context.listingId,
      affiliate_program: event.affiliateProgram,
      affiliate_applied: event.affiliateApplied,
    });
  }

  private async resolveContext(event: MerchantLinkClickEvent) {
    const room = event.dealRoomSlug ? await this.getPublicRoom(event.dealRoomSlug) : null;
    const creator = event.creatorSlug ? await this.getPublicCreator(event.creatorSlug) : null;
    const listing = event.listingId ? await this.getMatchingListing(event) : null;
    const productIdentityId =
      listing?.product_identity_id ??
      (event.productIdentityId ? await this.getProductIdentity(event.productIdentityId) : null);

    return {
      dealRoomSlug: room ? (event.dealRoomSlug ?? null) : null,
      creatorSlug: room && creator?.user_id === room.user_id ? (event.creatorSlug ?? null) : null,
      productIdentityId,
      listingId: listing?.id ?? null,
    };
  }

  private async getPublicRoom(slug: string): Promise<PublicRoomRow | null> {
    if (!PUBLIC_SLUG_PATTERN.test(slug)) return null;

    const { data, error } = await this.client
      .from("deal_rooms")
      .select("id,user_id")
      .eq("public_slug", slug)
      .eq("visibility", "public")
      .maybeSingle<PublicRoomRow>();
    if (error) throw error;
    return data;
  }

  private async getPublicCreator(slug: string): Promise<PublicCreatorRow | null> {
    if (!PUBLIC_SLUG_PATTERN.test(slug)) return null;

    const { data, error } = await this.client
      .from("creator_profiles")
      .select("user_id")
      .eq("public_slug", slug)
      .eq("is_public", true)
      .maybeSingle<PublicCreatorRow>();
    if (error) throw error;
    return data;
  }

  private async getMatchingListing(event: MerchantLinkClickEvent): Promise<ListingRow | null> {
    const { data, error } = await this.client
      .from("listings")
      .select("id,marketplace_id,url,product_identity_id")
      .eq("id", event.listingId)
      .maybeSingle<ListingRow>();
    if (error) throw error;
    if (!data || data.marketplace_id !== event.source || data.url !== event.merchantUrl) {
      return null;
    }

    return data;
  }

  private async getProductIdentity(productIdentityId: string): Promise<string | null> {
    const { data, error } = await this.client
      .from("product_identities")
      .select("id")
      .eq("id", productIdentityId)
      .maybeSingle<ProductIdentityRow>();
    if (error) throw error;
    return data?.id ?? null;
  }
}
