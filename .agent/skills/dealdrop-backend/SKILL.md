---

name: dealdrop-backend
description: Design, implement, refactor, test, and deploy DealDrop's backend, marketplace adapters, workers, APIs, matching pipeline, notification pipeline, Supabase server integration, and production services. Use for any DealDrop task involving server code, marketplace integrations, Facebook Marketplace, eBay, additional marketplace sources, listing ingestion, normalization, deduplication, watchlist matching, background jobs, queues, APIs, deployment, or mobile-to-server communication.
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# DealDrop Backend Skill

## Mission

Build DealDrop's backend as a clean, reliable modular monolith that powers the React Native mobile application and can support multiple marketplace integrations.

The architecture must optimize for:

* simplicity
* reliability
* clear boundaries
* marketplace extensibility
* production deployment
* observability
* maintainability
* safe failure handling

Do not introduce distributed-system complexity before the application actually requires it.

The goal is not to demonstrate architectural sophistication.

The goal is to build a backend that reliably finds marketplace listings, normalizes them, matches them to user watchlists, and delivers useful results to the DealDrop mobile application.

---

# Scope Rules

`AGENTS.md` remains authoritative.

Only work on the explicitly supplied GitHub issue.

This skill defines how backend work should be implemented.

It does not authorize implementation of future issues.

Do not:

* implement another marketplace unless the issue requests it
* redesign unrelated modules
* introduce infrastructure for imagined future scale
* change the mobile UI unless the issue explicitly requires mobile changes
* rewrite working functionality merely to fit personal preferences
* introduce new services because the architecture might need them someday

When the current issue's Definition of Done is satisfied, stop.

---

# Repository Architecture

DealDrop uses one repository containing two primary runtimes:

```text
DealDrop/
├── src/                     # React Native / Expo mobile application
├── server/                  # Node.js backend application
├── supabase/                # Database migrations/config
├── assets/
├── .agents/
├── AGENTS.md
└── package.json
```

The repository is shared.

The runtimes are not.

The React Native application must never bundle or execute server-only marketplace code.

---

# Modular Monolith

The backend is a modular monolith.

Prefer:

```text
server/
└── src/
    ├── api/
    ├── config/
    ├── database/
    ├── marketplaces/
    ├── matching/
    ├── notifications/
    ├── workers/
    ├── services/
    ├── types/
    └── index.ts
```

Do not split DealDrop into independent microservices unless explicitly requested in a future issue.

Do not create separate repositories for:

* marketplace search
* matching
* notifications
* workers
* API

unless there is a demonstrated operational need.

Logical modules should remain separable internally so they can be extracted later if necessary.

---

# Runtime Boundary

The mobile application and server must have a strict boundary.

## Mobile responsibilities

The React Native application may:

* authenticate users
* display listings
* create and manage watchlists
* request marketplace searches through DealDrop APIs
* display matches
* manage favorites
* display notifications
* trigger supported user actions

The React Native application must not:

* scrape marketplaces
* run Playwright
* call marketplace APIs using private credentials
* parse marketplace HTML
* contain marketplace authentication cookies
* run worker loops
* execute scheduled marketplace jobs
* contain server secrets

---

# Server Responsibilities

The server owns:

* marketplace integrations
* external marketplace credentials
* listing ingestion
* listing normalization
* search orchestration
* background monitoring
* deduplication
* watchlist matching
* notification orchestration
* privileged Supabase operations
* server-side validation
* operational logging
* retries
* marketplace failure handling

---

# Mobile API Boundary

The mobile application should communicate with DealDrop through stable DealDrop APIs.

Prefer APIs representing DealDrop concepts.

Example:

```text
GET /listings
GET /listings/:id
POST /search
GET /marketplaces
GET /watchlists/:id/matches
```

Avoid endpoints exposing implementation details such as:

```text
/facebook/scrape
/run-playwright
/ebay-api-call
/raw-listings
```

unless they are internal administrative endpoints explicitly required by the issue.

The mobile application should not need to know whether a marketplace uses:

* an official API
* HTTP requests
* browser automation
* scraping
* a future partnership feed

That is an implementation detail behind the marketplace adapter.

---

# Marketplace Architecture

All marketplaces must implement a common contract.

Marketplace-specific behavior belongs inside:

```text
server/src/marketplaces/<marketplace>/
```

Shared marketplace contracts belong inside:

