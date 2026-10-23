# Scorebook — Offline Cricket Score Counter & Tournament Manager

Product spec: [docs/SPEC.md](docs/SPEC.md) (sections referenced as §N). Design docs live in `docs/`. Also read [AGENTS.md](AGENTS.md) for Expo SDK notes (this is **Expo SDK 57**, React Native 0.86, React 19.2, TypeScript 6, Expo Router with routes in `src/app/`).

## Commands

```bash
npx tsc --noEmit        # typecheck — must be clean before any task is done
npx jest                # all tests
npx jest src/domain     # domain tests only (fast)
npx expo export --platform android --output-dir .expo-export-check   # verify the bundle builds (delete the dir after)
```

**Do not run `npm install`, `npx expo install`, or otherwise change dependencies.** All dependencies are preinstalled (expo-sqlite, zustand, lucide-react-native, react-native-svg, react-native-gifted-charts, expo-print, expo-sharing, expo-haptics, expo-file-system, expo-document-picker, expo-crypto, react-native-reanimated, expo-keep-awake, expo-glass-effect, expo-blur, expo-build-properties, @react-native-community/datetimepicker, @expo-google-fonts/inter, @expo-google-fonts/barlow-condensed; dev: jest-expo, @testing-library/react-native, sql.js, @resvg/resvg-js). If something is genuinely missing, say so in your result instead of installing it.

## Architecture (§60, §103)

Strict layering — dependencies only point downward:

```
src/app/            Expo Router routes. Thin: read params, render a feature screen. No logic.
src/features/<x>/   Screens + feature components (match-setup, scoring, scorecard, history, tournament, settings…)
src/ui/             Design system: theme tokens, typography, primitives (Button, Text, Sheet, Table…). No domain imports.
src/stores/         Zustand stores (one per concern, selector-based). Call services only.
src/services/       Application services: orchestrate domain + repositories inside SQLite transactions.
src/domain/         PURE TypeScript. No React, no Expo, no SQLite, no Date.now()/Math.random() (inject clock / RNG).
  types/            Domain types and contracts shared by everything.
  scoring/          Cricket rules engine: event replay, validation, stats (batting, bowling, partnerships, FoW).
  tournament/       Fixtures, pools, standings, NRR, tie-breakers, qualification, knockout, what-if.
src/db/             SQLite client, migrations, repositories, row⇄domain mappers. Only layer that writes SQL.
src/export/         PDF scorecard HTML builders, JSON backup/restore (validation in domain or here, IO via services).
```

Rules:
- dont write code comments any where 
- The match event log is the **authoritative** source for scoring (§14, §59). Every score, stat, standing, and NRR value is derived from it by the domain engine. Cached summary columns are recomputable projections, never the truth.
- UI never imports from `src/db`. Screens never compute cricket maths themselves — they render values from domain selectors.
- Every write that changes match or tournament state happens in one SQLite transaction (§89).
- Tournament rules (points, tie-breakers, qualification, NRR mode) are data, never hard-coded (§40–§44, §97).
- Any change that affects completed matches/standings produces an impact preview first and an audit-log entry (§34, §53, §99).
- Colors only from semantic theme tokens (§71). No hex literals in feature code.
- Liquid glass (§106): floating chrome (tab bar, headers, sheets, dialogs, toasts, scoring dock) uses the `src/ui` glass primitives only — never raw `GlassView`/`BlurView` in features. Content (tables, lists, forms) stays on solid surfaces. Reduce Transparency must always fall back to opaque.
- UI consistency (no design drift — these are hard rules for every screen):
  - Typography: only `<Text variant=…>` from `@/ui` (scale in `src/ui/typography/variants.ts`). No `fontSize`/`fontWeight`/`fontFamily` in features. Nothing below 12pt (`MIN_TEXT_SIZE`).
  - Spacing: only `space.*` tokens (4/8/12/16/20/24/32/40/48) and `StyleSheet.hairlineWidth`; no other numeric padding/margin/gap. Screen gutters and max content width come from `Screen` — never set page-level horizontal padding in a feature.
  - Components: never invent an interactive control in a feature. Buttons, chips, choice lists (radio/checkbox), segmented controls, rows, steppers, tabs, sheets, dialogs, fields and tables come from `src/ui` primitives. If one is missing or lacks a variant, it is added to `src/ui` (design-system owner) and then reused — features do not wrap raw `Pressable`.
  - One pattern per job: selection is always shown the same way (check + fill + label weight, never colour alone); single-choice lists are radios, multi-choice are checkboxes; destructive actions use the danger variant; disabled controls are visually quieter than enabled ones.
  - Screen sizes: every screen must work at 320, 390, 820 and 1024 wide and at large text. Adapt via `useLayoutClass()` (`compact-s` <360, `compact`, `medium` ≥600, `expanded` ≥768); key content (team names, scores) is never truncated away.
  - Proven mobile patterns over invented ones: dates/times via pickers, never typed ISO strings; dismissing a sheet never silently discards input; the primary action of a step is visible without scrolling; after a submit, go to the next logical screen (never snap to the top of the same screen); repeated entry (adding players) keeps the sheet open for the next item.
