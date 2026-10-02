# Scorebook — Failure & Recovery Tests (§93)

§93 lists ten failures the product must survive: app crash, battery loss, device restart, invalid import, corrupt data, duplicate import, database failure, interrupted PDF generation, tournament edit after fixtures, and match correction after a standings update. For each one this document gives:
- how to **simulate** it;
- the **expected outcome**, derived from the contracts (ARCHITECTURE §5, DATABASE §1/§6/§7, CONTRACT_REFERENCE `services/contracts.ts`);
- the **assertions** that prove it.

Scenarios FR-11 onwards cover failure modes the architecture introduces itself: stale writers, degraded logs, engine upgrades, migrations.

## 0. Levels and tools

| Level | Where | Used for |
|---|---|---|
| **DOM** | `npx jest src/domain` | Pure invariants (replay totality, validation, fingerprints) |
| **INT** | `npx jest src/services src/db` (sql.js, real migrations, `/** @jest-environment node */`) | Atomicity, rollback, restart, import, conflicts |
| **DEV** | Android emulator/device with Maestro (E2E_TEST_PLAN) and `adb` | Real process death, power loss, reboot, real SQLite WAL + `synchronous = FULL`, real file system and printing |
| **MAN** | A person on a device, with a checklist | Cases that cannot be automated reliably (pulling the battery) |

### 0.1 Fault-injection harness (INT, WP-db test utility)

These go in `src/db/testing/faultInjectingDatabase.ts`, a wrapper that implements `SqlDatabase` around the sql.js adapter:

| Capability | Behaviour |
|---|---|
| `failOn({ sql: RegExp, occurrence: n, error })` | The n-th statement matching `sql` throws `error` inside or outside a transaction. Examples: `SqliteError('SQLITE_FULL: database or disk is full')`, `SQLITE_IOERR`, `SQLITE_CONSTRAINT`, `SQLITE_BUSY`. |
| `failOnCommit(n)` | The n-th COMMIT throws, so the adapter must ROLLBACK. |
| `durableImages` | After every successful COMMIT, and at root-level autocommit statements, the wrapper stores `sqlJsDb.export()`. The **last durable image** is what a real device holds after an instantaneous power loss with `synchronous = FULL`. |
| `crashAt({ sql, occurrence })` | Throws `SimulatedCrash` at that statement and **freezes** the wrapper: every later call rejects, as if the process were dead. The test then reopens from `durableImages.at(-1)` with a fresh adapter, fresh services and `bootstrap()` (restart mode R2 of the integration plan). |
| `statementLog` | Every statement with its parameters, for "nothing else was written" assertions. |

Standard post-recovery assertions, "**RECOVERED-OK**":
1. `bootstrap()` returns ok.
2. `PRAGMA foreign_key_check` returns no rows.
3. For every match: `validateLog(setup, events).ok`, **or** the match is listed in `integrityIssues` and was not written to.
4. For every match: the stored projection equals `rebuildProjections` output. This is a dry run that compares the rebuilt `MatchProjection` with the stored rows.
5. For every tournament: `evaluate()` succeeds.

---

## FR-01 App crash

