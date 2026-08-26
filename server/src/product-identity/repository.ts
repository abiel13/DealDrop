import type { SupabaseClient } from "@supabase/supabase-js";

import type { MarketplaceListing } from "../marketplaces/shared/types";
import {
  createProductIdentitySnapshot,
  matchProductIdentity,
  productIdentityFromListing,
  variantSignature,
} from ".";
import type {
  ProductIdentityCandidate,
  ProductIdentityInput,
  ProductIdentityMatch,
  ProductIdentitySnapshot,
} from ".";

interface StoredIdentityVariant {
  id: string;
  product_identity_id: string;
  variant_signature: string;
  size: string | null;
  storage: string | null;
  color: string | null;
  generation: string | null;
  configuration: string | null;
  variant_raw: string | null;
  condition: string | null;
  product_identities:
    | {
        id: string;
        canonical_title: string;
        normalized_brand: string | null;
        normalized_model: string | null;
        category: string | null;
      }
    | Array<{
        id: string;
        canonical_title: string;
        normalized_brand: string | null;
        normalized_model: string | null;
        category: string | null;
      }>
    | null;
}

interface StoredIdentityIdentifier {
  product_identity_id: string;
  identifier_type: ProductIdentityCandidate["identifiers"][number]["type"];
  normalized_value: string;
}

export interface ProductIdentityAssignment {
  productIdentityId: string | null;
  productVariantId: string | null;
  snapshot: ProductIdentitySnapshot;
}

export async function resolveProductIdentityAssignments(
  client: SupabaseClient,
  listings: readonly MarketplaceListing[],
): Promise<Map<string, ProductIdentityAssignment>> {
  if (listings.length === 0) return new Map();

  const storedCandidates = await loadCandidates(client);
  // The guard keeps older local databases and lightweight repository fakes usable
  // while the identity migration is being rolled out. A real Supabase query
  // always exposes select(), so actual database errors still surface.
  if (storedCandidates === null) return new Map();

  const candidates = [...storedCandidates];
  const assignments = new Map<string, ProductIdentityAssignment>();

  for (const listing of listings) {
    const input = productIdentityFromListing(listing);
    const key = listingKey(listing);
    const match = matchProductIdentity(input, candidates);

    if (match.decision === "ambiguous") {
      assignments.set(key, assignmentFromMatch(input, match));
      continue;
    }

    if (match.decision === "matched" && match.productIdentityId && match.productVariantId) {
      await persistIdentifiers(client, match.productIdentityId, input);
      assignments.set(key, assignmentFromMatch(input, match));
      continue;
    }

    if (match.decision === "matched" && match.productIdentityId) {
      const variant = await createVariant(client, match.productIdentityId, input);
      await persistIdentifiers(client, match.productIdentityId, input);
      const variantMatch = {
        ...match,
        productVariantId: variant.id,
      };
      candidates.push({
        ...input,
        productIdentityId: match.productIdentityId,
        productVariantId: variant.id,
      });
      assignments.set(key, {
        productIdentityId: match.productIdentityId,
        productVariantId: variant.id,
        snapshot: createProductIdentitySnapshot(input, variantMatch),
      });
      continue;
    }

    if (!input.title && input.identifiers.length === 0) {
      assignments.set(key, assignmentFromMatch(input, match));
      continue;
    }

    const created = await createIdentity(client, input);
    await persistIdentifiers(client, created.productIdentityId, input);
    candidates.push({
      ...input,
      productIdentityId: created.productIdentityId,
      productVariantId: created.productVariantId,
    });
    assignments.set(key, {
      productIdentityId: created.productIdentityId,
      productVariantId: created.productVariantId,
      snapshot: createProductIdentitySnapshot(input, {
        ...match,
        decision: "unmatched",
        productIdentityId: created.productIdentityId,
        productVariantId: created.productVariantId,
      }),
    });
  }

  return assignments;
}

