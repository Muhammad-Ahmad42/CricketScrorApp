# Scorebook — Integration Test Plan (§91)

These tests run the application services (`src/services/*`) over **real repositories**, the **real migrations** (`MIGRATIONS` in `src/db/migrations/index.ts`) and the **real domain engines**. The database is the sql.js `SqlDatabase` adapter. No mocks sit between the service and SQLite. The two §91 flows are:

* **IT-M**: create match → score → persist → close → reopen → resume → finish innings → complete → scorecard.
* **IT-T**: create tournament → teams → pools → fixtures → play → complete → standings → NRR → qualifiers → knockout → semifinal → final → complete. This is the 8-team §92 shape.

Both flows reuse the concrete data of [UNIT_TEST_PLAN.md](UNIT_TEST_PLAN.md): the golden match G1, and the fixtures POOL-A and POOL-B. Every expected number here is therefore already pinned by a unit case, and a failure points to either persistence or the engine.

## 0. Harness

### 0.1 Files and environment

| Item | Location / rule |
|---|---|
| Test files | `src/services/__tests__/integration.match.test.ts`, `src/services/__tests__/integration.tournament.test.ts` (WP-services-stores). The first line of each file is `/** @jest-environment node */`. |
| sql.js adapter | `src/db/testing/sqljsDatabase.ts` (WP-db). It implements `SqlDatabase` over `initSqlJs()`, with a writer mutex and `withTransactionAsync(task(tx))`. At open it runs `PRAGMA foreign_keys = ON`. (WAL and `synchronous` have no effect in memory; that is covered on device in FAILURE_RECOVERY_TESTS.) |
| Migrations | `runMigrations(db, { now })` from `src/db/migrate.ts`, applying the real `MIGRATIONS`. No hand-written schema in tests. |
| Services | `createTestApp(db, deps)` in `src/services/testing/createTestApp.ts` (proposed name, WP-services-stores). It builds `AppServices` from `createRepositories` and injected deps through the contract's `CreateAppServices` factory over `ServiceDeps` (`services/contracts.ts`), with `openDatabase: async () => db`. Stores under test get it through `setAppServices` (`AppServicesRegistry`). |
| Injected deps (`ServiceDeps`) | `clock: fixedClock('2026-05-01T10:00:00.000Z', stepMs 1000)`; `newId: sequentialIds('id')` (`id-0001`, …); `newSeed: seedSource([847291])`; `fileSystem: memoryFileSystem()`; `printer: fakePrinter()` (returns `file:///cache/<n>.pdf` and records the HTML); `sharer: fakeSharer()`. |
| Run | `npx jest src/services`. The complete tournament flow has a 30 s budget. |
| Timing assertions | Assert 3× the documented budget (IT-DB-09: < 30 ms instead of < 10 ms) and log the measured median, as in UNIT_TEST_PLAN §0.1, so a slow Windows CI box does not flake. |
| Comments | none in test files (CLAUDE.md). Step IDs go in the `it` names. |

### 0.2 Simulated restart

The spec asks for "close → reopen" (§23, §91). Two restart modes are used:

| Mode | How | What it proves |
|---|---|---|
| **R1 warm restart** | Drop every reference to the services and stores. Build a new `createTestApp(sameDb, freshDeps)`, which gives new repository instances on the **same** `SqlDatabase`. Call `bootstrap()`. | Nothing survives in memory: no module-level caches, no redo stack, no stale store state. |
| **R2 cold restart** | Take `bytes = sqlJsDb.export()`. Build a new `SQL.Database(bytes)`, then a new adapter, then `runMigrations` (a no-op), then `createTestApp`, then `bootstrap()`. | Only what was **committed** to the file image exists after "process death". |

R2 is taken only between use cases, never inside an open transaction. Mid-transaction crashes are covered by FAILURE_RECOVERY_TESTS FR-01 with its fault-injecting adapter.

### 0.3 Shared helpers (test-only, WP-services-stores)

