# Component Architecture

How the UI layer (`src/app`, `src/features`, `src/ui`) is composed on top of the store contracts in `src/stores/contracts.ts`. Owners: WP-design-system (`src/ui`, root and tab layouts), WP-match-ui (home, match-setup, scoring, scorecard, history, teams), WP-tournament-ui (tournament), WP-export (settings). Routes are listed in [ARCHITECTURE.md §9](../architecture/ARCHITECTURE.md#9-navigation-expo-router-srcapp); this document defines what renders inside them.

Contents: 1 rules · 2 feature folder layout · 3 app shell · 4 match screens · 5 live scoring in depth · 6 tournament screens · 7 settings screens · 8 shared feature components · 9 re-render strategy (§88) · 10 responsive, accessibility, feedback · 11 testing.

---

## 1. Rules

1. **Routes are thin.** A file in `src/app` reads params with `useLocalSearchParams` and renders exactly one feature screen: `export default function Score() { return <ScoringScreen />; }`. Layout files open the aggregate the nested routes share (`match/[matchId]/_layout.tsx` calls `useLiveMatchStore.getState().open(matchId)` in an effect and `close()` on unmount; `tournament/[tournamentId]/_layout.tsx` does the same with `useTournamentStore`).
2. **Screens read stores, components read props.** Only `*Screen` components and a few container components (named `…Container`) call store hooks. Everything under `components/` and `sheets/` is a pure function of its props, so it renders in RNTL without stores.
3. **No cricket maths in components.** Numbers come from `MatchState` / `TournamentEvaluation`; text comes from the domain formatters. Screens call **view-model selectors** (`src/features/<x>/selectors.ts`) that map domain state to display strings with the domain helpers, and hand strings to components.
4. **Domain functions the UI may call** (pure, no I/O): `scoring/format` (all), `scoring/replay#currentInnings`, `scoring/result#formatResult` and `#matchStatusLabel`, `scoring/validate#allowedDismissals`, `scoring/stats#worm`, `#manhattan`, `scoring/commands` intent constructors, `tournament/evaluate#resolveFixtureTeams`, `tournament/tiebreakers#describeTieBreakerChain`, `tournament/slots#explainEntryRules`, `tournament/stateMachine#tournamentEditPolicy` and `#matchEditPolicy` (to choose allowed / warn / confirm UI). Nothing else from `domain/` and nothing from `services/` or `db/`.
5. **Theme tokens only.** Components take no colour props; they read `useTheme()` tokens (`surface`, `textPrimary`, `accent`, `danger`, `score`…). State is never colour-only: every status has text and an icon (lucide) plus an `accessibilityLabel`.
6. **One interaction model for risky changes.** Anything whose policy is `warn`/`confirm` goes through `ImpactSheet` (§8): preview → [Cancel] [Continue] → optional reason → apply with the kept `ChangePreview`.

## 2. Feature folder layout

```
src/features/<feature>/
  screens/        one component per route (XxxScreen.tsx)
  components/     presentational pieces, props only
  sheets/         bottom sheets and dialogs, props only
  selectors.ts    view-model selectors (pure, memoised by reference)
  hooks/          feature hooks (feedback, keep-awake, form state)
  __tests__/      RNTL tests with mocked stores
```

View-model selectors are plain functions `(state) => ViewModel`. Those returning objects are consumed with `useShallow` (zustand v5, `zustand/react/shallow`) so a screen re-renders only when a displayed field changes. Selectors that derive large structures (tables, brackets) memoise on the input object reference with a module-level `WeakMap`, so several components reading the same evaluation share one computation.

## 3. App shell

```
app/_layout.tsx                      RootLayout
└─ FontsGate                          @expo-google-fonts/inter, barlow-condensed
   └─ ThemeProvider                   useSettingsStore(s => s.settings.theme) + useColorScheme()
      └─ BootstrapGate                useAppStore(s => s.status), s.error; bootstrap() once
         ├─ SplashView                status loading
         ├─ ErrorState                status error: "Couldn't open your scorebook data. [Try Again]" (§86)
         └─ Stack (expo-router)
            ├─ (tabs)/_layout.tsx     Tabs: Home · Tournaments · History · Settings
            └─ ToastHost              useToastStore(s => s.toasts)
```

| Component | Props | Store usage |
|---|---|---|
| `BootstrapGate` | `children` | `useAppStore(s => s.status)`, `s.error`; calls `bootstrap()`; on success calls `useHomeStore.getState().load()` |
| `ThemeProvider` | `children` | `useSettingsStore(s => s.settings.theme)`; exposes tokens via context; switching theme does not remount screens |
| `ToastHost` | — | `useToastStore(s => s.toasts)`, `dismiss` |

## 4. Match screens

### 4.1 Home (`(tabs)/index.tsx`, §5, §23, §79)

```
HomeScreen                              useHomeStore(useShallow(s => ({status, resumable, recent, tournaments})))
├─ Greeting / AppTitle
├─ NewMatchButton                       → router.push('/match/new')
├─ ResumePrompt                         shown once per launch when useAppStore report.resumable is non-empty
│   props: { match: MatchListItemVM; onResume; onSaveExit; onDiscard | null }
├─ ContinueMatchList                    resumable (incl. SAVE & EXIT-dismissed)
│   └─ MatchCard × n
├─ RecentMatchesList → MatchCard × n
└─ TournamentsPreview → TournamentRow × n (+ EmptyState "No tournaments yet …" §87)
```

`MatchCard` props: `{ title: string; teamA: SideLine; teamB: SideLine; statusLabel: string; resultLine: string | null; oversLabel: string; dateLabel: string; onPress(): void }` where `SideLine = { name: string; score: string | null }` (e.g. `"142/4 (16.4)"`), built by `selectMatchCard(item)` with `formatScore`, `formatOvers`, `formatResult`, `matchStatusLabel`. `ResumePrompt` renders `MATCH IN PROGRESS / Pakistan XI 142/4 16.4 overs / [RESUME] [SAVE & EXIT] [DISCARD]`; DISCARD is absent (`onDiscard = null`) for tournament matches and asks for confirmation.

### 4.2 Match setup wizard (`match/new/*`, §6–§8, §64)

All steps share `useMatchSetupStore` (in-memory draft). Each step screen subscribes to the slice it edits.

```
MatchInfoStep (index.tsx)               draft.title, formatId, rules, venueId, scheduledDate/Time
├─ FormatPresetPicker                   props: { presets: FormatPreset[]; selectedId; onSelect }
├─ OversPicker                          props: { value: number; quickPicks: number[]; onChange }  (OVERS_QUICK_PICKS + custom)
├─ RulesEditor                          props: { rules: MatchRules; issues: RulesIssue[]; onChange }  (wide/no-ball penalties,
│                                        free hit, powerplays, quota mode, super over, mandatory retirement, last man stands)
└─ VenuePicker
TeamsStep                               draft.teamAId/teamBId, teamAPlayers/teamBPlayers
└─ TeamPicker × 2 + SideSizeStepper (uneven sides)
PlayersStep                             draft.squadA/B, substitutesA/B
└─ SquadEditor × 2                      props: { players: PlayerOption[]; selected: PlayerId[]; substitutes: PlayerId[];
                                                 onToggle; onToggleSubstitute; onAddPlayer(name) }
TossStep                                draft.toss (optional, "Not recorded" allowed)
OpenersStep                             draft.openers → submit()
└─ OpenerPicker (striker, non-striker, bowler)  → router.replace(`/match/${id}/score`)
```

`RulesEditor` shows `validateRules` issues inline (errors block Next, warnings like `BOWLER_QUOTA_TOO_LOW` are shown). A fixture-started setup (`startFromFixture`) renders teams and rules locked with the text "Set by the tournament".

### 4.3 Scorecard, ball log, edit, analytics, manage (`match/[matchId]/*`)

All read `useLiveMatchStore(s => s.live)`; they never recompute cards.

```
ScorecardScreen
├─ ResultBanner                         { resultLine; statusLabel; tossLine }
├─ InningsTabs                          one tab per innings; super overs in a separate "Super Over" tab
└─ InningsCard                          props: { vm: InningsCardVM }
    ├─ BattingTable                     rows: { name; dismissal; runs; balls; fours; sixes; sr }[]
    ├─ ExtrasLine / TotalLine           "Extras 12 (b 1, lb 3, w 6, nb 2, p 0)" · "Total 165/7 (20 ov, RR 8.25)"
    ├─ DidNotBatLine / AbsentLine
    ├─ FallOfWicketsLine                "1-18 (Ahmed, 0.5), 2-54 (Ali, 6.2)"
    ├─ BowlingTable                     rows: { name; overs; maidens; runs; wickets; econ; wd; nb }[]
    └─ PartnershipList
BallLogScreen                           FlatList of over groups; row tap → edit/[seq]
└─ OverGroup { overLabel; bowlerNames; tokens; rows: BallLogRowVM[] }
EditBallScreen (edit/[seq].tsx)         local draft of the replacement + previewHistoryEdit via the store's service facade
├─ BallEditor                           same pad/extras/wicket components as live scoring, in "edit" mode
├─ KeepLaterBattersToggle               shown when the preview re-stamps later deliveries (SCORING_ENGINE §11.2)
├─ WhatWillChange                       before/after score, cards, result; tournament ImpactSummary when present
└─ ReasonField + ConfirmBar             reason required for completed / tournament matches
AnalyticsScreen                         worm(state), manhattan(innings), partnerships → ui/charts wrappers
ManageMatchScreen                       details, rules (confirm), overs revision, suspend/resume, end match
```

`EditBallScreen` and `ManageMatchScreen` use the `LiveMatchStore` actions added for gap G-1: `previewHistoryEdit(ops) → HistoryEditPreview | null`, `applyHistoryEdit(ops, reason, preview)`, `updateDetails`, `updateRules`, `setToss`, `setPrePlayStatus` and `removeSquadPlayer`. Ending a match stays `dispatch(end_match)`. The edit screen keeps the returned `HistoryEditPreview` and passes it back whole (the store sends its `baseFingerprint`), mirroring the tournament `ChangePreview` pattern.

### 4.4 History and teams

```
HistoryScreen                           useMatchHistoryStore(useShallow(s => ({status, items, query})))
├─ SearchField + FilterChips (status, tournament, team) + SortMenu (recent / oldest / scheduled)
└─ FlatList<MatchCard>                  onEndReached → loadMore(); swipe-free delete via row menu (§72: no hidden gestures)
TeamsScreen → FlatList<TeamRow>; TeamDetailScreen → PlayerList + AddPlayerRow
```

The team library, the match-setup team/venue pickers and the tournament wizard's team picker read `useTeamLibraryStore` (`TeamLibraryStore`, gap G-3): `teams`, `venues`, `detail`, `load({ search, includeArchived })`, `loadTeam(id)`, `createTeam`, `updateTeam`, `archiveTeam`, `addPlayer`, `updatePlayer`, `archivePlayer`, `createVenue`, `archiveVenue`. The create actions resolve the new row, so a picker can select it at once.

## 5. Live scoring in depth (`match/[matchId]/score.tsx`, §9–§21, §73)

### 5.1 Tree (phone)

```
ScoringScreen                                          container: subscribes per child, see §5.3
├─ RepairBanner                    { visible }          state.needsRepair → "This match needs repair" + [Open ball log]
├─ SuspendedBanner                 { reasonText }       state.suspension
├─ ScoreHeader                     ScoreHeaderVM        priority 1 (§73)
├─ CurrentOverStrip                { overLabel; tokens } priority 2
├─ BatterPanel                     { striker; nonStriker; lone; onSwapStrike }   priority 3
│   └─ BatterRow × 2               BatterRowVM
├─ BowlerLine                      BowlerLineVM         priority 4
├─ RetirementBanner                { due; onRetire }     advisory mandatory retirement
├─ ScoringPad                      { disabled; onIntent; onOpenExtras; onOpenWicket }   priority 6
│   └─ RunButton × 6 (0 1 2 3 4 6) + ExtrasButton + WicketButton
├─ SecondaryActions                { canUndo; canRedo; onUndo; onRedo; onMore }        priority 7
├─ PendingActionHost               { pendingAction; names }   renders exactly one prompt sheet
│   ├─ StartInningsSheet           { suggestedTeam; batters; bowlers; onSubmit(start_innings) }
│   ├─ BatterPickerSheet           { position; candidates; canEndInnings; onPick; onEndInnings; onAddPlayer }
│   ├─ BowlerPickerSheet           { eligible; ineligible: { name; reasonText }[]; onPick }
│   ├─ ResumePlayBar               { reasonText; onResume; onReviseOvers; onEndMatch }
│   ├─ ConfirmResultSheet          { resultText; onConfirm; onUndoLastBall }
│   └─ ResolveTieSheet             { options; nextRound; onSuperOver; onAcceptTie; onDecideOther }
└─ Sheets opened by the pad / More menu
    ├─ ExtrasSheet                 { wide: WideRule; noBall: NoBallRule; onSubmit(intent) }
    ├─ WicketSheet                 WicketSheetProps
    ├─ ReviseOversSheet            { innings; currentMaxBalls; ballsBowled; isChase; suggestTarget; onSubmit }
    ├─ PenaltySheet                { teams; defaultInnings; onSubmit }
    ├─ SuspendSheet / EndInningsSheet / EndMatchSheet / ChangeBowlerSheet (injury / suspended)
    └─ AddPlayerSheet              { teamName; onSubmit(newPlayer, isSubstitute) }
```

### 5.2 Key props

```ts
interface ScoreHeaderVM {
  readonly battingTeam: string;
  readonly inningsLabel: string;
  readonly score: string;
  readonly overs: string;
  readonly crr: string;
  readonly chase: { readonly target: string; readonly requirement: string; readonly rrr: string } | null;
  readonly freeHit: boolean;
  readonly powerplay: string | null;
}

interface BatterRowVM {
  readonly playerId: string;
  readonly name: string;
  readonly runs: string;
  readonly balls: string;
  readonly boundaries: string;
  readonly isStriker: boolean;
}

interface BowlerLineVM {
  readonly name: string;
  readonly figures: string;
  readonly economy: string;
  readonly quotaNote: string | null;
}

interface WicketSheetProps {
  readonly dismissals: readonly DeliveryDismissalType[];
  readonly striker: PlayerOption;
  readonly nonStriker: PlayerOption | null;
  readonly fielders: readonly PlayerOption[];
  readonly keeperId: string | null;
  readonly nextBatters: readonly PlayerOption[];
  readonly defaultNextBatterId: string | null;
  readonly onSubmit: (intent: ScoringIntent) => void;
  readonly onClose: () => void;
}

interface PlayerOption {
  readonly id: string;
  readonly label: string;
  readonly isSubstitute: boolean;
}
```

Values are strings (`"42"`, `"(24)"`, `"3.4-0-28-2"`, `"ECO 7.00"`, `"Need 23 from 14 balls"`) produced by `selectHeaderVM`, `selectBatterRows`, `selectBowlerLine` with `formatScore`, `formatOvers(…, { alwaysShowBalls: true })`, `formatRate`, `formatBowlingFigures`, `formatRequirement`. `BatterRow` marks the striker with a bat-edge marker icon **and** the accessibility label "Ali, on strike, 42 off 24" (§11: not only an asterisk).

`WicketSheet` flow (§18): step 1 lists `allowedDismissals(call, isFreeHit)`; for bowled / lbw / hit wicket the tap submits with `defaultNextBatterId` preselected (2 taps from the pad: WICKET → Bowled); caught / stumped show a fielder grid (substitutes labelled "sub"; "Unknown" option) whose tap submits (3 taps: WICKET → Caught → Rizwan); run out adds "Who is out?" and "At which end?" and the completed runs. The preselected next batter is visible and changeable before the final tap ("Next: Cara ▾").

### 5.3 Store usage on the scoring screen

| Consumer | Selector | Equality |
|---|---|---|
| `ScoreHeader` | `selectHeaderVM(s)` | `useShallow` |
| `CurrentOverStrip` | `s => currentInnings(s.live.state)?.currentOver` then tokens | reference (engine keeps completed overs stable; the current over changes every ball, which is intended) |
| `BatterPanel` | `s => selectBatterRows(s)` returning `[strikerVM, nonStrikerVM]` built from row objects cached per `BattingCardRow` reference | `useShallow` on the pair |
| `BowlerLine` | `selectBowlerLine(s)` | `useShallow` |
| `ScoringPad` | `s => !s.live?.state.canRecordDelivery` and `s.dispatch` | primitive / stable action |
| `SecondaryActions` | `s => (s.live?.events.length ?? 0) > 0`, `s => s.redoStack.length > 0` | primitives |
| `PendingActionHost` | `s => s.live?.state.pendingAction` | reference (new object only when the prompt changes) |
| `RetirementBanner` | `s => s.live?.state.retirementsDue` | reference |
| Error toast | `s => s.error` → `useToastStore.getState().show(...)` in an effect | reference |

`ScoringPad` never re-renders on a ball: its only inputs are `disabled` and the store's action functions (stable for the store's lifetime).