async function loadCandidates(client: SupabaseClient): Promise<ProductIdentityCandidate[] | null> {
  const query = client.from("product_identity_variants");
  if (typeof query.select !== "function") return null;

  const { data, error } = await query
    .select(
      "id,product_identity_id,variant_signature,size,storage,color,generation,configuration,variant_raw,condition,product_identities!inner(id,canonical_title,normalized_brand,normalized_model,category)",
    )
    .returns<StoredIdentityVariant[]>();

  if (error) throw error;

  const { data: identifiers, error: identifierError } = await client
    .from("product_identity_identifiers")
    .select("product_identity_id,identifier_type,normalized_value")
    .returns<StoredIdentityIdentifier[]>();
  if (identifierError) throw identifierError;

  const identifiersByProduct = new Map<string, StoredIdentityIdentifier[]>();
  for (const identifier of identifiers ?? []) {
    const existing = identifiersByProduct.get(identifier.product_identity_id) ?? [];
    existing.push(identifier);
    identifiersByProduct.set(identifier.product_identity_id, existing);
  }

  return (data ?? []).flatMap((row) => {
    const product = unwrap(row.product_identities);
    if (!product) return [];

    return [
      {
        title: product.canonical_title,
        brand: product.normalized_brand,
        model: product.normalized_model,
        category: product.category,
        identifiers: (identifiersByProduct.get(row.product_identity_id) ?? []).map(
          (identifier) => ({
            type: identifier.identifier_type,
            value: identifier.normalized_value,
          }),
        ),
        variant: {
          size: row.size,
          storage: row.storage,
          color: row.color,
          generation: row.generation,
          configuration: row.configuration,
          raw: row.variant_raw,
        },
        condition: row.condition,
        productIdentityId: row.product_identity_id,
        productVariantId: row.id,
      },
    ];
  });
}

async function createIdentity(client: SupabaseClient, input: ProductIdentityInput) {
  const { data: product, error: productError } = await client
    .from("product_identities")
    .insert({
      canonical_title: input.title ?? "Unlabelled product",
      normalized_brand: input.brand,
      normalized_model: input.model,
      category: input.category,
    })
    .select("id")
    .single<{ id: string }>();

  if (productError) throw productError;

  const variant = await createVariant(client, product.id, input);
  return { productIdentityId: product.id, productVariantId: variant.id };
}

async function createVariant(
  client: SupabaseClient,
  productIdentityId: string,
  input: ProductIdentityInput,
) {
  const { data, error } = await client
    .from("product_identity_variants")
    .insert({
      product_identity_id: productIdentityId,
      variant_signature: identityVariantSignature(input),
      size: input.variant.size,
      storage: input.variant.storage,
      color: input.variant.color,
      generation: input.variant.generation,
      configuration: input.variant.configuration,
      variant_raw: input.variant.raw,
      condition: input.condition,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) throw error;
  return data;
}

async function persistIdentifiers(
  client: SupabaseClient,
  productIdentityId: string,
  input: ProductIdentityInput,
) {
  if (input.identifiers.length === 0) return;

  const { error } = await client.from("product_identity_identifiers").upsert(
    input.identifiers.map((identifier) => ({
      product_identity_id: productIdentityId,
      identifier_type: identifier.type,
      normalized_value: identifier.value,
      source: "marketplace",
      confidence: 1,
    })),
    {
      onConflict: "identifier_type,normalized_value",
      ignoreDuplicates: true,
    },
  );
  if (error) throw error;
}

function assignmentFromMatch(
  input: ProductIdentityInput,
  match: ProductIdentityMatch,
): ProductIdentityAssignment {
  return {
    productIdentityId: match.productIdentityId,
    productVariantId: match.productVariantId,
    snapshot: createProductIdentitySnapshot(input, match),
  };
}

function identityVariantSignature(input: ProductIdentityInput) {
  const attributes = variantSignature(input.variant);
  return (
    [attributes, input.condition ? `condition=${input.condition}` : null]
      .filter(Boolean)
      .join("|") || "base"
  );
}

function listingKey(listing: MarketplaceListing) {
  return `${listing.source}:${listing.externalId}`;
}

function unwrap<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