```text
server/src/marketplaces/shared/
```

A marketplace module may contain only what it needs.

Typical structure:

```text
marketplaces/
├── shared/
│   ├── MarketplaceAdapter.ts
│   ├── MarketplaceListing.ts
│   ├── MarketplaceSearchRequest.ts
│   ├── MarketplaceSearchResult.ts
│   ├── MarketplaceCapabilities.ts
│   └── MarketplaceError.ts
│
├── facebook/
│   ├── FacebookAdapter.ts
│   ├── FacebookClient.ts
│   ├── FacebookParser.ts
│   └── FacebookMapper.ts
│
└── ebay/
    ├── EbayAdapter.ts
    ├── EbayClient.ts
    └── EbayMapper.ts
```

Do not create empty files simply to match this example.

Create only what the current implementation requires.

---

# Marketplace Adapter Contract

Every marketplace adapter should expose DealDrop behavior rather than marketplace internals.

The contract should conceptually support operations such as:

```ts
interface MarketplaceAdapter {
  readonly source: MarketplaceSource;

  search(
    request: MarketplaceSearchRequest,
  ): Promise<MarketplaceSearchResult>;

  getListing?(
    externalId: string,
  ): Promise<MarketplaceListing | null>;
}
```

The exact interface should be designed in the relevant architecture issue.

Do not expand the interface because a hypothetical future marketplace might need something.

Prefer capability metadata when marketplaces support different features.

For example:

```ts
interface MarketplaceCapabilities {
  supportsLocation: boolean;
  supportsCondition: boolean;
  supportsPriceRange: boolean;
  supportsPagination: boolean;
}
```

The application should degrade gracefully when a marketplace does not support a filter.

Do not fake unsupported capabilities.

---

# Normalized Listing Model

Every marketplace must map its native data into one common DealDrop listing model.

The rest of the system should operate on this model rather than marketplace-specific responses.

The model should conceptually include information such as:

```ts
interface MarketplaceListing {
  source: MarketplaceSource;
  externalId: string;

  title: string;
  description?: string;

  price?: number;
  currency?: string;

  imageUrls: string[];

  url: string;

  condition?: string;

  seller?: {
    externalId?: string;
    name?: string;
  };

  location?: {
    name?: string;
    latitude?: number;
    longitude?: number;
  };

  listedAt?: Date;
  fetchedAt: Date;

  metadata?: Record<string, unknown>;
}
```

The actual schema should follow the current database and issue requirements.

Do not invent unavailable marketplace values.

Missing values should remain missing.

Never fabricate:

* seller ratings
* location
* timestamps
* condition
* prices
* identifiers

---

# Raw vs Normalized Data

When the existing architecture stores raw marketplace responses, preserve the distinction between:

```text
raw marketplace data
        ↓
normalization
        ↓
DealDrop listing
```

Raw payloads are useful for:

* debugging
* parser fixes
* replaying failed normalization
* investigating source changes

Normalized listings are what application logic should consume.

Do not spread raw marketplace structures through matching or mobile code.

---

# Marketplace Isolation

A failure in one marketplace must not unnecessarily break another marketplace.

For multi-source operations:

```text
Facebook ── success
eBay ────── success
Source #3 ─ failure
```

DealDrop should normally return the successful results and record/report the failure for Source #3.

Do not fail the entire unified search merely because one source is temporarily unavailable unless the API contract explicitly requires all-or-nothing behavior.

---

# Marketplace Errors

Create meaningful server-side marketplace error categories when needed.

Examples may include:

* authentication failure
* rate limit
* timeout
* source unavailable
* parse failure
* malformed response
* unsupported filter

Do not expose raw provider errors directly to the mobile application.

Map internal failures to stable DealDrop error responses.

Log enough context for debugging without leaking secrets.

---

# Official APIs vs Scraping

Prefer official supported APIs when they provide the required capabilities.

Do not use browser automation merely because it is familiar.

When official APIs are unavailable and marketplace access requires another strategy:

* isolate it behind the adapter
* respect applicable access restrictions and platform rules
* keep parsing logic marketplace-specific
* make failures observable
* assume markup may change
* avoid coupling matching logic to HTML structure

Do not build platform-bypass mechanisms or attempts to evade authentication, rate limits, or access controls.

If reliable access cannot be implemented within allowed access methods, report the limitation instead of adding evasive behavior.