### 5.4 Dispatch pipeline from the UI

1. A tap calls `dispatch(intent)` and returns immediately (no `await` in the handler).
2. The store serialises: intents enter a FIFO; each is turned into events with `buildEvents(setup, state, intent)` **when dequeued**, against the state committed by the previous intent (two quick taps "1" then "4" produce the right strikers).
3. `MatchService.record` commits; the store publishes `{live, warnings}`; `status` goes `saving → ready`.
4. `useScoringFeedback()` (mounted once by `ScoringScreen`) subscribes with `useLiveMatchStore.subscribe` and compares `state.lastSeq` before/after; it reads the newest `BallRecord.token.kind` and fires `expo-haptics` (run → light, four/six → medium, wicket → heavy, `match_ended` → success notification) when `settings.hapticsEnabled` (§76); sound (§77) is routed through the same hook.
5. On failure the store keeps the previous state, clears the queue, and the screen shows the §86 toast "Couldn't save this delivery. Your previous match data is still safe. [Try Again]" whose action re-dispatches the failed intent.

While the queue is non-empty the pad stays enabled (fast repeated input, §9); it is disabled only when `canRecordDelivery` is false.

### 5.5 Tablet two-pane (§74)

`ScoringScreen` reads `useWindowDimensions().width`; at ≥ 768 dp it renders `TwoPane { start: <LiveScorecardPane/>; end: <LiveScoringColumn/> }`. `LiveScorecardPane` is the `InningsCard` of the current innings (same components as §4.3, same selectors). `app.json` currently locks `orientation: "portrait"`, so tablets get the two-pane layout in portrait; landscape needs an `app.json` change.

