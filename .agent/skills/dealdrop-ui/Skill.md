---

name: dealdrop-ui
description: Design and implement polished, production-quality mobile interfaces for DealDrop using the existing React Native, Expo, NativeWind, and reusable component system. Use when creating or modifying screens, layouts, reusable UI components, visual states, navigation interfaces, forms, cards, feeds, watchlists, settings, onboarding, authentication, or other user-facing DealDrop interfaces.
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# DealDrop UI Skill

## Purpose

Create clean, intentional, production-quality mobile interfaces for DealDrop.

The output must look like a deliberately designed consumer application—not a collection of generic generated components.

Follow the current GitHub issue strictly. This skill does not grant permission to implement screens or features outside the supplied issue.

## Product Identity

DealDrop helps users monitor online marketplaces and receive alerts when matching deals appear.

The interface should communicate:

* Speed
* Trust
* Simplicity
* Opportunity
* Calm confidence

The app should feel modern and consumer-friendly without resembling a finance dashboard, admin panel, developer tool, or generic AI application.

## Visual Direction

DealDrop uses a clean light interface with white and soft purple as its visual foundation.

Use:

* White or near-white page backgrounds
* Soft neutral surfaces
* Light purple for selected and supportive elements
* Stronger purple for primary actions
* Dark neutral text
* Subtle gray borders
* Generous whitespace
* Soft rounded corners
* Restrained shadows

Do not:

* Use dark green
* Introduce unrelated brand colors
* Cover every element in purple
* Use excessive gradients
* Use glowing effects throughout the interface
* Use heavy shadows
* Make every card float
* Add decorative blobs without a functional reason
* Create an AI-dashboard appearance

Purple should guide attention rather than dominate the screen.

## Existing Design System

Before creating UI, inspect the existing reusable components under:

```text
src/components/ui/
```

Existing components include:

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

Reuse these components before creating alternatives.

Do not recreate buttons, inputs, cards, typography, loaders, or states inside feature folders.

Extend an existing reusable component only when the current issue has a real requirement that it cannot satisfy.

## Styling

Use NativeWind.

Use configured theme classes instead of arbitrary colors.

Use the shared `cn()` utility for merged or conditional classes.

Use Class Variance Authority when a reusable component genuinely needs visual variants.

Avoid inline styles unless a React Native API requires them.

Avoid arbitrary values such as:

```text
mt-[13px]
rounded-[19px]
text-[#8B5CF6]
```

Prefer the established spacing, radius, typography, and color scale.

If a required theme token is missing, add it to the central theme configuration rather than hardcoding it repeatedly.

## Screen Design Process

Before writing a screen:

1. Read the full GitHub issue.
2. Inspect existing components and related screens.
3. Identify the screen's primary user action.
4. Identify the information hierarchy.
5. Decide the loading, empty, error, and populated states.
6. Reuse the existing design system.
7. Implement only the states required by the issue.

Do not begin by creating JSX immediately.

## Information Hierarchy

Every screen should have one obvious primary purpose.

A user should understand within a few seconds:

* Where they are
* What information matters most
* What action they should take next

Use visual hierarchy through:

* Typography
* Spacing
* Grouping
* Contrast
* Position
* Size

Do not solve hierarchy by applying purple to everything.

## Layout Rules

Use consistent horizontal page padding.

Use deliberate vertical rhythm.

Group related content.

Separate unrelated content using spacing or the existing Divider.

Keep primary actions easy to reach.

Avoid filling every empty area.

Whitespace is part of the design.

Do not create deeply nested card layouts.

Avoid placing a card inside another card unless the product requirement clearly needs it.

## Typography

Use `AppText` for application typography.

Do not import React Native's `Text` directly for normal user-facing content unless the existing component cannot support a specific native requirement.

Use typography variants consistently:

* Display for rare high-impact headings
* Heading for screen titles
* Title for sections and important card content
* Subtitle for supporting headings
* Body for normal content
* Body-small or caption for metadata
* Label for form labels
* Error for validation messages

Do not use large bold text everywhere.

Do not create more typography variants without a concrete need.

## Buttons

Use the existing `Button`.

Each screen should normally have one visually dominant primary action.

Use:

* Primary for the main action
* Secondary for supportive actions
* Outline for lower-priority alternatives
* Ghost for quiet actions
* Danger only for destructive actions

Do not place several primary buttons beside each other.

Button labels should describe the action clearly:

Good:

* Create watchlist
* Save changes
* View listing
* Enable alerts

Avoid vague labels:

* Submit
* Continue, when the next action is unclear
* Click here
* Okay

## Forms

Use the existing `Input`.

Keep forms focused and short.

Place related fields together.

Use clear labels.

Use realistic placeholders only when they add context.

Show validation errors close to the relevant field.

Do not use placeholder text as the only field label.