| ID | Level | Simulation | Expected outcome | Assertions |
|---|---|---|---|---|
| FR-01a | INT | While recording G1 ball 2 (`scoreRuns(4)`): `crashAt({sql:/INSERT INTO match_events/, occurrence:1})` | The ball never happened: the transaction did not commit. | After reopen, `lastSeq` equals the pre-tap value; score 1/0; RECOVERED-OK; `record` of the same ball with the same `expectedLastSeq` succeeds and gets that seq. |
| FR-01b | INT | The same, but `crashAt` the projection `UPDATE matches` **after** the event INSERT (same transaction) | The event and its projection are both absent (atomic). | No event row; the `innings` row shows 1/0; RECOVERED-OK. |
| FR-01c | INT | Crash after COMMIT, before the store publishes (crash on the next statement, e.g. the post-commit read) | The ball is recorded. On restart the §23 prompt shows the new score. | `findResumable({forPrompt:true})` lists the match at 5/0. `load().state.lastSeq` is 2. |
| FR-01d | INT | Tournament match 12 in IT-T: crash at the `audit_events` INSERT of the `match_ended` transaction | None of these exist: the event, `matches.status = completed`, `summary_json`, the fixture mirror, the stage status, the revision bump, `champion_json`, the audit row. | The pre-transaction revision is unchanged. Fixture 12 is `live`. `evaluate()` has 11 completed matches. Recording `match_ended` again works. |
| FR-01e | INT | `applyHistoryEdit` with a crash in the middle of `replaceAll` (after the DELETE, during the INSERTs) | The old log is intact. | The event count and `logFingerprint` equal the pre-edit values; no audit row. |
| FR-01f | INT | `TournamentService.applyChange(pool_move)` with a crash at the 2nd fixture INSERT of the plan | No part of the `ChangePlan` is applied. | `pool_teams`, `fixtures` and `revision` are unchanged; no audit row. |
| FR-01g | INT | `createMatch(input, [innings_started])` with a crash at the `match_events` INSERT | No match row and no squad rows: no "created-but-unstarted" match. | `matches` count is unchanged. |
| FR-01h | DEV | E2E-02: `stopApp` mid-over (force stop = process death), then `launchApp` | The resume prompt shows the team, score and overs of the last completed ball. RESUME gives the identical header and current-over chips. | E2E-02 assertions |
| FR-01i | DEV | `adb shell am force-stop pk.harris.scorebook` and `adb shell am kill` while the app is backgrounded on the scoring screen; also `adb shell am crash pk.harris.scorebook` (Android 13+) right after a tap | As FR-01h. The last tapped ball is either fully present or fully absent. | Maestro: `resume-text-score` matches one of the two expected scores. Diagnostics FK check is "No problems found". |
| FR-01j | DEV | Crash during the tournament wizard (after the "Pools" step was saved, before fixtures) | The wizard resumes from the tournaments list in its saved state (`pools_configured`); nothing half-written. | `tournaments-row-1` status; opening it resumes at Fixtures. |

## FR-02 Battery loss / power cut

| ID | Level | Simulation | Expected outcome | Assertions |
|---|---|---|---|---|
| FR-02a | INT | For G1, at **every** statement index k of the whole flow: `crashAt(k)`, then reopen from the last durable image (a sweep of about 600 runs, completed within 60 s) | Every reopened DB satisfies RECOVERED-OK. The replayed state equals a prefix of G1 at an action-group boundary: never half an action, e.g. never a wicket without its `batter_in`. | Per k: `events` is a prefix of the G1 log and ends at an actionId boundary. |
| FR-02b | DEV | Emulator: tap a ball, then within 0–500 ms (randomised) `adb emu kill` (hard power-off of the guest). Cold boot, launch. Repeat 20 times. | Every commit acknowledged before the kill survives (`synchronous = FULL`, WAL). The DB is never corrupt. | Diagnostics FK check is clean; `diag-text-pragmas` shows `foreign_keys=1 journal_mode=wal synchronous=2`; the resume prompt score is ≥ the last score shown before the kill. |
| FR-02c | MAN | A physical Android phone with a removable battery, or a forced hard power-off (hold power, emergency power off) during rapid scoring: 5 attempts | As FR-02b. | Checklist in AC-E11-05 |
| FR-02d | INT | Unit check of the client configuration: `src/db/client.ts` issues `PRAGMA foreign_keys = ON; journal_mode = WAL; synchronous = FULL` at open, and never inside a migration | Pragmas applied in the right place. | A spy adapter records the pragma statements before the first migration. |

## FR-03 Device restart

| ID | Level | Simulation | Expected outcome | Assertions |
|---|---|---|---|---|
| FR-03a | DEV | A live match with the app in the background, then `adb reboot`; after boot, launch the app | The §23 prompt "MATCH IN PROGRESS / Lions 15/1 / 1.2 overs / [RESUME] [SAVE & EXIT] [DISCARD]". The redo stack is gone (redo disabled). | `resume-prompt` texts; `score-btn-redo` disabled after RESUME |
| FR-03b | DEV | The same with the match **paused** (rain) | The prompt appears; RESUME shows the `prompt-resume-play` state. | `prompt-resume-play` visible |
| FR-03c | DEV | SAVE & EXIT, then reboot | No startup prompt; the match is under Continue Match; the next ball clears the dismissal. | E2E-02 steps after a reboot |
| FR-03d | INT | R2 restart between every IT-M step (parameterised run) | Every step's assertions still hold after a restart inserted before it. | IT-M run with `restartBetweenSteps: true` |