## 6. Tournament screens

All screens under `tournament/[tournamentId]` read the same `useTournamentStore` snapshot + evaluation. The evaluation is recomputed only on `open` / `refresh` (after a mutation, or when `LiveMatchStore` commits a match of this tournament and calls `useTournamentStore.getState().refresh()`), so these screens re-render rarely and never per ball.

### 6.1 Tournaments list and wizard

```
TournamentsScreen                       useTournamentListStore
└─ FlatList<TournamentRow>              { name; season; statusLabel; teamsLabel "8 teams"; progress "24/48"; champion | null }
                                        draft/setup tournaments show "Continue setup" → wizard resume()
Wizard layout (tournament/new/_layout)  useTournamentWizardStore(s => s.step); StepHeader { steps; current }
├─ InfoStep                             draft.info
├─ TeamsStep                            draft.teams → TeamMultiPicker + SeedField per team
├─ StructureStep                        TemplatePicker (templateFitsTeamCount message) | StructureKindPicker
├─ RulesStep                            PointsEditor, NrrOptionsEditor, TieBreakerChainEditor (reorderable list, §43)
├─ PoolsStep                            PoolCountStepper, AssignmentMethod (random + seed field / seeded / manual),
│                                        PoolBoard, PoolWarningsList ("Teams in different pools may play different
│                                        numbers of matches." §32), ReplaceArrangementDialog (§31)
├─ FixturesStep                         GenerateButton → FixturePreviewList (editable rows) → FixtureIssuesList
└─ ReviewStep                           summary + commit()
```