The primary submit action should remain visually clear.

Do not create giant forms when the flow can reasonably be split into focused steps.

## Cards

Use the existing `Card`.

Cards should represent a meaningful grouped object, such as:

* A listing
* A watchlist
* A subscription option
* A profile summary

Do not wrap every section in a card.

Do not use cards as generic containers for an entire screen.

A listing card should prioritize:

1. Image
2. Listing title
3. Price
4. Location or distance
5. Source and time
6. Relevant state or action

## Lists and Feeds

List items should be easy to scan.

Keep repeated layouts consistent.

Do not repeat unnecessary labels in every item.

Use separators or spacing consistently.

Long text should not destroy the layout.

Include suitable loading, empty, and error states.

Avoid fake data in production implementation unless the issue explicitly requests fixtures or mock data.

## Empty States

Use the existing `EmptyState`.

Empty states should:

* Clearly explain why the screen is empty
* Tell the user what to do next
* Avoid blaming the user
* Include an action only when one is useful

Example:

Title:

```text
No watchlists yet
```

Description:

```text
Create a watchlist and DealDrop will alert you when a matching listing appears.
```

Action:

```text
Create watchlist
```

Avoid generic copy such as:

```text
Nothing here
```

## Error States

Use the existing `ErrorState`.

Explain the failure in simple language.

Offer a retry action where retrying is meaningful.

Do not expose raw Supabase errors, stack traces, HTTP codes, or internal implementation details to users.

## Loading States

Use the existing `Loading` component for full-screen loading where appropriate.

Prefer skeleton layouts for content-heavy screens only when the current issue requires them.

Do not add artificial loading animations.

Do not block the entire screen when only one section is loading.

## Navigation

Expo Router route files should remain thin.

Do not put substantial screen implementations directly inside route files.

Place feature screens under the relevant feature directory and export them through the route.

Navigation labels should use language users understand.

Do not expose internal technical names such as:

* Match engine
* Worker
* Listing ingestion
* Adapter

## Icons

Use one consistent icon library already installed in the project.

Do not mix unrelated icon styles.

Icons should clarify actions or categories, not decorate every row.

Use recognizable icons.

Do not use an icon without a label when the action might be ambiguous.

## Interaction Design

Interactive elements must look interactive.

Pressable areas should be comfortably sized.

Disabled states should be visibly disabled.

Destructive actions should not look like normal actions.

Do not hide important actions behind gestures only.

Use animation sparingly.

Animations should:

* Confirm an action
* Clarify a transition
* Show state change
* Improve perceived continuity

Do not animate elements merely because animation is possible.

## Mobile-First Requirements

Design for small screens first.

Avoid layouts that only work on one device width.

Avoid fixed widths for major containers.

Consider:

* Safe areas
* Keyboard overlap
* Long translations
* Long listing titles
* Large accessibility font sizes
* Loading states
* Network errors
* Empty results

Use scrolling deliberately.

Do not nest scrollable containers unnecessarily.

## Avoid Generic Generated UI

Do not produce interfaces that look like generic templates.

Avoid repeatedly using:

* Huge greeting headers
* Random gradient banners
* Decorative statistics with no product value
* Oversized cards for tiny amounts of content
* Excessive pill-shaped controls
* A card around every block
* Random emoji as primary visual design
* Placeholder charts
* Fake analytics
* Generic copy such as “Welcome back! Ready to get started?”
* Unrequested dashboards

Every visual element must support the user's current task.

## Product Copy

Use short, natural language.

Write like a helpful consumer product.

Do not use corporate language, AI jargon, or exaggerated marketing copy inside the application.

Good:

```text
We’ll alert you when a matching listing appears.
```

Avoid:

```text
Leverage intelligent monitoring to optimize your marketplace discovery workflow.
```

## States Required for UI Work

When implementing a user-facing feature, consider whether the issue requires:

* Default
* Loading
* Empty
* Error
* Disabled
* Selected
* Pressed
* Offline
* Permission denied
* Success

Do not implement unrelated states speculatively, but do not leave the required flow visually broken.

## Quality Check

Before completing UI work, inspect the result for:

* Consistent spacing
* Consistent alignment
* Clear hierarchy
* Correct component reuse
* No hardcoded theme colors
* No overflowing text
* No duplicated UI primitives
* Useful loading, empty, and error handling
* Clear primary action
* Reasonable behavior on a small phone screen
* No unrelated feature work

Run the relevant linting, formatting, and type-checking commands.

When possible, launch the app and inspect the interface rather than assuming it looks correct from the code alone.

## Completion Report

When finishing a UI task, report:

1. Screens or components implemented
2. Existing design-system components reused
3. New reusable components introduced, with justification
4. Visual states handled
5. Validation commands run
6. Anything that could not be visually verified

Stop after completing the supplied GitHub issue.