---

# Workers

Marketplace monitoring belongs on the server.

Workers should execute background operations such as:

```text
load active watchlists
        ↓
determine required marketplace searches
        ↓
query adapters
        ↓
normalize listings
        ↓
persist
        ↓
match
        ↓
queue/trigger notifications
```

Workers must not depend on the React Native application being open.

The mobile app is a client, not a scheduler.

---

# Worker Design

Prefer stateless worker execution where practical.

Persist important state in durable storage.

Do not rely on process memory for:

* completed matches
* notification history
* listing identity
* watchlist state
* critical retry state

Design worker jobs to tolerate process restarts.

Where possible, operations should be idempotent.

Running the same job twice should not create:

* duplicate listings
* duplicate matches
* duplicate notifications

unless the product intentionally supports such behavior.

---

# Scheduling

Do not build aggressive continuous polling by default.

Polling frequency should respect:

* marketplace capabilities
* source reliability
* operational cost
* subscription tier
* rate limits
* user expectations

Scheduling policy belongs in server configuration/domain logic, not scattered inside marketplace clients.

Do not place hardcoded timing constants throughout adapters.

---

# Queues

Do not introduce Redis, BullMQ, Kafka, RabbitMQ, or another queue merely because workers exist.

Add a queue only when the current issue demonstrates the need.

If a queue is required, hide queue implementation details behind a small job interface.

The rest of DealDrop should not depend directly on a vendor-specific queue API.

---

# Search Orchestration

Unified marketplace search should coordinate adapters, not duplicate their logic.

Conceptually:

```text
Search Request
      ↓
Search Coordinator
      ↓
Selected Marketplace Adapters
      ↓
Normalized Results
      ↓
Deduplication
      ↓
Sorting / Pagination
      ↓
DealDrop Response
```

The coordinator should not contain Facebook or eBay parsing logic.

---

# Concurrent Search

When querying multiple marketplaces, prefer safe concurrency rather than unnecessary serial execution.

However:

* respect source-specific rate limits
* use timeouts
* isolate failures
* avoid unbounded concurrency
* preserve deterministic response handling

Do not optimize concurrency without measurements.

---

# Deduplication

Deduplication is a DealDrop concern, not a marketplace adapter concern.

Within a single marketplace, prefer stable source identifiers.

Example identity:

```text
(source, externalId)
```

Cross-marketplace deduplication should happen after normalization.

Start with deterministic heuristics when required by the issue.

Potential signals:

* normalized title
* price
* location
* seller
* image fingerprints
* model identifiers

Do not introduce AI-based deduplication before deterministic approaches prove insufficient.

Never delete source listings merely because they appear similar.

Prefer grouping or selecting a canonical representation while retaining provenance.

---

# Watchlist Matching

Matching operates on normalized DealDrop listings.

It must not contain:

```text
if source === facebook then ...
if source === ebay then ...
```

for ordinary matching behavior.

Marketplace-specific translation belongs in adapters.

Matching may consider currently supported watchlist fields such as:

* keywords
* price range
* condition
* location
* radius
* marketplace selection

Do not add matching criteria not required by the product issue.

---

# Marketplace Selection

A watchlist may eventually target:

* one marketplace
* several marketplaces
* all supported marketplaces

The persisted representation should use stable marketplace identifiers.

Do not encode marketplace selection purely as UI labels.

Marketplace availability should be driven by server capabilities/configuration when the issue introduces this functionality.

---

# Database

Supabase PostgreSQL remains the primary persistent datastore unless explicitly changed.

Database changes must use migrations under:

```text
supabase/migrations/
```

Do not manually modify production schema through ad-hoc dashboard actions when the change belongs in source control.

Do not modify an already-applied migration unless there is a clear project convention allowing it.

Prefer creating a new migration for subsequent schema changes.

---

# Supabase Server Access

The mobile application's Supabase configuration and server-side Supabase access are different security contexts.

Never expose server credentials to React Native.

Privileged keys must exist only in server deployment environments.

Use the minimum privilege required.

Client-facing operations must remain protected by appropriate authentication/authorization.

---

# Authentication

The DealDrop API should authenticate mobile requests where required.

Do not trust user IDs sent in request bodies.

When the server needs the current user, derive identity from validated authentication credentials/session context.

Authorization must happen server-side for protected resources.