`TieBreakerChainEditor` props: `{ chain: TieBreakerKind[]; onChange(chain) }`; it previews `describeTieBreakerChain(chain)` ("Points → NRR → Head-to-Head"). `PoolBoard` props: `{ pools: { poolId; name; members: MemberVM[] }[]; mode: 'edit' | 'readonly'; onMove(member, toPoolId); onSwap(a, b); onReplace(out, in) }`, `MemberVM = { key; label; isSlot; seed: string | null }`. Random assignment always shows the seed ("Seed 847291 — tap to reuse"), and a second draw first shows "Current pool arrangement will be replaced." with [Cancel] [Replace] (§31).

### 6.2 Dashboard (§49, §80)

```
DashboardScreen                         selectDashboardVM(snapshot, evaluation) with useShallow
├─ TournamentTitleBlock                 { name; season; formatLine "8 teams · 2 pools · T20" }
├─ StageProgressLine                    { currentStage; progress "24/48"; }
├─ NextMatchRow                         FixtureRow of the first unplayed fixture by date/number (resolveFixtureTeams)
├─ CompactStandings                     top rows of each pool: StandingsTable columns='compact'
├─ RecentResultsList                    last 3 completed fixtures
└─ ChampionLine                         when evaluation.champion
```

Typography, separators and compact surfaces — no card per statistic (§49).