## FR-04 Invalid import

Each file lives in `e2e/maestro/fixtures/invalid/` and is also generated in INT tests from a valid export of IT-T.

| ID | File defect | Expected `ImportPreview` | Then |
|---|---|---|---|
| FR-04a | Not JSON (`{"format":`) / 0 bytes | `ok:false`, issue `INVALID_JSON` | `applyImport` → `IMPORT_INVALID`; DB unchanged |
| FR-04b | `format: "other-app"` | `INVALID_FORMAT` | the same |
| FR-04c | `formatVersion: 99` | `UNSUPPORTED_FORMAT_VERSION` | the same |
| FR-04d | `schemaVersion: 99` | `SCHEMA_TOO_NEW` | the same |
| FR-04e | One value changed after export (checksum kept) | `CHECKSUM_MISMATCH` (error) | the same |
| FR-04f | `checksum: null` (hand-made file) | `CHECKSUM_MISSING` as a **warning**; `ok:true` if nothing else is wrong | import allowed |
| FR-04g | `matches[0].scheduledDate: "31/12/2026"`; a delivery with `runsRun: -1` | `INVALID_VALUE` with `path` `data.matches[0].scheduledDate` / `data.matchEvents[k].runsRun` | refused |
| FR-04h | The same team id twice in `teams` | `DUPLICATE_ID` | refused |
| FR-04i | `matches[0].teamAId` absent from the file and from the DB | `MISSING_REFERENCE`, path `data.matches[0].teamAId` | refused |
| FR-04j | `matchEvents[k].fielderIds[0]` names an unknown player | `MISSING_REFERENCE`, path `data.matchEvents[k].fielderIds[0]` (from `collectIdReferences`) | refused |
| FR-04k | A match log with a seq gap / an invalid delivery | `INVALID_EVENT_LOG` naming the match | refused |
| FR-04l | A backup of an older `formatVersion` (when one exists) | mapped forward, `ok:true` | imports |

Common assertions:
- Row counts of every table and every `tournaments.revision` are unchanged.
- No `audit_events` row.
- Every issue `message` is human (it contains no "SQLITE", "undefined" or stack frames).
- DEV: E2E-14 shows `import-row-issue-1` with that message.

## FR-05 Corrupt data

| ID | Level | Simulation | Expected outcome | Assertions |
|---|---|---|---|---|
| FR-05a | INT | In IT-M after IT-M-10, change the `payload_json` of the over-2 `bowler_selected` by raw SQL so it names L7, a player of the batting side. (The composite FK still passes because L7 is in the squad.) | `load()`: `state.needsRepair` true. Exactly one error issue (that seq, `PLAYER_WRONG_SIDE`). Later events still applied (`lastSeq` = tail, `lastAppliedSeq` = tail). `canRecordDelivery` false. | `record` → `FORBIDDEN_STATE` "This match needs repair"; `undo` of the last group is refused too (the resulting log still contains the bad event); the projection rows' `updated_at` are unchanged |
| FR-05b | INT | The same, then `bootstrap()` | `integrityIssues` lists the match; the data is untouched. | `BootstrapReport.integrityIssues[0].matchId` |
| FR-05c | INT | Repair: `previewHistoryEdit([replace <that seq> with bowler_selected {T8, over_start}])` → `applyHistoryEdit` with a reason | The log replays cleanly; `needsRepair` false; projections rewritten; audit `match_history_edited` with the removed and inserted events. | RECOVERED-OK |
| FR-05d | INT | `DELETE` one mid-log event row by raw SQL (a seq gap) | The event after the gap is `SEQ_OUT_OF_ORDER` (skipped); the rest applies; `needsRepair`. A repair edit that re-inserts the missing event (or deletes the orphan) renumbers 1..n. | As FR-05a/c |
| FR-05e | INT | Tamper `matches.summary_json` (valid JSON, wrong winner) | Standings would be wrong until rebuilt. `rebuildProjections(matchId)` restores it. | `summary_json` deep-equals `buildMatchSummary(replay)` after the rebuild; `evaluate()` is back to the IT-T values |
| FR-05f | INT | `UPDATE matches SET projection_version = 0` for 3 matches, then `bootstrap()` | `projectionsRebuilt` 3; versions = `SCORING_PROJECTION_VERSION`; before the bootstrap, `getSnapshot` lists them in `staleSummaryMatchIds` and excludes their summaries. | Counts, and a flag in the UI (DEV: a stale badge on the fixture) |
| FR-05g | INT | Raw `UPDATE … SET rules_json = '{bad'` / `payload_json = 'x'` | Rejected by the `json_valid` CHECK: corrupt JSON cannot be written. | The statement throws |
| FR-05h | DEV | Replace the database file with random bytes (`adb shell run-as pk.harris.scorebook` … overwrite `SQLite/<db>`) and launch | `error-screen` with a human message and the technical detail only in diagnostics. The file is **not** overwritten or recreated silently. | The file checksum is unchanged after launch and after "Try again" |
| FR-05i | INT | A DB whose `schema_migrations` records version 2 (newer than the app) | `SchemaTooNewError` → startup error; no statement other than reads is executed | `statementLog` has no writes |