| Helper | Behaviour |
|---|---|
| `score(app, matchId, intent)` | 1. Loads `LiveMatch`. 2. Runs `buildEvents(setup, state, intent)`. 3. Calls `app.matches.record(matchId, state.lastSeq, events)`. 4. Returns the new state. It asserts `ok`. This mirrors `useLiveMatchStore.dispatch`. |
| `scoreAll(app, matchId, intents[])` | Calls `score` for each intent in order. |
| `scriptInnings({runs, wickets, balls, lastBallRuns?})` | Deterministic intents giving exactly that line. Singles and twos are chosen so the target is never reached early. Wickets are bowled with the next batter in the same action. Bowlers are selected at each over start. |
| `playFixture(app, fixtureId, {battingFirst, first, second})` | 1. `startFixtureMatch`. 2. `innings_started`. 3. The first innings script. 4. The second `innings_started`. 5. The second script. 6. `match_ended {natural}`. |
| `rowCount(db, table, where?)` | `SELECT count(*)`. |
| `standingsRow(evaluation, stageId, poolName, teamName)` | Reads a `StandingRow` out of `TournamentEvaluation`. |

---

## 1. IT-M — Standalone match lifecycle

Rules: fixture **M3** (3 overs, 11-a-side, `maxOversPerBowler 2`, powerplay over 1).
Teams: Lions and Tigers from the unit fixtures, created through `TeamService.create`. Each has 11 players plus one substitute: L12 Usman and T12 Ali.