### 6.3 Standings (§50, §51)

```
StandingsScreen
├─ StageSelector                        stages with tables
├─ PoolTabs                             one tab per pool + "Overall" when > 1 pool
├─ StandingsTable                       { rows: StandingRowVM[]; columns: 'full'; onTeamPress }
├─ TieBreakFootnote                     "Ranking: Points → NRR → Head-to-Head" + row notes (TieBreakNote.detail)
├─ UnresolvedTieCallout                 per unresolvedTies group → [Decide order] opens TieResolutionSheet (override flow)
└─ QualificationList                    QualificationText per team (explanation always shown)
```

```ts
interface StandingRowVM {
  readonly key: string;
  readonly position: string;
  readonly team: string;
  readonly played: number;
  readonly won: number;
  readonly lost: number;
  readonly noResult: number;
  readonly points: number;
  readonly nrr: string;
  readonly qualification: { readonly state: QualificationState; readonly short: string; readonly manual: boolean } | null;
  readonly note: string | null;
}
```

Columns Pos, Team, P, W, L, NR, Pts, NRR (§50); `team` is `"A1"` for an unresolved slot and `"A1 · Tigers (provisional)"` for a provisional one; `qualification.short` is "Q", "E" or "–" with an icon and the full explanation below. Pools up to 16 rows render with `map`; the 128-team overall table uses `FlatList` with `getItemLayout` (fixed row height).