## FR-06 Duplicate import

Setup: IT-T complete. Export `{full}` gives file F (`exportId` X).

| ID | Action | Expected |
|---|---|---|
| FR-06a | `previewImport(F)` into the **same** DB | `ok:true`; `previouslyImportedAt` null (it was exported, not imported); `conflicts` = the tournament aggregate (its 15 matches included), 8 teams, 48 players; `localOnly` {matches 0, events 0} |
| FR-06b | `applyImport(F, 'skip_existing')` | Nothing inserted (`imported` all 0; `skipped` counts > 0); **no merged tournament**; audit `backup_imported` (entity `backup`, id X) |
| FR-06c | `previewImport(F)` again | `previouslyImportedAt` = the timestamp of FR-06b |
| FR-06d | `applyImport(F, 'import_as_copy')` | A second tournament with new ids everywhere (`remapBackupIds`); `rebuiltMatches` 15; both tournaments `evaluate()` to identical tables and champion; the original's rows are unchanged (`statementLog` has no UPDATE/DELETE on them) |
| FR-06e | Make a local-only change: correct match 12 with a history edit (its inserted events have ids that F does not contain); then `previewImport(F)` | The tournament conflict shows `localOnly.events` > 0, which the organizer sees before choosing replace |
| FR-06f | `applyImport(F, 'replace_existing')` | The local tournament aggregate is **explicitly deleted** (matches first) and re-inserted from F; library rows are updated in place with `ON CONFLICT DO UPDATE` (never `INSERT OR REPLACE`: `statementLog` contains no `INSERT OR REPLACE`); the result equals F's data; RECOVERED-OK |
| FR-06g | Crash during FR-06d (`crashAt` the 10th INSERT) | Nothing imported; no audit row; re-running the import works and does not report "previously imported" |
| FR-06h | DEV (E2E-12) | the `import-text-previously-imported` banner, policy chips, report text |

## FR-07 Database failure

| ID | Level | Simulation | Expected outcome | Assertions |
|---|---|---|---|---|
| FR-07a | INT | `failOn({sql:/INSERT INTO match_events/, error:SQLITE_FULL})` during `record` | `ServiceResult` `{ok:false, error:{code:'STORAGE', message:"Couldn't save this delivery. Your previous match data is still safe.", detail:<contains SQLITE_FULL>}}` | DB unchanged; `useLiveMatchStore` keeps the previous `live` state; the toast has the message and a **Try Again** action; `toast-text` does not contain "SQLITE" |
| FR-07b | INT | Clear the fault and press Try Again (`dispatch` again) | Succeeds with the same seq | `lastSeq` + 1 |
| FR-07c | INT | `failOnCommit(1)` during `endMatch` | ROLLBACK; `STORAGE`; the match is still live with `confirm_result` | status live |
| FR-07d | INT | `SQLITE_BUSY` on the first statement of a transaction | The service surfaces `STORAGE` (no infinite retry); the next call succeeds | no hang (test timeout 2 s) |
| FR-07e | INT | Constraint failure: `record` with a payload naming a player not in the squad (bypassing domain validation with a test double) | FK violation → mapped error (`VALIDATION`/`STORAGE`), never a raw error; rollback | no rows |
| FR-07f | INT | A write on the root DB issued while another use case's transaction is open, and that transaction then fails | The root write waits, runs after the ROLLBACK, and is **not** rolled back with it (writer mutex) | the row of the root write exists |
| FR-07g | INT | A migration fails (inject a failure into `MIGRATIONS[0].up` via a test migration list) | Rolled back with its `schema_migrations` row; `bootstrap` → `{ok:false}`; the app shows `error-screen` with Retry | `schema_migrations` empty |
| FR-07h | INT | A `foreignKeysOff` test migration leaving an orphan row | `foreign_key_check` before COMMIT finds it → ROLLBACK; foreign keys are ON again | `PRAGMA foreign_keys` = 1 afterwards |
| FR-07i | DEV | Fill the emulator storage (`adb shell dd if=/dev/zero of=/sdcard/fill bs=1m`) until writes fail, then score | The toast message as FR-07a; after deleting the fill file, Try Again works | Maestro assertions on `toast-text`, `toast-btn-action` |

