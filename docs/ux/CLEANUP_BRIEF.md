# Global Mobile UI Cleanup — Excessive Text + Bottom Navigation Liquid Flow

Product owner brief, 2026-10-05. Binding for all UI work. This is a refinement, **not a redesign**: preserve branding, information architecture, navigation structure, colour direction (§107), icons, functionality, component architecture and reusable patterns. Do not change business logic, navigation behaviour, data models, APIs or state management (unless strictly required for the visual implementation). No new dependencies, no unrelated refactoring, no code comments, no git commits or pushes.

Only improve: (1) unnecessary/excessive user-facing copy, (2) visual density caused by that copy, (3) bottom navigation visual integration, (4) liquid-flow behaviour, (5) spacing affected by the above.

## Process

1. Inspect the app structure first: navigation, bottom nav, theme/tokens, typography, shared components (settings rows, list/section/card components, section descriptions, helper text, empty states, modal copy, tooltips, onboarding), glass and liquid-flow implementations, animations, spacing, responsive/safe-area handling. Decide what is shared and what is screen-specific before changing anything.
2. Build an internal audit of excessive text across ALL screens (Home, Tournaments, History, Settings, match/scoring, scorecards, modals, sheets, forms, empty states, error states, onboarding, statistics, any other user-facing screen) and classify each item **KEEP / SHORTEN / REMOVE**.
3. Fix shared text patterns/components first, then the shared bottom navigation, then remaining screen copy.
4. Run the app, inspect every major screen, check small and large phones, final consistency pass.

## Content density rule

For every piece of explanatory text ask: "Does the user actually need this sentence to understand or use this UI?" If not, remove it.

Six checks per screen: necessary? → explaining an obvious UI element? (remove) → explaining implementation details? (remove) → can the UI itself communicate it? (prefer UI) → longer than necessary? (one concise sentence or remove) → screen visually dominated by explanatory text? (reduce).

### Hierarchy

- **Level 1 — keep:** page/section titles, setting names, button and nav labels, important status, essential instructions.
- **Level 2 — short helper text, only when genuinely useful:** e.g. "Use solid backgrounds instead of glass effects."
- **Level 3 — long paragraphs:** very selectively, only when genuinely necessary to understand a complex feature or a consequential action. Never just because there is space.

### Never expose implementation detail

No "The tab bar uses…", "This component…", "The page uses…", "The system follows…", "This setting changes how our glass layer…", "The phone's accessibility setting also…", "Scores and tables are always rendered…", rendering/component/architecture explanations. The UI is for users, not developers.

### Before / after

- Reduce transparency — **Bad:** title + "Solid bars and sheets instead of glass." + a paragraph about tab bar, top bars, sheets, menus, bright sun, the phone setting and tables. **Better:** "Reduce transparency" + "Use solid backgrounds instead of glass effects."
- Default format — **Bad:** a description of what the default does. **Better:** "Default format" + the value "T20". If the value is obvious, no description.
- Scoring pad layout — **Bad:** "Left hand puts the WICKET key on the left side of the pad." **Better:** "Scoring pad layout" + "Left hand", or no description when the control makes it obvious.

Do not replace long explanations with slightly shorter long explanations. **Remove unnecessary words**, don't rewrite every paragraph. Title + control is enough when it is understandable; otherwise one concise sentence.

### Specific surfaces

- **Empty states:** "No matches yet" + optional "Create a match to get started." No multi-sentence explanations.
- **Modals:** title, short explanation only if necessary, controls, primary and secondary action. Paragraphs only for actions with meaningful consequences.
- **Settings:** setting title, short helper only if necessary, control. Never title + subtitle + long + technical + implementation notes.
- §98 "explain the automation" still applies to genuinely consequential tournament outcomes (qualification, impact previews) — keep the reason, but as a short headline with details behind a disclosure, never as inline paragraphs.

### Visual density and accessibility

Do NOT solve density by shrinking fonts, line height, touch targets or spacing — remove content instead; the result should feel spacious because there is less. Keep readable sizes, contrast, ≥44pt targets, accessible labels, screen-reader semantics, spacing and focus states. Accessibility labels may stay descriptive even when visible copy is removed.

## Bottom navigation (shared component — fix once at the source, no per-screen hacks)

**Problem:** it reads as a dark rectangular/translucent block pasted over the page with a highlighted active button — not one cohesive surface with a flowing liquid active state.

**Direction (preserve the liquid-flow concept and futuristic identity; never a standard Material bottom nav):** deep dark background, subtle glass/translucency, cyan/teal accent, soft controlled glow, fluid active-state movement, smooth transitions, premium sports-console feel. The active tab must feel part of the navigation surface.

Improve: background transparency, blur, border treatment, active-state shape and blending, liquid deformation, animation, spacing, icon and label positioning, safe-area handling, z-index/layering, clipping, shadow/glow, relationship between page background and the bar.

**Active state:** a liquid cyan region flowing through the surface — smooth edges, subtle curvature, controlled cyan glow, smooth transition between tabs; no harsh rectangle, no excessive brightness, no clipping artefacts, no disconnected floating pill; integrated, not placed on top.

**Don't overdo it:** no neon glow, huge cyan blobs, distracting or bouncing animation, excessive blur, continuous CPU-heavy animation, visual noise, exaggerated glass. Liquid glass + futuristic sports UI, not neon gaming UI.

**Validation on every screen reachable from the bar** (Home, Tournaments, History, Settings and their stacks): scrolling, long and short pages, modals, sheets, keyboard open, different screen heights, Android safe area, gesture navigation and 3-button navigation bar, light/dark/system. The bar must never cover important content, buttons or the last list item, overlap text, jump when scrolling, change height unexpectedly, or lose its liquid effect.

## Final quality gate

**Content:** no unnecessary explanatory paragraphs; settings, empty states and modals concise; no implementation details in user-facing UI; important instructions remain; nothing made smaller just to fit content.

**Bottom navigation:** no hard rectangular block; liquid flow visually integrated; active tab connected to the surface; cyan balanced; animation smooth and subtle; no excessive glow; no clipping; correct safe area; never covers content; consistent across all screens.

**Overall:** cleaner, less text-heavy, polished mobile product; identity, functionality and architecture preserved; no unnecessary dependencies; no unrelated refactoring.

Priority: **clear UI > concise copy > visual hierarchy > unnecessary explanation.**