### 6.4 Fixtures, pools, stages, qualification, bracket, what-if, stats, audit

```
FixturesScreen                          grouped SectionList by stage / round / date; FixtureRow
FixtureDetailScreen                     FixtureHeader, StatusTimeline (§39), ScheduleEditor, StartMatchButton → match setup
                                        (startFromFixture), PostponeCancelActions (canTransitionFixture), MatchLink
AddFixtureScreen                        ManualFixtureForm (§37)
PoolsScreen                             PoolBoard mode='edit' → every move/swap/replace → previewChange → ImpactSheet
StagesScreen / StageDetailScreen        StageList (reorder only among future stages), EntryRulesEditor (QualificationRule
                                        builder with explainEntryRules preview), SlotList (label, source, role, seed)
QualificationScreen                     per stage: QualificationText rows, ManualOverrideBadge, OverrideSheet (qualify /
                                        eliminate / reassign / slot pin / champion) with mandatory reason, RevokeOverride
BracketScreen                           BracketView (horizontal ScrollView, one column per round)
WhatIfScreen                            UnplayedFixturePicker → OutcomeSelector (+ optional score) → WhatIfResultView
StatsScreen                             TeamStatsTable, PlayerLeaders (runs, wickets, SR, economy), RecordsList
AuditScreen                             FlatList<AuditRow> (keyset paging on createdAt), AuditDetailSheet with impact
TournamentTeamsScreen                   withdraw (team_withdraw) / replace (team_replace with priorResults choice)
ManageTournamentScreen                  info, rules (rules_change), status/archive, save as template, export PDF/backup,
                                        delete (previewDelete + TypedNameConfirm)
```