- Copy and bottom navigation follow the owner's binding brief [docs/ux/CLEANUP_BRIEF.md](docs/ux/CLEANUP_BRIEF.md): remove unnecessary words (title + control is often enough), never explain implementation details to users, concise settings/empty states/modals, and one integrated liquid bottom-nav surface fixed at the shared component. Never commit or push to git.
- Microcopy (mobile scannability — no walls of text):
  - Buttons and tabs: 1–3 words, verb first ("Start match", "Undo"). Titles ≤ 4 words. Row labels ≤ 1 line.
  - Status and warnings: a short headline (≤ ~40 chars, the fact or the consequence) plus at most one supporting line (≤ ~80 chars). Anything longer — §98 "why" explanations, impact details, rule descriptions — goes behind a "Why?" / "Details" disclosure or a detail sheet, never inline in lists or tables.
  - Never repeat in a sentence what a chip, badge or column already says. Prefer numbers and short noun phrases over prose ("Needs 12 off 9" not "The batting side needs twelve more runs from nine balls").
  - Domain/services return structured explanations (headline + detail) rather than one long sentence, so the UI can show the headline and disclose the rest.
- Text layout:
  - Alignment: body text, labels and form fields are left-aligned (start-aligned); numbers in tables and score figures are right-aligned on a shared edge; centre alignment only for hero score figures, scoring keys, empty-state blocks and single CTA labels. Never mix alignments within one block.
  - Design for the longest real string (e.g. "Northside Strikers v Riverside Lions", 30+ char player names, large text at 1.3×+): containers grow vertically or wrap (`flexShrink: 1`, `flexWrap`) instead of clipping; `numberOfLines` only on secondary text, never on the content the screen exists for (team names in standings, scores). Buttons never grow into giant blocks — shorten the label instead.
  - No horizontal page overflow ever: no fixed widths wider than their content needs, numeric columns sized to their content, wide tables use the `Table` primitive's horizontal scroll with an affordance. Fixed widths only for icons, markers and tabular number cells.
- Keyboard: every text input must stay visible while typing. Full-page forms use `Screen`'s keyboard-aware scrolling (the focused field scrolls into view above the keyboard and any glass dock; Android is edge-to-edge in SDK 57, so never rely on `adjustResize`); sheets/dialogs use the `Sheet`/`Dialog` primitives (already keyboard-aware). The primary action stays reachable with the keyboard open, `keyboardShouldPersistTaps="handled"`, return key moves to the next field / submits, numeric fields use numeric keyboards, and dismissing the keyboard never loses input.
- Reanimated: everything that runs on the UI runtime — `useAnimatedStyle`, `useAnimatedProps`, `useDerivedValue`, `useAnimatedReaction`, gesture callbacks — may only call functions that start with the `'worklet'` directive (or Reanimated's own helpers such as `interpolate`/`interpolateColor`). Helpers shared between JS and UI threads get `'worklet'` too, plus a test asserting `__workletHash` is defined. Calling back into React state from the UI runtime goes through `scheduleOnRN`/`runOnJS`. Otherwise the app crashes with "Tried to synchronously call a non-worklet function … on the UI thread". Never give a worklet a default parameter that reads an outside value (`size = ICON_SIZE`): on the UI runtime defaults are evaluated before the closure is unpacked, so it crashes with "Property 'ICON_SIZE' doesn't exist" — make the parameter optional and resolve it in the body (`(size ?? ICON_SIZE)`). Test worklets via `__initData.code` / `__closure` as in `src/ui/navigation/__tests__/liquidWorklets.test.ts`.
- Tests: `__tests__/*.test.ts(x)` next to the code. DB tests use the sql.js adapter with `/** @jest-environment node */`.
- IDs are string UUIDs; timestamps are ISO-8601 strings; overs are stored/computed as **legal ball counts** (integers) and only formatted as `16.4` at the edge.
- Path alias `@/` → `src/`.
