# Scorebook — Offline Cricket Score Counter & Tournament Manager

Product spec: [docs/SPEC.md](docs/SPEC.md) (sections referenced as §N). Design docs live in `docs/`. Also read [AGENTS.md](AGENTS.md) for Expo SDK notes (this is **Expo SDK 57**, React Native 0.86, React 19.2, TypeScript 6, Expo Router with routes in `src/app/`).

## Commands

```bash
npx tsc --noEmit        # typecheck — must be clean before any task is done
npx jest                # all tests
npx jest src/domain     # domain tests only (fast)
npx expo export --platform android --output-dir .expo-export-check   # verify the bundle builds (delete the dir after)
```

**Do not run `npm install`, `npx expo install`, or otherwise change dependencies.** All dependencies are preinstalled (expo-sqlite, zustand, lucide-react-native, react-native-svg, react-native-gifted-charts, expo-print, expo-sharing, expo-haptics, expo-file-system, expo-document-picker, expo-crypto, @react-native-async-storage/async-storage, react-native-reanimated, expo-keep-awake, expo-audio, expo-glass-effect, expo-blur, @expo-google-fonts/inter, @expo-google-fonts/barlow-condensed; dev: jest-expo, @testing-library/react-native, sql.js). If something is genuinely missing, say so in your result instead of installing it.

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
- Tests: `__tests__/*.test.ts(x)` next to the code. DB tests use the sql.js adapter with `/** @jest-environment node */`.
- IDs are string UUIDs; timestamps are ISO-8601 strings; overs are stored/computed as **legal ball counts** (integers) and only formatted as `16.4` at the edge.
- Path alias `@/` → `src/`.