| Step | Action | Assertions |
|---|---|---|
| IT-M-01 | Fresh DB → `runMigrations` → `bootstrap()` | `schemaVersion` = `LATEST_SCHEMA_VERSION` (1); one `schema_migrations` row; `resumable` []; `projectionsRebuilt` 0; `integrityIssues` []; `PRAGMA foreign_keys` = 1 |
| IT-M-02 | `TeamService.create` Lions (12 players) and Tigers (12); `createVenue('Gaddafi Stadium')` | `teams` 2, `players` 24, `venues` 1 |
| IT-M-03 | `MatchService.createMatch(input, [innings_started {0, LIO, L1, L2, T7}])`. `input` carries M3 rules, squads (L12/T12 with `isSubstitute: true`) and toss Lions/bat. | Returns `LiveMatch` with `lifecycle` live and `lastSeq` 1. Rows: `matches` 1 (`status` live, `projection_version` = `SCORING_PROJECTION_VERSION`, `result_json` NULL); `match_players` 24 (2 with `is_substitute` 1); `match_events` 1 (`seq` 1, `kind` innings_started, `p_striker_id` L1); `innings` 1 row (runs 0, wickets 0, legal_balls 0, status in_progress). |
| IT-M-04 | Score G1 over 1 (`1 4 WD 0 2 6 1`) with `score` | `match_events` 8. The `innings` row is 15/0, legal 6, extras wides 1. State: pending `select_next_bowler`, T7 line `1-0-15-0` (U-CARD over 1). Each record is its own transaction: 7 distinct `action_id`s. |
| IT-M-05 | **R1 warm restart**, then `bootstrap()` and `load(matchId)` | `resumable` = [this match] with innings line 15/0, 6 balls. `load().state` deep-equals the state captured before the restart. `lastSeq` 8. |
| IT-M-06 | `selectBowler(T8)`, then over 2 up to and including `wicket({bowled, nextBatterId: L3})` | The wicket delivery and `batter_in` share one `action_id` (two rows). The `p_player_id` of `batter_in` is L3. State 15/1, L3 on strike. |
| IT-M-07 | `undo(matchId, lastSeq)` | `truncateFrom` deletes **2** rows (`match_events` back to 10). Projection 15/0 with L2 on strike. The returned `undone` has 2 events. |
| IT-M-08 | `redo(matchId, lastSeq, undone)` | The 2 rows come back with the **same** ids and seqs. State equals IT-M-06. |
| IT-M-09 | `record(matchId, lastSeq − 1, [dot])` (a stale writer) | `CONFLICT`. Row counts unchanged. The `matches.updated_at` projection is unchanged. |
| IT-M-10 | Finish over 2 (`1 NB+1 0 LB1 2`), `selectBowler(T7)`, over 3 (six singles) | Innings 0 is 27/1 (18 legal balls); the `innings` row has `status` complete and `completion_reason` overs_complete; 2 `partnerships` rows (15/8 and 12/10 balls); pending `start_next_innings {1}`. Cards equal U-CARD-01…11. |
| IT-M-11 | **R2 cold restart** → `bootstrap()` | `resumable` still lists the match (live). `load` equals the pre-restart state, including the pending action. `findResumable({forPrompt:true})` includes it. |
| IT-M-12 | SAVE & EXIT: `dismissResume(matchId)` | `resume_dismissed_at` is set. `findResumable({forPrompt:true})` excludes the match; `findResumable()` still includes it (Continue Match). After R1 the startup prompt list is still empty. |
| IT-M-13 | `innings_started {1, TIG, T1, T2, L10}` via `record` | `resume_dismissed_at` is cleared in the same transaction; the prompt list includes the match again. 2 `innings` rows. `chase = {target 28, runsRequired 28, ballsRemaining 18}`. |
| IT-M-14 | Chase over 1 (`4 4 1 1 2 6`) | 18/0; chase state as U-CRR-02 (needs 10 from 12, RRR 5.00). |
| IT-M-15 | Over 2 (L11): `1 0`, `wicket({caught, fielderIds:[L7], nextBatterId:T3})`, `2 1 4`; over 3 (L10): `1 1` | 28/1 at 14 legal balls. Pending `confirm_result`, text "Tigers won by 9 wickets (4 balls left)". `matches.status` is still live; `result_json` and `summary_json` are NULL (standings are never fed before confirmation). |
| IT-M-16 | `undo` (the last single) | Pending null; 27/1, needs 1 from 5. Then `redo` → `confirm_result` again. |
| IT-M-17 | `record(matchId, lastSeq, [match_ended {natural}])` | `matches.status` completed. `result_json` = win TIG, wickets 9, ballsRemaining 4. `winner_team_id` TIG. `completed_at` set. `summary_json` deep-equals U-SUM-02. `findResumable()` no longer lists it. **No** `audit_events` row (live scoring of a standalone match is not audited). |
| IT-M-18 | Scorecard: `load(matchId)` + the export HTML builder via `ExportService.scorecardPdf` (`fakePrinter`) | Both innings cards equal U-CARD-01…15. The printed HTML contains "Tigers won by 9 wickets (4 balls left)", "b Shaheen", "c Amir b Abdul", "Gaddafi Stadium", both team names, extras "3", and one partnership line per innings. Names are HTML-escaped (a team renamed `Lions & <Co>` renders `Lions &amp; &lt;Co&gt;`). |
| IT-M-19 | **R2 cold restart** → `bootstrap()` → `list({sort:'recent'})` | `resumable` []. The history item has status completed, innings lines `27/1 (18)` and `28/1 (14)`, and result win TIG. |
| IT-M-20 | Historical edit of the completed match: `previewHistoryEdit` replacing the bowled delivery with an lbw on the same ball | `requiresReason` true; `impact` null (standalone); `baseFingerprint` is 8 hex chars; `outcome.resultChanged` false. |
| IT-M-21 | `applyHistoryEdit(ops, null, fp)` | `CONFIRMATION_REQUIRED`; the log is unchanged. |
| IT-M-22 | `undo` (removes `match_ended`; allowed without a reason for a standalone match), then `applyHistoryEdit(ops, 'Umpire signal misread', fp)` | `CONFLICT`: the fingerprint moved. `redo` restores `match_ended`, then preview again and apply with the new fingerprint → ok. |
| IT-M-23 | After IT-M-22 | One `audit_events` row: `action` match_history_edited, `tournament_id` NULL, `match_id` set, `previous_value` = [the bowled delivery], `new_value` = [the lbw delivery], reason stored. The card shows `lbw b Shaheen`. `summary_json` is rewritten (identical standings-relevant data). |
| IT-M-24 | Invalid edit: `previewHistoryEdit` turning innings-0 ball `2` into `3` | `VALIDATION` with `domainCode` `NATURAL_RESULT_NOT_REACHED`: the target becomes 29 and the tail `match_ended` no longer holds. The DB is unchanged. |
| IT-M-25 | Second standalone match: `createMatch` + 3 deliveries, then `discard` | Its `matches`, `match_players`, `match_events`, `innings` and `partnerships` rows are all gone (cascade). The first match is untouched. |
| IT-M-26 | Integrity after the flow | `PRAGMA foreign_key_check` returns no rows; `validateLog` of every stored match is ok. |

---

## 2. IT-T — Tournament lifecycle, 8 teams → final (§91, §92)