Never rely solely on the mobile UI hiding an action.

---

# Validation

Treat all API input as untrusted.

Validate:

* request bodies
* query parameters
* marketplace source values
* pagination
* prices
* location inputs
* IDs

Do not allow malformed user input to flow directly into marketplace clients or database queries.

Use the project's existing validation tooling when available.

---

# API Design

Use predictable HTTP semantics.

Prefer:

```text
GET    read
POST   create/action
PATCH  partial update
DELETE remove
```

Return consistent response shapes.

Avoid returning marketplace-native payloads.

The API should speak in DealDrop domain concepts.

Do not leak database column names unnecessarily when a domain DTO is more appropriate.

---

# API Versioning

Do not add API version complexity until needed.

A simple stable API is preferable to premature:

```text
/v1
/v2
/internal/v3
```

If existing conventions already include versioning, follow them.

---

# Mobile API Client

Mobile server communication should be centralized.

Do not scatter raw `fetch()` calls across screens.

Use the existing mobile service/data layer.

Conceptually:

```text
src/services/api/
```

or the existing equivalent.

Feature screens should consume hooks/services rather than know deployment URLs or raw network details.

---

# Environment Configuration

Never hardcode environment-specific URLs or credentials.

Maintain explicit development and production configuration.

Server secrets must never use `EXPO_PUBLIC_*`.

Only values safe for inclusion in the mobile bundle may use Expo public environment variables.

Examples:

Mobile-safe:

```text
EXPO_PUBLIC_API_URL
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
```

Server-only:

```text
SUPABASE_SERVICE_ROLE_KEY
EBAY_CLIENT_SECRET
MARKETPLACE_PRIVATE_TOKEN
```

Never print secrets to logs.

---

# Configuration

Centralize server configuration.

Validate required environment variables at server startup.

Fail clearly when mandatory production configuration is missing.

Do not defer missing-secret failures until a user triggers the affected feature.

---

# Logging

Server logs should help diagnose production failures.

Prefer structured logs containing useful context such as:

* marketplace source
* operation
* duration
* result count
* request/job identifier
* error category

Never log:

* passwords
* auth tokens
* marketplace cookies
* private API secrets
* full sensitive user payloads

---

# Observability

Every production-facing backend issue should consider whether the changed path can be diagnosed when it fails remotely.

At minimum, important flows should provide enough signals to answer:

* Is the API alive?
* Is the worker running?
* Which marketplace failed?
* When did it fail?
* Why did it fail?
* How many listings were returned?
* Did matching run?
* Did notifications trigger?

Do not build a giant monitoring platform unless requested.

---

# Health Checks

The production API should expose a lightweight health endpoint when the deployment issue introduces server hosting.

A health check should verify process availability without performing expensive marketplace requests.

Do not scrape Facebook from `/health`.

---

# Retries

Retry only failures likely to be transient.

Potential retry candidates:

* network timeouts
* temporary provider failures
* transient 5xx responses

Do not automatically retry:

* invalid credentials indefinitely
* malformed request input
* deterministic parser errors without limits

Retries must be bounded.

Avoid retry storms.

---

# Timeouts

External marketplace requests must not hang indefinitely.

Use explicit sensible timeouts.

Timeout behavior should produce an observable marketplace failure rather than freezing unified search or worker execution.

---

# Rate Limits

Respect marketplace rate limits and API policies.

Centralize source-specific rate-limit behavior where possible.

Do not add techniques intended to evade platform rate limits or access controls.

When limits prevent required product behavior, surface the technical/product constraint clearly.

---

# Caching

Do not add caching by default.

Use caching when it materially:

* reduces duplicate marketplace requests
* improves response time
* reduces API cost
* protects provider rate limits

Cache behavior must not make "instant alerts" meaningfully stale without an intentional product decision.

---

# Notifications

Marketplace adapters do not send notifications.

Correct layering:

```text
Marketplace Adapter
       ↓
Normalized Listing
       ↓
Matching
       ↓
Match
       ↓
Notification Pipeline
```

Do not place OneSignal/Expo notification calls inside marketplace-specific modules.

---

# Security

Treat marketplace/backend infrastructure as server-side trust boundaries.

Never:

* expose private credentials to mobile
* trust user-provided ownership identifiers
* skip authorization because the endpoint is "internal"
* commit `.env` secrets
* return raw provider credentials/errors
* log authentication secrets