## FR-08 Interrupted PDF generation

| ID | Level | Simulation | Expected outcome | Assertions |
|---|---|---|---|---|
| FR-08a | INT | `fakePrinter` rejects (`printToFileAsync` error) for `scorecardPdf(G1)` | `{ok:false, error:{code:'EXPORT_FAILED', message: human}}`; `share` is not called; the DB is unchanged (no revision bump, no audit) | `statementLog` has no writes |
| FR-08b | INT | The printer succeeds but `share` rejects/cancels | Share cancelled by the user → `ok` (no error toast); share error → `EXPORT_FAILED`; the PDF file URI is still returned for retry | |
| FR-08c | DEV | Tap `scorecard-btn-export-pdf`, then immediately `stopApp`; relaunch | The app starts normally; the match is intact; exporting again succeeds | E2E: `scorecard-text-result` unchanged |
| FR-08d | DEV | Export a 50-over match (about 700 events, 22 batting rows, 100 overs of summary) | Completes; the share sheet opens; no ANR | Maestro `extendedWaitUntil` 20 s |
| FR-08e | DOM | The scorecard HTML builder with names containing `<script>`, `&`, emoji | Escaped output; deterministic for identical input | string assertions |

## FR-09 Tournament edit after fixtures

Base: IT-T after IT-T-09 (fixtures confirmed) and after IT-T-13 (4 matches played).

| ID | Change | State | Expected |
|---|---|---|---|
| FR-09a | Move Hawks to Pool B | `fixtures_generated`, no match started | Policy `warn`; the preview lists the fixtures to be regenerated; apply without a reason works; audit `team_moved` with the impact |
| FR-09b | Move Hawks to Pool B (`fixturesForPoolMove` prefill) | 4 matches played (Hawks played 2) | Policy `confirm`; `impact.requiresConfirmation` and `requiresReason` true; `fixtures` lists exactly the unplayed Hawks fixtures of Pool A as `removed` and the Hawks v Pool B fixtures as `created`; played fixtures untouched (their `matchSides`, `pool_id` and summaries are unchanged); standings recomputed |
| FR-09c | The same apply without a reason | | `CONFIRMATION_REQUIRED` |
| FR-09d | Preview, then another change bumps the revision, then apply the old preview | | `CONFLICT`; nothing written; the store refreshes and asks to re-preview |
| FR-09e | `generateFixtures` + `confirmFixtures` again for the group stage | matches played | Only fixtures **without** a match are replaced; played fixtures keep their ids and results; goes through `fixtures_replace` impact |
| FR-09f | Points changed to 3/1/1/0 | completed matches exist | `confirm` + reason; every table recomputed (Lions 9 pts after 3 wins); audit `rules_changed` with the impact |
| FR-09g | `removeTeams([Hawks])` | matches played | `FORBIDDEN_STATE`; the UI offers withdraw. `team_withdraw {walkover}` creates walkover matches with `match_ended` events for the remaining Hawks fixtures; the opponents get walkover points |
| FR-09h | `stage_upsert` changing the group stage's pools | group matches started | `blocked` (only future stages may change) |
| FR-09i | `fixture_delete` of a completed fixture | | `blocked`, severity `destructive` |
| FR-09j | Swap Hawks ↔ Wolves | 1 Hawks match played | Hawks and Wolves exchange pools and take over each other's **unplayed** fixtures; the played Hawks match stays in Pool A with its teams |
| FR-09k | A tournament in `archived` state: any edit | | `forbidden` ("unarchive first") |