Structure: built-in template `builtin:8-team-t20`. A group stage of 2 pools × 4 in single round robin, then one knockout stage "Knockouts" with `decidesChampion`, entry `top_per_pool 2` and seeding `fixed`. Points and NRR are the defaults: 2/1/1/0, ICC. Tie-breakers are the defaults: Points → NRR → Head-to-Head → Most wins → Organizer decision.

Match rules are overridden to 2 overs and 6-a-side (all out at 5 wickets), which keeps each match to about 30 events. The group results are exactly POOL-A and POOL-B from the unit plan.

Teams:
- Pool A: Lions, Tigers, Eagles, Hawks.
- Pool B: Bulls, Bears, Cobras, Wolves.
- Seeds 1..8 in that order. Six players each.

### 2.1 Setup

| Step | Action | Assertions |
|---|---|---|
| IT-T-01 | Fresh DB, `bootstrap`; `TeamService.create` × 8 | `teams` 8, `players` 48 |
| IT-T-02 | `TournamentService.create({name:'Scorebook Cup', season:'2026', structureKind:'groups_knockout', templateId:'builtin:8-team-t20', …})` | Status `draft`; `revision` ≥ 0; `tournament_rules` has 2/1/1/0 and `nrr_mode` icc; audit `tournament_created` |
| IT-T-03 | `addTeams` × 8 with seeds 1..8; `setStatus('registration')` | `tournament_teams` 8, all `active`; revision increased |
| IT-T-04 | `saveStructure` from `instantiateTemplate` with `defaultMatchRules` = 2 overs, 6-a-side; `setStatus('structure_configured')` | 2 stages (order 0, 1); stage 1 `decidesChampion`; 2 pools; 4 entry slots A1, B1, A2, B2 (indexes 0–3, role entry) |
| IT-T-05 | `previewPoolAssignment(group, {kind:'random', seed:847291})` twice | Identical `PoolAssignment`s with `seed` 847291; nothing written (`pool_teams` 0) |
| IT-T-06 | `previewPoolAssignment(group, {kind:'manual', assignment: A = teams 1–4, B = teams 5–8})`, persisted with `saveStructure(poolEntries)`; `setStatus('pools_configured')` | `pool_teams` 8; `poolWarnings` [] (even pools, no unassigned entrant) |
| IT-T-07 | `generateFixtures(group)` | `FixturePlan`: 12 drafts, 6 per pool, 3 rounds per pool, every pair once, `matchNumber` 1..12. Nothing is persisted yet (`fixtures` 0). |
| IT-T-08 | `confirmFixtures(group, plan)` | `fixtures` 12 (status scheduled); audit `fixtures_generated`; revision +1 |
| IT-T-09 | `generateFixtures(knockouts)`; `confirmFixtures` | 3 fixtures. SF1 (round 1, pos 0) has slot sides A1 v B2; SF2 (round 1, pos 1) has B1 v A2; the Final (round 2, pos 0, `is_final` 1) has slot sides "Winner SF1" v "Winner SF2". 2 progression slots (indexes 4, 5; role progression; `bracket_winner` sources). `stage_slots.seed` for A1, B1, A2, B2 = 1, 2, 3, 4. Match numbers 13–15. |
| IT-T-10 | `setStatus('fixtures_generated')`; `evaluate()` | 12 group rows at 0 points, NRR null; slots `pending`; `progress {0, 15}`; `currentStageId` = group; `TournamentListItem` `fixturesDone/Total` 0/15 |

### 2.2 Group stage

Every match goes through `playFixture` with the scores in the POOL-A and POOL-B tables of UNIT_TEST_PLAN §22. Match 6 uses this exact script, because IT-T-19 edits it:

- Tigers over 1: `6 1 4 1 2 0`.
- Tigers over 2: `W 4 1 W 2 4` → 25/2.
- Eagles over 1: `1 W 2 1 W 4`.
- Eagles over 2: `2 W 1 W 4 4` → 19/4. Eagles' 19th run comes on the 12th ball.

Checks run after **every** group match:
- The fixture `status` is completed.
- `fixtures.match_id` = the match.
- `Fixture.matchSides` equals the played teams.
- The match `summary_json` is present.
- `tournaments.revision` is strictly greater than before.
- Exactly one new `audit_events` row with `result_recorded`.
- `evaluate()` succeeds.

