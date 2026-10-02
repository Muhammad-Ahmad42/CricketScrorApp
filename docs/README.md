# Scorebook — Design Documentation Index

Scorebook is an offline cricket scorer and tournament manager (Expo SDK 57, TypeScript 6, expo-sqlite, Zustand). [SPEC.md](SPEC.md) is the product owner's specification (sections are cited as §N everywhere). This page lists every design document, maps the 34 pre-coding artifacts of §102 to where they live, traces every §95 MVP item from requirement to test, and records the known contract gaps for the integrator.

**Precedence when documents disagree.**
1. [SPEC.md](SPEC.md) states the product intent. It is never edited to match the design.
2. [CONTRACT_REFERENCE.md](architecture/CONTRACT_REFERENCE.md) and the contract source it documents are canonical for every type, field, function, guard and service or store signature.
3. [REQUIREMENTS.md](product/REQUIREMENTS.md) is canonical for requirement ids, priorities and non-functional budgets. [BUSINESS_RULES.md](product/BUSINESS_RULES.md) is canonical for rule wording.
4. [DESIGN_SYSTEM.md](ux/DESIGN_SYSTEM.md) is canonical for tokens, type styles and component specs. [ARCHITECTURE.md §9](architecture/ARCHITECTURE.md#9-navigation-expo-router-srcapp) is canonical for routes.
5. Every other document follows these. If you find a conflict, fix the dependent document and add a line to the [consistency log](#5-consistency-log).

**Id prefixes.** `§N` spec section · `FR-<area>-nn` functional requirement · `NFR-<area>-nn` non-functional requirement · `BR-<area>-nn` business rule · `EC-<area>-nn` edge case · `US-<epic>-nn` user story · `W-<xx>` wireframe · `U-<area>-nn` unit test · `IT-<M|T|DB|BK>-nn` integration test · `E2E-nn` end-to-end flow · `FR-nn` (no area) failure/recovery test · `AC-E<n>-nn` acceptance criterion · `WP-<name>` work package. Do not confuse `FR-07` (database failure test) with `FR-C-07` (a requirement).

---

## 1. Document index

### Specification and build plan

| Document | What it is |
|---|---|
| [SPEC.md](SPEC.md) | The master product specification, §1–§105. It is the source of truth for intent. |
| [CONTRACTS.md](CONTRACTS.md) | Build plan for parallel implementation: module map, contract rules, work packages with acceptance tests, file ownership, integration order and open product questions. |
| [README.md](README.md) | This index: the document list, the §102 artifact map, MVP traceability, the contract gap register and the consistency log. |

### Product (`product/`)

| Document | What it is |
|---|---|
| [PRD.md](product/PRD.md) | Problem, vision, goals and non-goals, users, V1 scope versus later, constraints, risks, success criteria and release plan. |
| [PERSONAS.md](product/PERSONAS.md) | Five personas (club scorer, school teacher, university organizer, casual group organizer, league statistician) and the conditions they impose on the design. |
| [USER_STORIES.md](product/USER_STORIES.md) | User stories by epic (home, setup, scoring, wickets, events, corrections, scorecard, tournament, pools, fixtures, standings, qualification, dashboard, backup, settings), each with acceptance notes. |
| [REQUIREMENTS.md](product/REQUIREMENTS.md) | Functional requirements (FR-*) with spec trace, contract symbol and priority, and non-functional requirements (NFR-*): performance budgets, scale, offline, reliability, integrity, accessibility, usability, compatibility, maintainability. |
| [BUSINESS_RULES.md](product/BUSINESS_RULES.md) | Every cricket-scoring and tournament rule (BR-*) the engines enforce, with its contract symbol. |
| [EDGE_CASES.md](product/EDGE_CASES.md) | Edge cases (EC-*) with expected behaviour, the rule they test and the owning package. §14 summarises the gaps they raise. |

### Architecture (`architecture/`)

| Document | What it is |
|---|---|
| [ARCHITECTURE.md](architecture/ARCHITECTURE.md) | System architecture: principles, layers, bounded contexts, the domain model (§3.1), key decisions, data flows (scoring, undo/redo, historical edit, match completion to standings), repository structure, stores, services, navigation and the design review log. |
| [CONTRACT_REFERENCE.md](architecture/CONTRACT_REFERENCE.md) | Per-symbol semantics of the whole contract: domain types, engine stubs, SQL schema notes, repository, service and store interfaces. Source files carry no comments, so this is where their meaning lives. |
| [DATABASE.md](architecture/DATABASE.md) | Database design: principles, ERD, the event-log decision, every table, indexes, the transaction of each use case and the migration strategy. |
| [STATE_MACHINES.md](architecture/STATE_MACHINES.md) | Match, innings (with pending actions), tournament, stage and fixture state machines, plus the edit-permission matrices (§55). |

### UX (`ux/`)

| Document | What it is |
|---|---|
| [INFORMATION_ARCHITECTURE.md](ux/INFORMATION_ARCHITECTURE.md) | Navigation model, sitemap of every route, non-route surfaces (sheets, dialogs), vocabulary, dashboard emphasis by state, search and filter locations, content priority. |
| [USER_FLOWS.md](ux/USER_FLOWS.md) | Step-by-step flows with the store or service call behind each step: standalone match, live-scoring micro-flows, recovery, tournament creation and management, edit a past ball. |
| [WIREFRAMES.md](ux/WIREFRAMES.md) | Phone wireframes (W-*) for every route and surface, plus the 320 pt phone, tablet two-pane and landscape layouts, with final copy and component specs. |
| [DESIGN_SYSTEM.md](ux/DESIGN_SYSTEM.md) | Design tokens: colour (light and dark, with verified contrast), typography, spacing, radius, borders, elevation, icons, components, live-scoring composition, motion, haptics and sound. |
| [THEMES.md](ux/THEMES.md) | Light, dark and system themes: selection, rationale, component-by-component mapping, chart and PDF theming, theme tests. |
| [RESPONSIVE.md](ux/RESPONSIVE.md) | Breakpoints, small-phone rules, tablet two-pane layouts, dynamic type caps, touch targets, safe areas and the device test matrix. |
| [ACCESSIBILITY.md](ux/ACCESSIBILITY.md) | Accessibility strategy: labels and roles, live announcements, focus, touch targets, colour independence, contrast, charts and tables, motor use, reduced motion, dynamic type, testing. |

### Engineering (`engineering/`)

| Document | What it is |
|---|---|
| [COMPONENT_ARCHITECTURE.md](engineering/COMPONENT_ARCHITECTURE.md) | Feature folder layout, app shell, the component trees and view models of every screen, shared components, the re-render strategy and component tests. It also lists the store actions the screens need beyond the contract. |
| [SCORING_ENGINE.md](engineering/SCORING_ENGINE.md) | Design of the CricketRulesEngine: module layout, internal model, replay algorithm, validation table, delivery arithmetic, strike rotation, completion, pending actions, commands, undo/redo, historical edit, performance and worked examples. |
| [TOURNAMENT_RULES_ENGINE.md](engineering/TOURNAMENT_RULES_ENGINE.md) | Seeded PRNG, pools, round robin, knockout brackets, seeding, advancement, slots, the evaluation pipeline, structural changes (`planChange`), templates and state-machine guards. |
| [STANDINGS_CALCULATOR.md](engineering/STANDINGS_CALCULATOR.md) | Standings inputs, counting rules, points per result, row aggregation, the tie-break algorithm, explanation strings, overrides and uneven-pool comparison tables. |
| [NRR_CALCULATOR.md](engineering/NRR_CALCULATOR.md) | The single NRR engine: formula, ball arithmetic, per-match contributions, inclusion rules, aggregation, ICC worked examples and display. |
| [QUALIFICATION_ENGINE.md](engineering/QUALIFICATION_ENGINE.md) | Slot sources and resolution, best-of-position across uneven pools, mathematical certainty by enumeration, override precedence, knockout advancement and champion, §98 explanation text. |
| [BACKUP_RESTORE.md](engineering/BACKUP_RESTORE.md) | Backup envelope, export, the validation pipeline, conflict and duplicate detection, id remapping, atomic import, never-silent rules, PDF generation and failure handling. |

### QA (`qa/`)

| Document | What it is |
|---|---|
| [UNIT_TEST_PLAN.md](qa/UNIT_TEST_PLAN.md) | Unit tests (U-*) for every §90 item: scoring commands, extras, wickets, strike, overs, innings, results, stats, formatting, validation codes, history, replay invariants, and every tournament engine. |
| [INTEGRATION_TEST_PLAN.md](qa/INTEGRATION_TEST_PLAN.md) | Integration tests on sql.js (§91): the standalone match lifecycle (IT-M), the 8-team tournament to a champion (IT-T), persistence suites (IT-DB) and backup (IT-BK), with warm and cold restarts. |
| [E2E_TEST_PLAN.md](qa/E2E_TEST_PLAN.md) | Maestro end-to-end flows (§92): testID convention, required testIDs, shared subflows, the main tournament flow E2E-06 and flows E2E-01 to E2E-14. |
| [FAILURE_RECOVERY_TESTS.md](qa/FAILURE_RECOVERY_TESTS.md) | §93 failure and recovery tests FR-01 to FR-10 plus architecture-specific failure modes (FR-11 onwards). |
| [ACCEPTANCE_CRITERIA.md](qa/ACCEPTANCE_CRITERIA.md) | Global gates, acceptance criteria per epic (AC-E1 to AC-E12, one per §94 sprint), the §104 definition-of-done coverage matrix and the sign-off record. |

---

## 2. §102 pre-coding artifacts (34)

Every artifact exists and is substantive. Where one document holds several artifacts, the section is given.

| # | Group | Artifact | Where |
|---|---|---|---|
| 1 | Product | PRD | [PRD.md](product/PRD.md) |
| 2 | Product | Personas | [PERSONAS.md](product/PERSONAS.md) |
| 3 | Product | User stories | [USER_STORIES.md](product/USER_STORIES.md) |
| 4 | Product | Functional requirements | [REQUIREMENTS.md Part 1](product/REQUIREMENTS.md#part-1--functional-requirements) |
| 5 | Product | Non-functional requirements | [REQUIREMENTS.md Part 2](product/REQUIREMENTS.md#part-2--non-functional-requirements) |
| 6 | Product | Business rules | [BUSINESS_RULES.md](product/BUSINESS_RULES.md) |
| 7 | Product | Edge cases | [EDGE_CASES.md](product/EDGE_CASES.md) |
| 8 | Architecture | System architecture | [ARCHITECTURE.md §1–§4, §10](architecture/ARCHITECTURE.md) |
| 9 | Architecture | Domain architecture | [ARCHITECTURE.md §3 and §3.1](architecture/ARCHITECTURE.md#31-domain-model-102-domain-architecture) (bounded contexts, aggregates, value objects, domain services, ubiquitous language) and [CONTRACT_REFERENCE.md](architecture/CONTRACT_REFERENCE.md) |
| 10 | Architecture | ERD | [DATABASE.md §2](architecture/DATABASE.md#2-erd) |
| 11 | Architecture | SQLite schema | [DATABASE.md §3–§5](architecture/DATABASE.md#4-tables) and [CONTRACT_REFERENCE.md "Schema notes"](architecture/CONTRACT_REFERENCE.md) (migration 001) |
| 12 | Architecture | State machines | [STATE_MACHINES.md](architecture/STATE_MACHINES.md) |
| 13 | Architecture | Data flow | [ARCHITECTURE.md §5](architecture/ARCHITECTURE.md#5-data-flows) and [DATABASE.md §6](architecture/DATABASE.md#6-transactions-per-use-case) |
| 14 | Architecture | Repository structure | [ARCHITECTURE.md §6](architecture/ARCHITECTURE.md#6-repository-structure) and [CONTRACTS.md §4](CONTRACTS.md#4-file-ownership-index-no-overlaps) |
| 15 | UX | Information architecture | [INFORMATION_ARCHITECTURE.md](ux/INFORMATION_ARCHITECTURE.md) |
| 16 | UX | User flows | [USER_FLOWS.md](ux/USER_FLOWS.md) |
| 17 | UX | Wireframes | [WIREFRAMES.md](ux/WIREFRAMES.md) |
| 18 | UX | Design tokens | [DESIGN_SYSTEM.md §1–§4](ux/DESIGN_SYSTEM.md) |
| 19 | UX | Light theme | [DESIGN_SYSTEM.md §1](ux/DESIGN_SYSTEM.md#1-colour-tokens-68-69-71) (light column) and [THEMES.md](ux/THEMES.md) |
| 20 | UX | Dark theme | [DESIGN_SYSTEM.md §1](ux/DESIGN_SYSTEM.md#1-colour-tokens-68-69-71) (dark column) and [THEMES.md](ux/THEMES.md) |
| 21 | UX | Responsive strategy | [RESPONSIVE.md](ux/RESPONSIVE.md) |
| 22 | UX | Accessibility strategy | [ACCESSIBILITY.md](ux/ACCESSIBILITY.md) |
| 23 | Engineering | Component architecture | [COMPONENT_ARCHITECTURE.md](engineering/COMPONENT_ARCHITECTURE.md) |
| 24 | Engineering | Scoring engine design | [SCORING_ENGINE.md](engineering/SCORING_ENGINE.md) |
| 25 | Engineering | Tournament rules engine | [TOURNAMENT_RULES_ENGINE.md](engineering/TOURNAMENT_RULES_ENGINE.md) |
| 26 | Engineering | Standings calculator | [STANDINGS_CALCULATOR.md](engineering/STANDINGS_CALCULATOR.md) |
| 27 | Engineering | NRR calculator | [NRR_CALCULATOR.md](engineering/NRR_CALCULATOR.md) |
| 28 | Engineering | Qualification engine | [QUALIFICATION_ENGINE.md](engineering/QUALIFICATION_ENGINE.md) |
| 29 | Engineering | Backup/restore architecture | [BACKUP_RESTORE.md](engineering/BACKUP_RESTORE.md) |
| 30 | QA | Unit test plan | [UNIT_TEST_PLAN.md](qa/UNIT_TEST_PLAN.md) |
| 31 | QA | Integration test plan | [INTEGRATION_TEST_PLAN.md](qa/INTEGRATION_TEST_PLAN.md) |
| 32 | QA | E2E test plan | [E2E_TEST_PLAN.md](qa/E2E_TEST_PLAN.md) |
| 33 | QA | Failure/recovery tests | [FAILURE_RECOVERY_TESTS.md](qa/FAILURE_RECOVERY_TESTS.md) |
| 34 | QA | Acceptance criteria | [ACCEPTANCE_CRITERIA.md](qa/ACCEPTANCE_CRITERIA.md) |

---

## 3. MVP traceability matrix (§95)

Each §95 MVP item is traced to its requirement ids, the contract types and APIs that implement it, the screens (wireframe ids from [WIREFRAMES.md](ux/WIREFRAMES.md#index)), and the test plan sections that verify it. A **G-n** in the API column means the screen needs a store action the contract does not have yet (see [§4](#4-contract-gap-register)); the domain and service layers are complete for every item.

Test columns: **U** = [UNIT_TEST_PLAN.md](qa/UNIT_TEST_PLAN.md) section · **IT** = [INTEGRATION_TEST_PLAN.md](qa/INTEGRATION_TEST_PLAN.md) step · **E2E** = [E2E_TEST_PLAN.md](qa/E2E_TEST_PLAN.md) flow · **FR** = [FAILURE_RECOVERY_TESTS.md](qa/FAILURE_RECOVERY_TESTS.md) · **AC** = [ACCEPTANCE_CRITERIA.md](qa/ACCEPTANCE_CRITERIA.md) epic.

### 3.1 Match

| # | MVP item | Requirements | Types / APIs | Screens | Test plan |
|---|---|---|---|---|---|
| M1 | Create match | FR-M-01, FR-M-08, FR-M-12, US Epic M | `NewMatchInput`, `MatchSetupDraft`, `useMatchSetupStore.submit`, `MatchService.createMatch(input, openingEvents)`, `validateRules` | W-H1 (NEW MATCH), W-M1…W-M5 | U §14; IT-M-03; E2E-01; AC-E2 |
| M2 | Custom overs | FR-M-02, FR-M-03, FR-E-02, NFR-S-07 | `MatchRules.oversPerInnings`, `OVERS_QUICK_PICKS`, `rulesForOvers`, `BUILTIN_FORMAT_PRESETS`, `revise_overs` / `overs_revised` | W-M1, W-C5, W-X2 | U §5, §6, §14; AC-E2, AC-E3 |
| M3 | Teams | FR-M-01, FR-M-04, NFR-S-17 | `Team`, `NewTeamInput`, `TeamService`, `Match.teamAPlayers/teamBPlayers`, `MatchTeam.playersInSide`; store **G-3** | W-M2, W-L1, W-L2 | U §6 (uneven sides); IT-M-02; IT-DB-03; AC-E2 |
| M4 | Players | FR-M-06, FR-S-13, NFR-S-11 | `Player`, `MatchSquadEntry`, `MatchPlayer.isSubstitute`, `MatchService.addSquadPlayer` / `removeSquadPlayer`, `useLiveMatchStore.addSquadPlayer` | W-M3, W-S4 (add player), W-L2 | U §3 (substitutes, fielders); IT-M-02/03; IT-DB-04; AC-E2 |
| M5 | Toss | FR-M-07 | `Toss`, `TOSS_MISMATCH`, `MatchService.setToss`, `PendingAction.start_next_innings.suggestedBattingTeamId` | W-M4, W-C5 | U §10; AC-E2 |
| M6 | Runs | FR-S-01, FR-S-02, FR-S-04, FR-S-05, FR-S-07, FR-S-14, NFR-U-01 | `scoreRuns`, `overthrowBoundary`, `buildEvents`, `DeliveryPayload`, `MatchState.chase`, `BallToken`, `formatOvers`, `formatRequirement`, `useLiveMatchStore.dispatch` | W-S1, W-S1b, W-S12 | U §1, §8, §9; IT-M-04; E2E-01; AC-E3, AC-E4 |
| M7 | Extras | FR-S-06, FR-S-10, FR-M-05 | `wide`, `noBall`, `bye`, `legBye`, `WideRule`, `NoBallRule`, `isFreeHitNext`, `allowedDismissals` | W-S2 | U §2; E2E-04; AC-E3, AC-E4 |
| M8 | Wickets | FR-W-01 … FR-W-08 | `wicket({nextBatterId})`, `DeliveryWicket`, `DELIVERY_DISMISSAL_TYPES`, `OFF_BALL_DISMISSAL_TYPES`, `RETIREMENT_KINDS`, `eligibleIncomingBatters`, `dismissalText`, `InningsEndedPayload` | W-S3, W-S4, W-S11 | U §3; IT-M-06, IT-M-15; E2E-04; AC-E3, AC-E4 |
| M9 | Strike | FR-S-03, FR-S-08 | `InningsState.strikerId`, `strike_swapped`, `swapStrike`, strike rules in SCORING_ENGINE §6 | W-S1 (striker marker, Swap) | U §4; E2E-04 (run out ends); AC-E3 |
| M10 | Undo | FR-C-01, FR-C-02 (and FR-C-03, FR-C-04 for edits) | `undoLastAction`, `redoAction`, `RedoStack`, `MatchService.undo/redo`, `MatchEventRepository.truncateFrom`, `useLiveMatchStore.undo/redo`; edit APIs `previewHistoryEdit`/`applyHistoryEdit` via store **G-1** | W-S1 (action row), W-C2, W-C3 | U §11; IT-M-07, IT-M-08, IT-M-16, IT-M-20…24; E2E-03, E2E-05; AC-E3, AC-E5 |
| M11 | SQLite | NFR-R-01, NFR-R-02, NFR-R-07, NFR-I-01, NFR-I-02, FR-R-05 | `SqlDatabase`, `withTransactionAsync`, `MIGRATIONS`, `migration001Initial`, `RunMigrations`, `CreateRepositories`, `MatchProjection`, `SCORING_PROJECTION_VERSION` | W-R0, W-X3 | IT-DB-01…09; FR-05, FR-07; AC-E1, AC-E11 |
| M12 | Recovery | FR-R-01, FR-R-02, FR-R-03, FR-R-05, NFR-R-04, NFR-R-05 | `AppServices.bootstrap`, `BootstrapReport`, `MatchService.findResumable({forPrompt})`, `dismissResume`, `discard`, `replayMatch`, `MatchState.needsRepair`; DISCARD store action **G-2** | W-H3, W-R0, W-S11 | U §12; IT-M-05, IT-M-11, IT-M-12, IT-M-25; IT-DB-10; FR-01, FR-02, FR-03; E2E-02; AC-E5 |
| M13 | Scorecard | FR-SC-01, FR-SC-02 | `InningsState`, `BattingCardRow`, `BowlingCardRow`, `Partnership`, `FallOfWicket`, `OverSummary`, `dismissalText`, `formatBowlingFigures`, `worm`, `manhattan` | W-C1, W-C2, W-C4 | U §8, §9; IT-M-18; E2E-01; AC-E5, AC-E10 |
| M14 | Match history | FR-SC-05, FR-SC-06, FR-SC-07, NFR-P-12 | `MatchListQuery`, `MatchListItem`, `MatchService.list/delete`, `useMatchHistoryStore`, `formatResult`, `matchStatusLabel` | W-Y1 | U §7 (status labels); IT-M-19; IT-DB-10; AC-E5 |
| M15 | Light mode | FR-A-01, NFR-A-01 | `ThemePreference`, `AppSettings.theme`, `useSettingsStore`, tokens (`src/ui/theme`) | W-G1; every frame (tokens per DESIGN_SYSTEM §1) | THEMES §6; WP-design-system contrast tests; E2E-13; AC-E1, AC-E12 |
| M16 | Dark mode | FR-A-01, NFR-A-01 | as M15 (dark palette designed separately) | W-G1; every frame | THEMES §6; E2E-13; AC-E1, AC-E12 |
| M17 | PDF | FR-SC-03, NFR-P-13 | `ExportService.scorecardPdf`, `export/pdf` HTML builders; store **G-4** | W-C1 (Share → PDF scorecard) | IT-M-18; FR-08; BACKUP_RESTORE §12; E2E-01; AC-E10 |
| M18 | Sharing | FR-SC-04, NFR-O-03 | `ExportService.share`, `BackupService.exportBackup`; store **G-4** | W-C1, W-X1 | E2E-01, E2E-12; AC-E10, AC-E11 |

### 3.2 Tournament

| # | MVP item | Requirements | Types / APIs | Screens | Test plan |
|---|---|---|---|---|---|
| T1 | Create | FR-T-01, FR-T-02, FR-T-04, FR-T-12 | `NewTournamentInput`, `TournamentService.create`, `useTournamentWizardStore` (`saveStep`, `resume`, `commit`), `TOURNAMENT_STATUSES`, `canTransitionTournament`, `builtinTemplates` | W-T1, W-N1…W-N7 | U §19, §20; IT-T-02…10; E2E-06; AC-E6 |
| T2 | Add teams | FR-T-03, NFR-S-01 | `TournamentTeam` (`seed`, status), `TournamentService.addTeams/removeTeams`, `team_seeds_change` | W-N2, W-D14 | IT-T-03, IT-T-31; AC-E6 |
| T3 | Pools | FR-T-08, NFR-S-02 | `Pool`, `PoolEntry`, `FixtureSide`, `TournamentService.saveStructure`, `previewPoolAssignment`, `poolName` | W-N5, W-D6 | U §15; IT-T-05, IT-T-06; AC-E7 |
| T4 | Random allocation | FR-T-08 | `assignRandom`, `mulberry32`, `normalizeSeed`, `PoolAssignmentMethod { kind: 'random', seed }` | W-N5 | U §15; IT-T-05; E2E-07; AC-E7 |
| T5 | Manual allocation | FR-T-08 | `PoolAssignmentMethod { kind: 'manual' }`, `PoolAssignment`, `assignSeeded`, `assignSlotsToPools` | W-N5, W-D6 | U §15; IT-T-06; AC-E7 |
| T6 | Uneven pools | FR-T-09 | `distributePoolSizes`, `poolWarnings`, `UnevenPoolNormalization`, `StageEvaluation.comparisonTables` | W-N5 (warning), W-D2 | U §15, §22; E2E-07; AC-E7, AC-E8 |
| T7 | Move / swap / replace teams | FR-P-01 … FR-P-05 | `ProposedChange` `pool_move` / `pool_swap` / `team_replace` / `team_withdraw`, `moveMember`, `swapMembers`, `replaceMember`, `fixturesForPoolMove`, `planChange`, `computeImpact`, `ChangePreview`, `useTournamentStore.previewChange/applyChange` | W-D6, W-D14, W-D16 | U §15, §26; IT-T-30; FR-09; E2E-08; AC-E7 |
| T8 | Fixture generation | FR-F-01, FR-F-06, FR-F-09 | `roundRobin`, `draftsFromRoundRobin`, `validateFixtureDrafts`, `knockoutBracket`, `TournamentService.generateFixtures/confirmFixtures`, `FixturePlan`; after the wizard via store **G-5** | W-N6, W-D3 | U §16, §17; IT-T-07…09; AC-E7 |
| T9 | Manual fixtures | FR-F-02 | `manualFixture`, `ProposedChange fixture_add`, `TournamentService.addFixture`; store **G-5** | W-D4 | U §16; IT-T-30; AC-E7 |
| T10 | Fixture editing | FR-F-03, FR-F-04 | `FixturePatch`, `fixture_update`, `TournamentService.updateFixture`, `canTransitionFixture`, `tournamentEditPolicy`; store **G-5** | W-D5 | U §20, §26; FR-09; AC-E7 |
| T11 | Points system | FR-ST-01, FR-ST-02 | `PointsSystem`, `BonusPointRule`, `DEFAULT_POINTS_SYSTEM`, `rules_change` | W-N4, W-D15 | U §22; AC-E8 |
| T12 | Standings | FR-ST-05, FR-ST-07 | `computeStandings`, `StandingsTable`, `StandingRow`, `points_adjustment` | W-D1, W-D2 | U §22; IT-T-12…15; E2E-06; AC-E8 |
| T13 | NRR | FR-ST-03 | `NrrConfig`, `matchNrrContributions`, `aggregateNrr`, `computeNrr`, `formatNrr` | W-D2, W-N4 | U §21; NRR_CALCULATOR §8; IT-T-12…15; AC-E8 |
| T14 | Tie breakers | FR-ST-04, FR-ST-06, FR-ST-08 | `TIE_BREAKER_KINDS`, `rankTeams`, `TieBreakNote`, `describeTieBreakerChain`, `unresolvedTies`, `tie_resolution` | W-N4, W-D2 | U §23; AC-E8 |
| T15 | Qualification | FR-Q-01, FR-Q-02, FR-Q-03, FR-Q-07 | `QualificationRule`, `expandEntryRules`, `StageSlot`, `SlotSource`, `resolveStageSlots`, `computeQualification`, `TeamQualification`, `explainEntryRules` | W-D2, W-D7, W-D8, W-D9 | U §18, §24; IT-T-16; E2E-06, E2E-09; AC-E8 |
| T16 | Semifinal | FR-F-06, FR-Q-04, FR-Q-05, FR-D-05 | `knockoutBracket`, `seedEntrants`, `knockoutGenerationGuard`, `knockoutAdvancer`, `BracketPosition`, `KnockoutConfig` | W-D10, W-D5 | U §17, §24; IT-T-16…18; E2E-06; AC-E9 |
| T17 | Final | FR-F-06, FR-Q-08, FR-D-06 | `Fixture.isFinal`, `resolveChampion`, `ChampionResult`, `decidesChampion`, `champion_json` projection | W-D10, W-D1, W-T1 | U §24; IT-T-21…23; E2E-06; AC-E9 |
| T18 | Automatic result integration | FR-F-05, FR-E-06, FR-ST-05 | `TournamentService.startFixtureMatch` (frozen `Fixture.matchSides`), `match_ended { natural }`, `buildMatchSummary`, `evaluateTournament`, `useTournamentStore.refresh` | W-D5 (Start match), W-S8, W-D1, W-D2 | U §13, §24; IT-T-11…16; FR-10; E2E-06; AC-E8, AC-E9 |
| T19 | Manual override | FR-Q-06, FR-ST-07, FR-ST-08 | `TournamentOverride`, `ProposedChange override_apply / override_revoke`, `TournamentService.applyOverride/revokeOverride` | W-D9, W-D2, W-D16 | U §24; E2E-10; AC-E8, AC-E9 |
| T20 | Audit history | FR-D-04, FR-C-07, NFR-I-03 | `AuditEvent`, `AUDIT_ACTIONS`, `TournamentService.auditLog`, `AuditRepository`; store **G-5** | W-D13, W-D16 | IT-T-25; E2E-08, E2E-10; AC-E6, AC-E8 |

---

## 4. Contract gap register

Things the design needs that the frozen contract (types, service, store and repository interfaces, guards) does not provide. Each gap needs an **additive** contract change by the integrator (CONTRACTS.md §2 rule 1). MVP-blocking gaps come first. The wave-1 integration (2026-10-01) closed G-1 to G-12. The exact signatures are in the contract files, and their semantics are in CONTRACT_REFERENCE.md, whose "Contract additions register" lists every addition.

| Id | Gap | Needed by | Suggested additive change | Status |
|---|---|---|---|---|
| G-1 | `LiveMatchStore` has no historical-edit or match-management actions, and screens may not call services. | §16 edit (FR-C-03, FR-C-04, M10), match settings (FR-C-08, FR-E-10), W-C3, W-C5 | `previewHistoryEdit(ops): Promise<HistoryEditPreview \| null>`, `applyHistoryEdit(ops, reason, preview)`, `updateDetails(patch)`, `updateRules(patch, reason)`, `setToss(toss, reason)`, `setPrePlayStatus(status, reason)`, `removeSquadPlayer(playerId)` (COMPONENT_ARCHITECTURE §4.3) | Closed 2026-10-01: added to `LiveMatchStore`, plus named patch types in `services/contracts.ts` |
| G-2 | `HomeStore` has no DISCARD action. | §23 recovery (FR-R-03, M12), W-H3 | `HomeStore.discard(matchId): Promise<boolean>` → `MatchService.discard` | Closed 2026-10-01: `HomeStore.discard` |
| G-3 | No store for the team, player and venue library (`TeamService`). | Teams and players (M3, M4), match-setup pickers, tournament wizard teams, W-L1, W-L2, W-M2, W-N2 | `useTeamLibraryStore { teams, venues, status, error, load(search?), loadTeam(id), createTeam, updateTeam, archiveTeam, addPlayer, updatePlayer, archivePlayer, createVenue, archiveVenue }` (COMPONENT_ARCHITECTURE §4.4) | Closed 2026-10-01: `TeamLibraryStore` (`load(opts)` takes `{ search, includeArchived }`) |
| G-4 | No store for PDF export, sharing or backup (`ExportService`, `BackupService`). | PDF and sharing (M17, M18), backup (FR-B-01…03), W-C1, W-X1 | `useExportStore { scorecardPdf(matchId), tournamentPdf(id), share(uri, mime) }` and `useBackupStore { exportBackup(scope), previewImport(uri), applyImport(uri, policy), preview, report }` | Closed 2026-10-01: `ExportStore`, `BackupStore` |
| G-5 | `TournamentStore` only has `open`, `refresh`, `previewChange`, `applyChange`. | Manual fixtures (T9), fixture editing (T10), audit (T20), fixture generation after the wizard (T8), what-if, stats, status, templates, delete | `whatIf`, `loadStats`, `loadAudit(page)`, `updateFixture`, `addFixture`, `generateFixtures`/`confirmFixtures`, `setStatus`, `updateInfo`, `listTemplates`/`saveAsTemplate`, `previewDelete`/`delete` (COMPONENT_ARCHITECTURE §6.4). Overrides already work through `previewChange` + `applyChange`. | Closed 2026-10-01: all listed actions on `TournamentStore`; `TournamentWizardStore.listTemplates` added for the structure step |
| G-6 | `TournamentService.startFixtureMatch` takes no opening events, so a fixture match and its `innings_started` are two transactions (`createMatch` does it in one). | §66 atomic start (T18), `useMatchSetupStore.submit` | Optional `openingEvents?: readonly MatchEventInput[]` parameter, mirroring `createMatch` | Closed 2026-10-01: `startFixtureMatch(fixtureId, setup, openingEvents?)`; `MatchSetupStore.submit` is one transaction |
| G-7 | `ServiceDeps` is named in CONTRACT_REFERENCE but not defined; there is no factory type for `AppServices`, and no contract for how stores obtain the services instance. | WP-services-stores wiring; the integration harness `createTestApp` | `ServiceDeps { db: SqlDatabase; clock: Clock; newId: IdGenerator; newSeed(): Seed; fileSystem; printer; sharer; haptics }` and `CreateAppServices = (deps: ServiceDeps) => AppServices`, plus a store-side `setAppServices(services)` or provider | Closed 2026-10-01: `ServiceDeps` (with an `openDatabase` opener instead of an open `db`; no `haptics`, see CONTRACT_REFERENCE), `CreateAppServices`, `AppServicesRegistry` |
| G-8 | `canTransitionFixture` has no `rescheduled → postponed` and no `postponed → completed` (walkover). | EC-T-13, EC-Q-13, withdrawn teams | Two additional allowed transitions | Closed 2026-10-01: both transitions added to the guard; tests and STATE_MACHINES §5 updated |
| G-9 | No service API for the on-demand `PRAGMA foreign_key_check` of the Diagnostics screen (V). | FR-B-06, W-X3 | `AppServices.checkIntegrity(): Promise<ServiceResult<{ foreignKeyViolations: number; matchesNeedingRepair: MatchId[] }>>` | Closed 2026-10-01: `AppServices.checkIntegrity`, `IntegrityReport`, `AppStore.checkIntegrity` |
| G-10 | No way to read the audit trail of a standalone match (entries are written with `tournamentId` null). | FR-C-07 visibility (V) | `MatchService.auditLog(matchId, page)` over `AuditRepository.list({ matchId })` | Closed 2026-10-01: `MatchService.auditLog`, `LiveMatchStore.loadAudit` |
| G-11 | `ScoringPreferences` has no pad-handedness field (V). | Left-handed scoring pad, ACCESSIBILITY §9 | `padHand?: 'right' \| 'left'` | Closed 2026-10-01: `PadHand`, optional `ScoringPreferences.padHand`; backup validation accepts it |
| G-12 | `src/features/shared/**` (ImpactSheet, ReasonField, …) has no owner in CONTRACTS.md §4, but both WP-match-ui (edit ball, reopen) and WP-tournament-ui use it. | COMPONENT_ARCHITECTURE §8 | Assign it to WP-tournament-ui (the heavier user), with WP-match-ui as a consumer | Closed 2026-10-01: CONTRACTS.md §3 and §4 assign `src/features/shared/**` to WP-tournament-ui |
| G-13 | Dependencies: no audio library (`expo-audio`/`expo-av`), so §77 sound ships disabled; `expo-keep-awake` exists only as a transitive dependency of `expo` but FR-A-03 `keepAwake` (M) needs it. | §77, FR-A-03, NFR-U-04 | Declare `expo-keep-awake` in `package.json` (no new package); decide on audio after V1 | Dependencies resolved by the product owner: `package.json` now declares `expo-keep-awake` and `expo-audio`. Keep-awake is wired (`useScoringKeepAwake`), and the sound driver (`services/platform/sound.ts`, `assets/sounds/*.wav`) is wired into the device feedback. Open only as a product switch: Settings keeps sound disabled (`SOUND_EFFECTS_AVAILABLE = false` in `features/settings/constants.ts`, pinned by the settings tests) until sound is approved for V1 |
| G-14 | No service or store API lists, saves or deletes user format presets (`FormatPresetRepository` exists). | FR-M-11 (V), W-X2 "Yours", default-format sheet | `SettingsService.listPresets/savePreset/deletePreset` and a `SettingsStore.presets` slice | Open: the presets screen says "Saving your own presets is not available in this version" |
| G-15 | Neither `BootstrapReport` nor `IntegrityReport` carried the database pragmas that Diagnostics must show. | AC-E1-02, FR-02b, E2E §3.7 `diag-text-pragmas` | `DatabasePragmas` and optional `BootstrapReport.pragmas` | Closed in the wave-2 integration: `bootstrap()` fills `BootstrapReport.pragmas` with `readConnectionPragmas(db)`, and Diagnostics shows them |
| G-16 | `applyImport(fileUri, policy)` has no "Also restore app settings" flag. | BACKUP_RESTORE §5, §8 rule 6, §10 | Optional `options?: { restoreSettings: boolean }` on `BackupService.applyImport` and `BackupStore.applyImport` | Open: V1 never restores settings, and the preview of a file with settings says "App settings in this file are not restored" (BACKUP_RESTORE §5) |
| G-17 | A replayed abandoned fixture had no preview (the impact guard blocked every `fixture_update` on a fixture with a match), and the engines disagreed about a fixture whose status left `abandoned` while it still pointed at its old match: progress dropped while the no result still counted. | §39, §59, §99; wave-2 integration risk 1 | `TournamentSnapshot.supersededMatches`, `fixtureReplay.ts`, one result-counting rule, `MatchRepository.isSuperseded` | Closed in wave 3: the replay is previewable (`computeImpact`), `updateFixture` replays through the same plan with a required reason and an audited impact, the superseded match stays on record and read-only, and progress, standings, NRR, qualification, knockout advancement, stats, what-if and impact all use `countedFixtureSummary` |
| G-18 | "Toss not recorded" with Team B batting first: the setup store assumed Team A bats first, so the UI swapped the two sides before `submit` (and hid the option for fixtures). | §6–§8, §64, W-M4; wave-2 integration risk 5 | Optional `MatchSetupDraft.battingFirstTeamId`, `openingBattingTeam` | Closed in wave 3: the store builds `innings_started.battingTeamId` from the toss or the explicit choice and refuses to guess; the swap is gone, and "Toss not recorded" is offered for fixture matches too |

Behavioural gaps in cricket or tournament rules that do not need new API (the contract accepts the input, only the expected behaviour is open) are tracked in [EDGE_CASES.md §14](product/EDGE_CASES.md#14-summary-of-contract-gaps-and-inconsistencies-raised-by-these-cases): EC-B-15, EC-C-06, EC-T-19, EC-T-21, EC-Q-12, EC-Q-24, EC-Q-36, EC-X-01. Product questions are in [CONTRACTS.md §6](CONTRACTS.md#6-open-questions-for-the-product-owner); implementations use the defaults the contract already models.

---

## 5. Consistency log

Inconsistencies found in the design review of 2026-09-30 and how they were resolved. CONTRACT_REFERENCE.md was treated as canonical.

| # | Inconsistency | Resolution |
|---|---|---|
| C-1 | STATE_MACHINES §5 fixture diagram had `rescheduled → postponed` and lacked `rescheduled → abandoned`, unlike `canTransitionFixture`. | Diagram aligned to the guard; the wanted transitions moved to G-8; EDGE_CASES EC-T-13 and §14 updated. |
| C-2 | STATE_MACHINES §1 match diagram showed reopen only to `live`; `canTransitionMatch` allows `completed/abandoned → live \| paused`. | Added the `→ paused` reopen edges. |
| C-3 | `Team.shortName` is 2–5 characters in the contract, the DB CHECK allows 1–5 (EC-Q-02). | Documented: validation enforces 2–5; the CHECK is a looser backstop. No migration. |
| C-4 | Tap-to-score budget: REQUIREMENTS NFR-P-01 and PRD say ≤ 50 ms p95; AC-E4-10 said ≤ 100 ms; SCORING_ENGINE §12 mixed engine targets with product budgets. | AC-E4-10 set to NFR-P-01 (≤ 50 ms reference, ≤ 100 ms low-end). SCORING_ENGINE §12 relabelled as design targets that reference the NFR budgets. |
| C-5 | Timing tests asserted the raw budget, which flakes on slow CI. | UNIT_TEST_PLAN §0.1 and INTEGRATION_TEST_PLAN §0.1: assert 3× the budget and log the measured time; the budget itself is unchanged. |
| C-6 | ARCHITECTURE §7 described the wizard store as "step setters, commit"; the contract has `resume`, `update`, `goTo`, `saveStep`, `commit`, `reset`. | Table corrected. |
| C-7 | ARCHITECTURE §6 omitted `features/shared/` and the `Skeleton`, `StatLine` UI pieces that CONTRACTS.md WP-design-system requires. | Tree updated. |
| C-8 | "Domain architecture" (§102) had only the bounded-context table. | ARCHITECTURE §3.1 added: aggregates, invariants, value objects, domain services, ubiquitous language. |
| C-9 | CONTRACT_REFERENCE had no entries for several exported contract symbols (for example `MatchService.setPrePlayStatus/load/list/delete`, most `TournamentService` methods, `SettingsService`, `ImportReport`, `NewTournamentInput`, `Clock`, `ServiceErrorCode` values beyond three, the Player/Settings/Template/FormatPreset repositories, `SqlDatabase`, `MigrationReport`, `BUILTIN_FORMAT_PRESETS`, `RulesIssue(Code)`, `bye`, `legBye`, `swapStrike`, `selectBowler`, `batterIn`, `CommandResult`, `RedoStack`, `REDO_STALE`, `AsyncStatus`, `Toast`). | Entries added, describing the existing signatures only. `MatchSetupStore.submit` now documents the fixture branch (`startFixtureMatch`); `TournamentStore` and `HomeStore` point to G-5 and G-2. |
| C-10 | CONTRACTS.md WP-db requires history list filters/search/sort/paging, `findResumable({forPrompt})` and tournaments-list counts to be tested, but no integration step covered them (IT-DB-03 is round trips only). | IT-DB-10 added to INTEGRATION_TEST_PLAN §3; the matrix (M12, M14) points to it. |
| C-11 | REQUIREMENTS NFR-P-04 notes that CONTRACTS.md says replay < 50 ms "in node" while CONTRACT_REFERENCE says "on a mid phone". | Not a conflict: the node test is the CI gate, the phone figure is the device target. Left as documented. |
| C-12 | ACCEPTANCE_CRITERIA G-07 forbids hex literals outside `src/ui/theme`, but THEMES.md (print) requires the PDF print palette to live inside `src/export/pdf` because export must not depend on `src/ui`. | Integration, 2026-10-01: the print palette in `src/export/pdf/styles.ts` (named constants only) is the single documented exception. `src/__tests__/codeRules.test.ts` enforces G-07 with exactly that exception. |
| C-13 | CONTRACT_REFERENCE says every reader of a stored result accepts `win.method: 'penalty_runs'`, but backup validation still allowed only `normal`, `revised_target` and `par_score`, so a backup holding a penalty-runs win could not be imported. | Integration, 2026-10-01: the backup shape accepts `penalty_runs`, with regression tests in `validate.data.test.ts`. |
| C-14 | ACCEPTANCE_CRITERIA lists the global gates G-04 to G-08 as CHK tests, but only `src/ui` checked its own files. | Integration, 2026-10-01: `src/__tests__/codeRules.test.ts` checks the whole tree (comments, SQL comments, domain purity, layering, colours, network). The WP-0 sql.js smoke test moved from `src/domain/__tests__` to `src/db/__tests__`, so `src/domain` imports no SQLite. |