`FixtureRow` props: `{ label: string; sideA: SideVM; sideB: SideVM; when: string | null; venue: string | null; status: string; result: string | null; onPress(): void }` with `SideVM = { text: string; resolved: boolean; provisional: boolean }` ("Winner SF1", "Tigers", "A1 · Tigers (provisional)"), always from `resolveFixtureTeams` so a played fixture shows its frozen teams.

`BracketView` props: `{ rounds: { name: string; matches: { key; label; a: BracketSideVM; b: BracketSideVM; result: string | null; onPress }[] }[]; thirdPlace: … | null }`; byes are rendered as a side with "bye" text in round 1 (§46 acceptance: byes and slot labels visible).

`WhatIfScreen` calls `TournamentService.whatIf` through a tournament store action and never `applyChange`; its result view renders `narrative` lines first, then before/after tables.

Besides `open`, `refresh`, `previewChange` and `applyChange`, these screens use the `TournamentStore` actions added for gap G-5: `whatIf(hypotheticals)`, `loadStats()`, `loadAudit(page)`, `updateFixture(fixtureId, patch, reason)`, `addFixture(draft)`, `generateFixtures` / `confirmFixtures` outside the wizard, `setStatus(to, reason)`, `updateInfo(patch)`, `listTemplates()` / `saveAsTemplate(meta)` and `previewDelete()` / `delete(confirm)`. Overrides go through `previewChange({kind: 'override_apply' | 'override_revoke'})` + `applyChange`. PDF export and backup from `ManageTournamentScreen` use `useExportStore` and `useBackupStore` (gap G-4). Starting a fixture's match goes through `useMatchSetupStore.startFromFixture`. Its `submit` calls `TournamentService.startFixtureMatch(fixtureId, setup, [innings_started])` (teams frozen, super over forced) rather than `MatchService.createMatch`, so the start is one transaction (gap G-6).

## 7. Settings screens (WP-export)

```
SettingsScreen                          useSettingsStore; ThemeSegmented (Light / Dark / System), HapticsSwitch, SoundSwitch,
                                        ReducedMotionSegmented, ScoringPreferences, DefaultFormatPicker, links below
BackupScreen                            ExportScopePicker → export → share; ImportButton → ImportPreviewView → policy choice
PresetsScreen                           FormatPreset list + RulesEditor
DiagnosticsScreen                       schema version, integrity issues (needsRepair matches), [Run database check],
                                        technical error log (§86 diagnostics)
```