| Step | After | Assertions |
|---|---|---|
| IT-T-11 | Match 1 `startFixtureMatch` | The match has `tournament_id` and `fixture_id`, teams = the fixture sides (team A = side A). The fixture's `matchSides` is set. The tournament moves to `active` (first match started; §62). The group stage becomes `active`. |
| IT-T-12 | Match 1 completed (Lions 30/2 v Tigers 20/4) | Lions P1 W1 Pts 2, NRR +5.000; Tigers P1 L1, NRR −5.000; Eagles and Hawks P0, NRR null; `progress {1, 15}` |
| IT-T-13 | Matches 1–4 completed | Lions 4 (2 played), Tigers 2, Eagles 2, Hawks 0. Qualification toward Knockouts: Lions `qualified`/`mathematical` (only one of Tigers and Eagles can reach 4; Hawks at most 2); Hawks `eliminated`/`mathematical`; Tigers and Eagles `in_contention`. Slot A1 = Lions `provisional` (Lions could still finish 2nd on NRR). |
| IT-T-14 | Matches 1–6 (Pool A) completed | Pool A table exactly U-STD-01 (Lions +3.255, Tigers +1.333, Eagles −1.333, Hawks −3.118; Pts 6/4/2/0). Pool A `complete`. Slots A1 = Lions and A2 = Tigers, `final`. Tigers' explanation: "Tigers have mathematically qualified for the Knockouts as Pool A runners-up (…)". |
| IT-T-15 | Matches 7–12 (Pool B) completed | Pool B exactly U-STD-04: Bulls, Cobras, Bears (all 4 pts, separated by NRR +2.121 / +1.310 / +0.500), Wolves. Row notes: Bulls separatedBy `nrr`. `unresolvedTies` [] (NRR separates). The group stage is `completed`; `progress {12, 15}`; `currentStageId` = Knockouts. |
| IT-T-16 | Slots and knockout sides | Slots B1 Bulls and B2 Cobras `final`. `resolveFixtureTeams(SF1)` = {Lions, Cobras, frozen false}; SF2 = {Bulls, Tigers}; Final = {null, null}. `StageEvaluation.qualification` for Eagles, Hawks, Bears and Wolves is `eliminated`/`mathematical`. |

### 2.3 Knockouts

| Step | Action | Assertions |
|---|---|---|
| IT-T-17 | SF1: `startFixtureMatch(SF1)` → Lions 32/2 v Cobras 28/4 | The match has `rules.superOver.enabled` = true (forced by `tiedMatch: super_over`); `matchSides` {Lions, Cobras}; the knockout stage is `active`. Result Lions by 4 runs. Slot "Winner SF1" (index 4) = Lions, `final`. This holds even though Lions also occupies entry slot A1 (the one-slot rule applies only to entry slots). |
| IT-T-18 | SF2: Bulls 27/3 v Tigers 27/4 → pending `resolve_tie` → `super_over_started {1}` → Tigers 8/1 (6 balls), Bulls 9/0 (3 balls) → `match_ended {natural}` | `result_json` = `{type:'tie', decider:{super_over, Bulls, 1}}`, text "Match tied — Bulls won the Super Over". `summary.superOvers` has 2 innings. Slot "Winner SF2" = Bulls (`tie_decider`). Knockout stages have no table and no NRR; the group tables are unchanged (U-STD-01 and U-STD-04 still hold). |
| IT-T-19 | **Correction after standings (§93)**: `previewHistoryEdit(match 6, [replace Tigers ball 1 (6) with 0, replace Tigers ball 2 (1) with 0])` | The outcome replays cleanly: Tigers 18/2, target 19, Eagles reach 19 on the last ball; `resultChanged` true. `impact` (`match_result_change`): Pool A order becomes Lions, Eagles, Tigers, Hawks. A slot change A2 Tigers → Eagles with `playedFixtureIds` [SF2]. `requiresReason` true. |
| IT-T-20 | `applyHistoryEdit(match 6, ops, 'Scorer entered a six by mistake', fp)` | Audit `result_corrected` with removed/inserted events and the previewed impact. Standings: Eagles 4, Tigers 2. SF2 `matchSides` still {Bulls, Tigers}; `resolveFixtureTeams(SF2).frozen` true. "Winner SF2" still Bulls. Revision +1. |
| IT-T-21 | Final: slots resolve to {Lions, Bulls}; `startFixtureMatch(Final)` → Bulls 30/3 v Lions 31/2 in 1.5 | Result "Lions won by 3 wickets (1 ball left)". `evaluate().champion` = {teamIds [Lions], basis 'final', fixtureId Final}. `tournaments.champion_json` = [Lions id], written in the same transaction as the result. `progress {15, 15}`. |
| IT-T-22 | `setStatus('completed', null)` | Allowed (`championDecided`). `TournamentListItem`: `championName` "Lions", `fixturesDone/Total` 15/15, status completed. Audit `tournament_status_changed`. |
| IT-T-23 | **R2 cold restart** → `bootstrap()` → `evaluate(tournamentId)` | The evaluation deep-equals the one before the restart (standings, slots, champion). `resumable` []. `staleSummaryMatchIds` []. |
| IT-T-24 | `stats(tournamentId)` | `totalMatches` 15; `completedMatches` 15. The team stats of Lions come from the group table (Pts 6, NRR +3.255) and wins summed across stages (5 wins). Every player in a squad has `matches` ≥ 1. Super-over runs are excluded from `totalRuns`. |
| IT-T-25 | `auditLog(tournamentId, {limit:100})` | Actions include `tournament_created`, `team_added` (≥ 1), `stage_created`, `pools_generated` or `pools_replaced`, `fixtures_generated` × 2, `match_started` × 15, `result_recorded` × 15, `result_corrected` × 1, `tournament_status_changed`. (Whether `team_added` is written per team or per call is not fixed by the contract.) The entries are newest first and paging with `before` works. |
| IT-T-26 | Integrity | `PRAGMA foreign_key_check` returns no rows. Every `fixtures.match_id` match has `fixture_id` = that fixture. `revision` was strictly monotonic across all steps (recorded after each step). |

