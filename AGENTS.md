
# AGENTS.md

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.



## Project

DealDrop is a React Native mobile application that monitors online marketplaces and notifies users when listings match their saved watchlists.

The initial marketplace is Facebook Marketplace. The architecture should allow additional marketplace adapters later without redesigning the mobile application.

## Current Stack

* React Native
* Expo
* Expo Router
* TypeScript
* NativeWind
* Supabase
* TanStack Query
* Zustand
* React Hook Form
* Zod
* Class Variance Authority
* OneSignal later for push notifications

## Issue-Only Workflow

Only work on the GitHub issue explicitly provided in the current task.

Do not:

* Begin another issue.
* Implement future milestone features.
* Add speculative functionality.
* Expand the scope because a related improvement seems useful.
* Refactor unrelated files.
* Create screens, services, database tables, or abstractions not required by the issue.
* Add dependencies unless the issue requires them.
* Complete unchecked work from another issue.

Before editing code:

1. Read the entire issue.
2. Identify its requirements and definition of done.
3. Inspect the relevant existing files.
4. State which files are likely to change.
5. Implement only the requested scope.

If the issue is missing important information, report the missing information instead of inventing product requirements.

When the requested issue is complete, stop. Do not continue to the next issue.

## Preserve Existing Work

Do not rewrite working code merely to match personal preferences.

Do not rename, move, or delete unrelated files.

Keep changes small and focused.

Use the existing architecture, design system, utilities, and conventions before creating replacements.

## MVP Discipline

Prefer the simplest implementation that satisfies the current issue.

Avoid:

* Premature optimization.
* Unrequested abstractions.
* Future-proofing without a current requirement.
* Adding optional features.
* Building systems that are not yet used.

A simple complete implementation is better than a complex speculative one.

## Project Structure

Use the existing structure:

```text
src/
├── app/
├── components/
│   └── ui/
├── constants/
├── features/
├── hooks/
├── lib/
├── providers/
├── services/
├── store/
├── types/
└── utils/
```

Do not create new top-level folders without a clear requirement from the current issue.

Expo Router files inside `src/app` should remain thin. Feature implementation should live inside the relevant feature folder.

## Feature Structure

Feature-specific code belongs under:

```text
src/features/<feature-name>/
```

A feature may contain only the folders it currently needs, such as:

```text
components/
hooks/
screens/
services/
types/
```

Do not create empty folders merely to satisfy a theoretical structure.

## Reusable UI Components

Generic components belong in:

```text
src/components/ui/
```

Existing reusable components include:

* AppText
* Avatar
* Button
* Card
* Divider
* EmptyState
* ErrorState
* Input
* Loading
* SearchBar

Reuse these before creating feature-specific replacements.

Reusable UI components generally follow:

```text
Component/
├── Component.tsx
├── Component.types.ts
├── component.variants.ts
└── index.ts
```

Only create a variants file when the component genuinely has variants.

## Styling

Use NativeWind for styling.

Use the project theme classes instead of hardcoded colors or spacing.

Use the shared `cn()` utility when merging conditional classes.

Use Class Variance Authority for components with variants.

Avoid inline style objects unless a React Native API cannot reasonably be handled with NativeWind.

Do not create a second competing theme system.

## TypeScript

TypeScript strict mode is enabled.

Rules:

* Do not use `any` without a documented reason.
* Prefer explicit domain types.
* Use `import type` for type-only imports.
* Type component props.
* Handle nullable values deliberately.
* Do not silence errors using unsafe assertions unless the reason is clear.
* Prefer small, readable interfaces over complicated generic types.

## Imports

Use the configured path alias:

```ts
import { Button } from "@/components/ui/Button";
```

Avoid long relative imports such as:

```ts
import { Button } from "../../../../components/ui/Button";
```

Follow the existing import ordering and formatting conventions.

## React Native

Use functional components and hooks.

Keep business logic out of route files and reusable UI components.

Do not introduce global state for local component state.

Avoid unnecessary effects and duplicated derived state.

Use Expo-compatible packages and installation commands where appropriate.

## State Management

Use:

* TanStack Query for remote/server state.
* Zustand for shared client-only state.
* React state for local component state.
* Supabase Auth for authentication state.

Do not copy server data into Zustand without a concrete requirement.

## Supabase

Use the single shared client from:

```text
src/lib/supabase.ts
```

Never create another Supabase client.

Never expose or use a service-role key in the mobile application.

Read public Supabase configuration from environment variables.

Database tables, RLS policies, storage policies, and migrations must only be added when required by the current issue.

## Error Handling

Do not silently ignore errors.

Show user-friendly messages in the UI where appropriate.

Keep technical details in development logs rather than exposing them to users.

Handle loading, empty, error, and success states deliberately.

Reuse the existing feedback components where applicable.

## Dependencies

Before adding a dependency:

1. Confirm the current issue requires it.
2. Check whether the project already has a suitable solution.
3. Prefer Expo-compatible packages.
4. Avoid installing packages for possible future use.

Do not replace existing libraries without an explicit request.

## Code Quality

Prefer:

* Small focused functions.
* Clear naming.
* Composition.
* Early returns.
* Reusable existing components.
* Straightforward control flow.

Avoid:

* Clever one-liners that reduce readability.
* Large components with unrelated responsibilities.
* Duplicated business logic.
* Unnecessary comments.
* Generic junk-drawer files.

Comments should explain intent or non-obvious constraints, not repeat what the code already says.

## Validation

Before reporting completion, run the checks relevant to the change:

```bash
npm run lint
npm run format:check
npx tsc --noEmit
```

Also run any issue-specific tests or validation commands that exist.

Do not claim a check passed unless it was actually run successfully.

If a check cannot run, report why.

## Completion Report

At the end of every task, provide:

1. A brief summary of what changed.
2. The files changed.
3. The checks run and their results.
4. Any unresolved blocker directly related to the issue.

Do not suggest or begin the next issue unless explicitly asked.

## Definition of Done

Work is complete only when:

* Every requirement in the provided issue is satisfied.
* The issue's definition of done is met.
* The code compiles or type-checks.
* Linting passes.
* Formatting passes.
* Existing architecture and conventions are followed.
* No unrelated feature or refactor was introduced.
* The final response accurately reports what was and was not verified.