## FR-10 Match correction after the standings update

| ID | Situation | Action | Expected |
|---|---|---|---|
| FR-10a | IT-T after the group stage | Correct match 6 (IT-T-19/20) | The preview shows the standings/NRR/qualification changes and a slot change A2 Tigers → Eagles. A reason is required. Audit `result_corrected` with the removed/inserted events and the impact. Tables recomputed from summaries (nothing stored to fix). |
| FR-10b | After SF2 was played | The same correction | SF2 **frozen** (`matchSides` Bulls v Tigers); "Winner SF2" and the Final unchanged; the impact lists SF2 under `playedFixtureIds`; the organizer can alternatively pin A2 = Tigers with a `slot_assignment` override (audited) |
| FR-10c | Group match 12 completed | `undo` (reopen) without a reason | `CONFIRMATION_REQUIRED` |
| FR-10d | The same | `undo(reason:'Wrong last ball')` | Audit `match_reopened` with the impact; the match `live`, the fixture `live`, the stage `active`; standings exclude match 12; revision +1 |
| FR-10e | The same | `redo(group, reason)` | Re-closed; audit `result_recorded`; standings back to U-STD-04 |
| FR-10f | Preview a correction; meanwhile another device session… (simulated: undo + a new ball on the same match) | `applyHistoryEdit(ops, reason, oldFingerprint)` | `CONFLICT` (the fingerprint changed although `lastSeq` is equal) |
| FR-10g | Completed tournament (champion Lions) | Correct the Final's result so Bulls win | Policy `confirm`. The champion becomes Bulls; `champion_json` is rewritten in the same transaction; the tournaments list shows "Bulls" |
| FR-10h | A standalone completed match | History edit | A reason is required; audit with `tournament_id` NULL; no tournament impact |

---

## FR-11 onwards — architecture-specific failure modes

| ID | Level | Scenario | Expected |
|---|---|---|---|
| FR-11 | INT | Double tap: two `dispatch(scoreRuns(1))` calls fired without awaiting | Serialised by the store: two balls, seqs n+1 and n+2, no CONFLICT |
| FR-12 | INT | Two service instances on one DB (stale writer): both read `lastSeq` 8; A records seq 9; B records with `expectedLastSeq` 8 | B gets `CONFLICT` (the `UNIQUE(match_id, seq)` / tail check); B's store reloads and clears redo |
| FR-13 | INT | Redo after a restart | The redo stack is empty after R1/R2; `redo()` resolves false without an error toast; the button is disabled |
| FR-14 | DOM | Replay of events whose `recordedAt` goes backwards (device clock changed) | The state equals the same log with monotonic timestamps: replay order is `seq`, never time |
| FR-15 | INT | Tournament delete interrupted: `crashAt` the 5th match DELETE | Nothing deleted (one transaction); `previewDelete` counts unchanged |
| FR-16 | INT | A `needsRepair` match in a tournament | Its stale or absent summary is excluded; the fixture is flagged; `evaluate()` still works; no projection is written from the degraded replay |
| FR-17 | DEV | Airplane mode for a whole E2E-06 run | Passes (no network dependency, §3, §85) |
| FR-18 | DEV | The OS kills the app during the §23 prompt (before a choice) | The prompt shows again on the next launch; no state changed |

## Traceability to §93

| §93 item | Tests |
|---|---|
| App crash | FR-01a…j, FR-11 |
| Battery loss | FR-02a…d |
| Device restart | FR-03a…d, FR-13 |
| Invalid import | FR-04a…l |
| Corrupt data | FR-05a…i, FR-16 |
| Duplicate import | FR-06a…h |
| Database failure | FR-07a…i, FR-12, FR-15 |
| Interrupted PDF generation | FR-08a…e |
| Tournament edit after fixtures | FR-09a…k |
| Match correction after standings update | FR-10a…h |