The backup flow is detailed in [BACKUP_RESTORE.md §10](BACKUP_RESTORE.md#10-backup-screen-flow).

## 8. Shared feature components (`src/features/shared`)

| Component | Props | Used by |
|---|---|---|
| `ImpactSheet` | `{ impact: ImpactSummary; busy: boolean; onCancel(): void; onContinue(reason: string \| null): void }` | pools, fixtures, stages, rules, overrides, teams, edit ball, undo of a tournament result |
| `ReasonField` | `{ required: boolean; value; onChange }` | ImpactSheet, overrides, edit ball |
| `ManualOverrideBadge` | `{ reason: string }` | standings, qualification, bracket, slots |
| `QualificationText` | `{ state; certainty; explanation; manual: boolean }` | standings, qualification, dashboard |
| `TypedNameConfirm` | `{ expected: string; footprint: { matches; completedMatches; events }; onConfirm(opts) }` | tournament delete |
| `EmptyState` / `ErrorState` | from `src/ui` | every list |

`ImpactSheet` renders `headline`, `lines` (most important first), fixture changes with "has match data" markers, standings / qualification / slot diffs, the destructive severity in text ("1 completed match will be re-attributed"), `blocked.reason` with no Continue button, and a `ReasonField` when `requiresReason`. The calling screen keeps the `ChangePreview` returned by `previewChange` and passes exactly that object to `applyChange`; a `CONFLICT` result closes the sheet, refreshes and re-opens it with a fresh preview ("The tournament changed since this preview. Review the new impact.").

## 9. Re-render strategy (§88)

Principles:

1. **No global state object.** Ten stores, one per concern (ARCHITECTURE §7). A ball touches only `useLiveMatchStore`.
2. **Subscribe narrowly.** Components subscribe to the smallest slice they render: primitives, domain objects by reference, or view models through `useShallow`.
3. **Stable references from the engine.** `applyEvent` preserves object identity for everything a ball does not change (SCORING_ENGINE §2.2): previous innings, completed overs, unaffected card rows. Selectors return those objects directly or cache view models per source object (`WeakMap<BattingCardRow, BatterRowVM>`), so an unchanged row yields the same view model.
4. **React Compiler is on** (`app.json` `experiments.reactCompiler`): components and hooks are memoised automatically, so explicit `React.memo` / `useCallback` are unnecessary. The compiler cannot stop a store subscription from re-rendering its subscriber — granularity (2) is what keeps renders low.
5. **Lists virtualise.** Ball log, fixtures, history, audit and 128-team tables use `FlatList`/`SectionList` with stable keys (event id, fixture id, match id) and `getItemLayout` where rows have fixed height.
6. **Expensive derivations are memoised by input reference** (`evaluation`, `snapshot`, `state.innings[i]`) in selector modules, not recomputed per component.
7. **No work on the JS thread during animation.** Score transitions (§75) use Reanimated shared values driven from the committed number; reduced motion (`settings.reducedMotion` / OS) swaps them for instant updates.

Expected renders per event (asserted with a React `Profiler` in RNTL tests):

| Event | Re-rendered | Not re-rendered |
|---|---|---|
| Dot ball / runs mid-over | ScoreHeader, CurrentOverStrip, striker `BatterRow`, BowlerLine (+ non-striker row after an odd run, because strike changes) | ScoringPad, SecondaryActions (after the first ball), PendingActionHost, completed-innings scorecard tabs |
| Last ball of an over | above + both `BatterRow`s (swap) + PendingActionHost (bowler sheet) | ScoringPad |
| Wicket | above + BatterPanel + PendingActionHost | completed innings |
| Undo / edit / open | whole scoring screen (full replay produces new objects) | — |
| Tournament match completes | tournament screens once on `refresh` | live-scoring screen of other matches |

Budget: ≤ 6 component commits and < 8 ms JS for a dot ball on a mid-range Android device.

## 10. Responsive, accessibility, feedback

* **Touch targets** ≥ 44 × 44 everywhere; scoring pad buttons ≥ 64 dp high, full-width grid of 4 columns, thumb zone at the bottom (§72).
* **Accessibility (§78)**: `BallChip` uses `BallToken.accessibilityLabel`; qualification rows use `explanation`; standings rows read "1st, Tigers, 3 played, 2 won, 4 points, net run rate plus 1.185"; every icon-only button has a label; dynamic type is respected (score figure caps at 1.5× to keep the header on screen).
* **Keep awake**: `ScoringScreen` activates keep-awake while mounted when `settings.scoring.keepAwake` (`expo-keep-awake` is present only as a transitive dependency of `expo`; see the report).
* **Errors (§86)**: store errors become toasts or inline `ErrorState` with the service message; `detail` is only visible in Diagnostics.
* **Empty states (§87)**: every list screen has a purposeful empty state with one primary action.

## 11. Testing

* Components: RNTL render tests with props only (no stores); accessibility queries (`getByRole`, `getByLabelText`).
* Screens: stores mocked through `useXStore.setState` on the real zustand hooks with fake service implementations.
* Scoring acceptance (CONTRACTS WP-match-ui): one tap per run button → exactly one `dispatch` call with `scoreRuns(n)`; extras sheet covers WD+n, NB + bat / B / LB, B, LB, custom values; wicket flows within the tap counts of §5.2; every `PendingAction` renders its sheet; tablet layout at 800 dp width.
* Render-count tests for §9 using `Profiler` `onRender` counters.