### 2.4 Negative checks inside the tournament flow

| Step | Action | Assertion |
|---|---|---|
| IT-T-30 | Before IT-T-11: `previewChange(pool_swap Hawks ↔ Wolves)`, then `addFixture` (bumps the revision), then `applyChange(change, null, oldPreview)` | `CONFLICT`; nothing written |
| IT-T-31 | During the group stage: `removeTeams([Hawks])` | `FORBIDDEN_STATE` (fixtures reference the team; withdraw instead) |
| IT-T-32 | After IT-T-21: `previewChange(fixture_delete Final)` | `impact.blocked` set, severity `destructive`; `applyChange` refused |
| IT-T-33 | `MatchService.discard(match 1)` | `FORBIDDEN_STATE` (tournament matches cannot be discarded) |
| IT-T-34 | `TournamentService.delete(id, {typedName:'Scorebook Cup', deleteCompletedMatches:false})` | `CONFIRMATION_REQUIRED`; with a wrong name → `VALIDATION`; `previewDelete` → {matches 15, completedMatches 15, events n} |

---

## 3. Supporting persistence suites

These run in the same harness and back up the two flows. They are owned by WP-db (`src/db/__tests__`) unless noted.

| ID | Suite | Key assertions |
|---|---|---|
| IT-DB-01 | Migration runner | Fresh DB → v1. A re-run is a no-op. A DB with version 2 recorded → `SchemaTooNewError` and nothing is touched. A failing migration rolls back, including its `schema_migrations` row. `foreignKeysOff` migration: FKs are off inside and back on after; an orphan row makes `foreign_key_check` abort the migration. |
| IT-DB-02 | Transactions | Two concurrent `withTransactionAsync` calls are serialised. A write on the root DB during an open transaction waits and is **not** rolled back with it. A throw inside the task rolls back everything. |
| IT-DB-03 | Round trips | Every repository returns deep-equal domain objects (JSON columns, booleans, nulls). `matchSides` and generated columns are ignored on write. |
| IT-DB-04 | Payload FKs | A player referenced only in `innings_started`, `batter_in`, `bowler_selected` or `batter_dismissed` fielders cannot be removed (`removeSquadPlayer` throws). An absentee in `innings_ended` is refused by the `json_each` check. |
| IT-DB-05 | Negative schema cases (DATABASE.md) | Each insert fails: a fixture of another tournament, a non-member pool team, a squad of a third team, a progression slot with a pool source, a second `is_final` in a stage, a duplicate bracket position, deleting a tournament with matches (RESTRICT), deleting a venue in use. |
| IT-DB-06 | Deferred FKs | A knockout tournament with completed matches exports and re-imports in one transaction in reverse order; a dangling reference aborts the COMMIT. |
| IT-DB-07 | Two-phase upserts | Swapping the `order_index` of two pools and the `slot_index` of two slots succeeds. |
| IT-DB-08 | `truncateFrom` | A wrong `expectedLastSeq` throws and rolls back. The deleted count must equal `expectedLastSeq − fromSeq + 1`. |
| IT-DB-09 | Performance | Appending a ball plus its projection write takes < 10 ms (median of 50) on sql.js. |
| IT-DB-10 | List and resume queries (§23, §81, §82) | With 30 seeded matches (standalone and tournament, every status): `MatchRepository.list` search by title and by team name, filter by status, tournament and team, sort `recent` / `oldest` / `scheduled`, and paging return exactly the expected ids in order with no duplicates across pages; each `MatchListItem` carries the innings lines from projections (no replay). `findResumable()` lists every live/paused match most recent first; `findResumable({forPrompt: true})` omits the one with `resume_dismissed_at` and includes it again after the next append. `TournamentRepository.list` returns SQL fixture counts (done/total) and `championName` from `champion_json`. |
| IT-BK-01 (WP-services-stores) | Backup round trip | `exportBackup({full})` of the IT-T database → wipe → `applyImport` → `evaluate` equals the original; projections are rebuilt by replay (`rebuiltMatches` 15). |