Prefer the least privileged implementation that satisfies the issue.

---

# Server TypeScript

Use strict TypeScript.

Do not use `any` without a documented unavoidable reason.

Prefer domain types at module boundaries.

Marketplace provider SDK types should not spread across the entire backend.

Map external SDK/provider objects into DealDrop types at the adapter boundary.

---

# Error Handling

Do not swallow errors.

At each boundary determine whether to:

* handle
* translate
* retry
* log
* propagate

Errors should preserve enough internal context for debugging without exposing sensitive provider details to users.

---

# Tests

Prioritize tests around boundaries and business behavior.

Important candidates include:

* marketplace normalization
* marketplace adapter contract behavior
* matching
* deduplication
* API validation
* source failure isolation

Do not write tests that merely duplicate implementation details.

Marketplace fixtures should represent realistic responses without containing private user information or secrets.

---

# Marketplace Contract Tests

Once multiple adapters exist, shared behavior should be testable consistently.

An adapter should be expected to:

* identify its source
* accept supported search inputs
* return normalized listings
* preserve external IDs
* provide source URLs
* represent unavailable fields honestly
* produce predictable errors

Do not force an adapter to support capabilities its marketplace does not offer.

---

# Deployment

The server must eventually run independently from Expo development tooling.

Production server code must not require:

* Metro
* Expo Go
* a developer laptop
* the mobile app being open

Deployment configuration should support standard Node execution.

Do not tightly couple domain code to a specific hosting provider unless necessary.

Keep deployment-specific code near deployment/configuration boundaries.

---

# Production API

The production mobile application should communicate only with deployed DealDrop services.

Never ship:

```text
localhost
127.0.0.1
local network IPs
developer tunnel URLs
```

as the production API configuration.

Development builds may use local services through development-specific environment configuration.

---

# Backward Compatibility

Once beta clients exist, API changes must consider older mobile versions.

Do not casually rename or remove fields consumed by the released application.

Prefer additive changes when practical.

Breaking contracts require explicit planning.

---

# Performance

Do not optimize blindly.

Measure first.

Important marketplace performance signals include:

* source request duration
* normalization duration
* matching duration
* unified search latency
* worker job duration

Correctness and reliability come before micro-optimization.

---

# Implementation Process

Before modifying backend code:

1. Read `AGENTS.md`.
2. Read the full GitHub issue.
3. Inspect the current `server/`, existing worker code, relevant mobile services, and Supabase schema.
4. Determine which runtime owns the requested behavior.
5. Identify existing code that should be reused or moved.
6. Identify the smallest architecture change satisfying the issue.
7. State the expected files/modules to change.
8. Implement only that issue.
9. Run relevant tests and validation.
10. Review the diff for unrelated changes.

Do not create the architecture from memory without inspecting the repository first.

---

# Existing Worker Migration

DealDrop already has worker functionality inside the repository that is not compiled into the React Native bundle.

When moving existing worker behavior into the server application:

Preserve working behavior first.

Do not rewrite the entire worker simply because the folder changes.

Prefer:

```text
existing worker behavior
        ↓
move behind server boundary
        ↓
extract clear interfaces
        ↓
verify behavior
```

over:

```text
delete working worker
        ↓
rewrite from scratch
```

Refactor incrementally.

---

# Refactoring Rule

Refactor only when one of these is true:

* required for the current issue
* necessary to establish a required module boundary
* existing structure actively prevents correct implementation
* necessary to remove duplicated logic introduced by the current issue

Do not perform broad cleanup during marketplace integration issues.

---

# Dependency Rule

Before installing a server dependency, check:

1. Is it necessary for this issue?
2. Does the project already contain an equivalent?
3. Is it actively maintained?
4. Does it work with our Node runtime?
5. Does it unnecessarily couple us to a vendor?

Prefer fewer dependencies.

---

# Marketplace SDKs

Official marketplace SDKs are acceptable when they materially simplify supported API integration.

Do not introduce a heavy SDK when simple HTTP requests using an existing client are clearer.

Provider SDKs must remain isolated inside the relevant marketplace module.

---

# Feature Flags

Do not build a large feature flag system.

Marketplace availability may be configuration-driven when necessary so broken or incomplete adapters can be disabled without changing the mobile application.

Any such mechanism should remain simple.

---

# Source Provenance

Every normalized listing must retain its marketplace source and external identity.

DealDrop must always be able to determine:

* which marketplace provided the listing
* the provider's listing ID
* the original marketplace URL

Do not lose provenance during normalization or deduplication.

---

# Data Integrity

Protect against duplicate ingestion.

Prefer database-level uniqueness where appropriate in addition to application-level checks.

Do not rely exclusively on:

```text
SELECT then INSERT
```

when concurrent workers could create duplicates.

Use existing database constraints/upsert patterns when appropriate.

---

# Money

Never use floating-point assumptions carelessly for persisted monetary values.

Follow the existing schema conventions.

Always retain currency with price when multiple markets/currencies are possible.

Do not assume every listing uses USD.

---

# Dates and Time

Normalize server timestamps consistently.

Prefer UTC for persisted timestamps.

Marketplace timestamps may be missing or imprecise.

Do not invent exact listing times when a marketplace does not provide them.

Keep:

```text
listedAt
```

and:

```text
fetchedAt
```

conceptually distinct.

---

# Geography

Do not assume marketplace location formats are identical.

Normalize location only to the degree supported by available source data.

Distance calculations belong in DealDrop domain logic, not marketplace-specific presentation code.

Do not fabricate coordinates from vague locations without an explicit geocoding requirement.

---

# Pagination

Marketplace pagination mechanisms may differ:

* cursor
* page
* offset
* continuation token

Adapters should translate provider pagination into DealDrop's common search result model when needed.

Do not expose raw provider continuation implementation directly to mobile unless the common API explicitly supports an opaque cursor.

---

# Marketplace Capability Differences

Different marketplaces may support different filters.

DealDrop must not pretend otherwise.

If Facebook supports radius but another source does not, the adapter or capability system should make that explicit.

The unified search layer should decide how unsupported filters are handled according to the issue's requirements.

Do not silently apply fake filtering unless it can correctly be performed after normalization.

---

# Server-to-Mobile Contract

Responses should be predictable and serializable.

Do not send JavaScript `Date` objects directly.

Use standard serialized values such as ISO timestamps.

Keep response models independent of database ORM/client representations.

---

# Naming

Use DealDrop/domain terminology in shared modules.

Good:

```text
MarketplaceListing
MarketplaceAdapter
SearchCoordinator
ListingMatch
WatchlistMatcher
```

Avoid provider-specific terms in shared code:

```text
FacebookSearchResult
```

is appropriate inside Facebook code.

It is not appropriate as the type consumed by the unified matching engine.

---

# Comments and Documentation

Use comments for:

* provider quirks
* non-obvious mapping decisions
* external API limitations
* important reliability constraints

Do not comment obvious TypeScript.

If a marketplace has an unusual requirement, document why.

---

# Definition of Done for Backend Issues

Before reporting an issue complete:

* all explicit requirements are implemented
* only requested scope changed
* relevant existing behavior still works
* TypeScript passes
* linting passes
* formatting passes
* relevant tests pass
* new API behavior is manually or automatically verified where practical
* no server secrets were committed
* no server-only dependency was imported into React Native
* marketplace failures are handled intentionally
* logging is sufficient to debug the new path
* documentation/config examples are updated if required

If production deployment is part of the issue, also verify the deployed service rather than only local execution.

---

# Completion Report

At completion report:

## Changed

Briefly explain what was implemented.

## Files

List meaningful files/modules changed.

## Validation

Report exact checks run and whether they passed.

## Runtime Verification

State whether behavior was verified:

* locally
* against a sandbox provider
* against a live provider
* in deployed production/staging

Do not imply live verification if only mocks were used.

## Limitations

Report provider/API limitations directly related to the issue.

## Out of Scope

Mention significant tempting related work intentionally left untouched when useful.

Then stop.

Do not begin the next issue.

---

# Final Engineering Standard

Before finishing any DealDrop backend change, ask:

"Could I change one marketplace implementation tomorrow without rewriting the mobile application, matching engine, or other marketplace adapters?"

If the answer is no, inspect the boundary.

Then ask:

"If one marketplace fails in production, can I determine which one failed and why without reproducing the issue on my laptop?"

If the answer is no, improve observability within the current issue's scope.

Finally ask:

"Did I build what the issue requires, or what I imagined DealDrop might need six months from now?"

If it is the latter, remove the speculative complexity.