### 3.1 App-level flow (wave-2 integration)

`src/__tests__/appFlow.test.tsx` renders the real `src/app` route modules, including the root layout (bootstrap gate, theme, toasts) and the tab layout. They run on the real stores and services over the sql.js adapter. Only `expo-router` and `expo-router/js-tabs` are replaced, by a test navigator (`src/__tests__/support/appRouter.tsx`, route table in `support/appHost.tsx`). It mirrors the app's navigators:

- a root stack of route groups (tabs, `match/new`, `match/[matchId]`, `tournament/new`, `tournament/[tournamentId]`, settings and teams screens);
- a nested stack inside each group layout;
- lower screens stay mounted but hidden, and only the top screen is focused, so `useFocusEffect` runs on focus.

`replace` swaps the top screen within a group, or the whole group when the target lies in another one. Any navigation to a path with no route file fails the test.

| ID | Flow | Key assertions |
|---|---|---|
| IT-APP-01 | Route table | The host registers exactly the route files under `src/app`, so a new route must be added there. |
| IT-APP-02 | Standalone 2-over match | Home → NEW MATCH → overs 2 → teams → squads → toss → openers → Start (`replace` to `/match/[id]/score`). Then ball by ball with the pad, a wide, a bowled wicket, the next-bowler panel, the End of innings confirmation and the start-innings panel, through to the result panel. Confirm → scorecard → Back → History tab shows the match with its result. The stored innings are 21/1 and 22/0. |
| IT-APP-03 | Tournament fixture → match → standings (§66) | Tournaments tab → dashboard → Start next → `/match/new` with the fixture params → players step. The match is linked to the fixture and played to a result. Confirm → scorecard → Back → the still-mounted dashboard shows the refreshed standings (refreshed by the live-match store, not by a remount), and the full Standings screen agrees. |

Typed routes: `node scripts/typed-routes.mjs` writes `.expo/types/router.d.ts`, which `expo start` would also write. With that file present, `npx tsc --noEmit` rejects any `href` that names a missing route.

## 4. §91 traceability

| §91 step | IT-M / IT-T steps |
|---|---|
| Create match | IT-M-02, 03 |
| Score | IT-M-04, 06, 10, 14, 15 |
| Persist | IT-M-03…17 (row assertions) |
| Close → reopen → resume | IT-M-05 (R1), 11 (R2), 12, 13 |
| Finish innings | IT-M-10 |
| Complete | IT-M-15…17 |
| Scorecard | IT-M-18, 19 |
| Tournament create → teams | IT-T-01…03 |
| Pools | IT-T-05, 06 |
| Fixtures | IT-T-07…09 |
| Play → complete | IT-T-11…15 |
| Standings → NRR | IT-T-12, 14, 15 |
| Qualifiers | IT-T-13…16 |
| Knockout → semifinal | IT-T-17, 18 |
| Final → complete | IT-T-21, 22 |
