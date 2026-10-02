# Scorebook — Unit Test Plan (§90)

Scope: the pure domain (`src/domain/scoring/*`, `src/domain/tournament/*`) and the pure backup visitor (`src/export/backup/remap.ts`). Every case below is a concrete input → expected output that a WP package turns into one `it(...)` (or one `it.each` row). Case IDs are stable and are referenced from [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md), [INTEGRATION_TEST_PLAN.md](INTEGRATION_TEST_PLAN.md) and [FAILURE_RECOVERY_TESTS.md](FAILURE_RECOVERY_TESTS.md).

Contract sources: `src/domain/types/**`, the stub signatures in `src/domain/{scoring,tournament}/*.ts`, [CONTRACT_REFERENCE.md](../architecture/CONTRACT_REFERENCE.md) (binding semantics), and the per-package acceptance lists in [CONTRACTS.md](../CONTRACTS.md) §3. Where this plan pins a value the contract leaves open, the row is marked **(proposed)**. Those rows are also listed in the report that came with this plan.

## 0. Conventions

### 0.1 Where the tests live and how they run

| Module | Test file (owner) |
|---|---|
| `scoring/commands.ts` | `src/domain/scoring/__tests__/commands.test.ts` (WP-scoring-engine) |
| `scoring/replay.ts` (+ `validate.ts` rules exercised through replay) | `replay.runs.test.ts`, `replay.extras.test.ts`, `replay.wickets.test.ts`, `replay.overs.test.ts`, `replay.innings.test.ts`, `replay.superover.test.ts`, `replay.penalty.test.ts` |
| `scoring/validate.ts` | `validate.test.ts` |
| `scoring/result.ts` | `result.test.ts` |
| `scoring/stats.ts`, `scoring/format.ts` | `stats.test.ts`, `format.test.ts` |
| `scoring/history.ts` | `history.test.ts` |
| `scoring/summary.ts`, `scoring/presets.ts` | `summary.test.ts`, `presets.test.ts` |
| Replay invariants (property, fuzz, performance) | `replay.properties.test.ts`, `replay.perf.test.ts` |
| `tournament/{rng,pools,fixtures,knockout,slots,templates,stateMachine}.ts` | `src/domain/tournament/__tests__/<module>.test.ts` (WP-tournament-structure) |
| `tournament/{nrr,tiebreakers,standings,qualification,evaluate,whatif,impact,stats}.ts` | `src/domain/tournament/__tests__/<module>.test.ts` (WP-tournament-standings) |
| `export/backup/remap.ts` | `src/export/backup/__tests__/remap.test.ts` (WP-export) |

* Command: `npx jest src/domain` (fast, no I/O). Domain tests import only from `@/domain/*`. They never touch React, Expo, SQLite, `Date.now()` or `Math.random()`.
* No new dependencies. Property tests and fuzz tests use the domain's own seeded `mulberry32` as their generator; there is no fast-check. Every generated case logs its seed so a failure can be reproduced.
* No code comments in test files (CLAUDE.md). The case ID goes in the test name instead, e.g. `it('U-EXT-07 no-ball plus two byes', …)`.
* Numbers: integers are asserted exactly. Unrounded rates use `toBeCloseTo(x, 6)`. Formatted strings are asserted exactly.
* Performance cases (U-RPL-12, U-EVAL-03 and the `*.perf.test.ts` files): the documented budget (e.g. < 50 ms replay, < 100 ms evaluation) is the target; the Jest assertion uses **3× the budget** so a slow Windows CI machine does not flake, and the test logs the measured median (`console.log` of the milliseconds) so regressions against the real budget stay visible. The same rule applies to IT-DB-09 and every other timing test in the integration and failure plans.
* Immutability: every engine test deep-freezes its inputs (`setup`, `events`, `snapshot`) with a recursive `Object.freeze` helper. A mutation then throws in strict mode.

### 0.2 Test builders (public test helpers)

WP-scoring-engine owns `src/domain/scoring/testing/**`. Other packages import these helpers in tests only.

| Builder | Produces |
|---|---|
| `matchSetup(overrides?)` | The `MatchSetup` of fixture **M20** below. `overrides` may replace `rules`, team sizes, players or toss. |
| `scriptedMatch(setup, steps)` | `MatchEvent[]` built by feeding each `ScoringIntent` in `steps` through `buildEvents` against the evolving state. Seqs run 1..n and ids are `e<seq>`. Each step gets one actionId, `a<k>`. `recordedAt` is `2026-05-01T10:00:00.000Z` plus one second per event. The builder throws on the first `{ok:false}`. |
| `rawEvents(setup, payloads)` | The same envelopes, but with no `buildEvents`. Validation-failure tests use it to smuggle invalid events into a log. |
| `summary(partial)` | A hand-built `MatchSummary`. Tournament engine tests use it; it needs no replay. |
| `snapshot(partial)` | A hand-built `TournamentSnapshot`, with `version: '1'` and `summaries` keyed by match id. |

### 0.3 Standard fixtures

**Teams**
- **Lions** (`LIO`, team A): L1 Babar, L2 Fakhar, L3 Saim, L4 Rizwan-L, L5 Iftikhar, L6 Sarfraz (keeper), L7 Amir, L8 Wasim, L9 Waqar, L10 Imran, L11 Abdul, and L12 Usman (substitute fielder).
- **Tigers** (`TIG`, team B): T1 Rizwan (keeper), T2 Shan, T3 Saud, T4 Agha, T5 Azam, T6 Faheem, T7 Hassan, T8 Shaheen, T9 Naseem, T10 Shadab, T11 Haris, and T12 Ali (substitute fielder).
- Squad order is the battingOrder 1..11. Substitutes have `battingOrder: null`.

**Fixtures**

| Id | Setup |
|---|---|
| **M20** | `BASE_MATCH_RULES` (20 overs, 6-ball overs, 11-a-side, wide 1 and not counted, no-ball 1 with free hit and not counted, uniform quota 4, no consecutive overs, powerplay overs 1–6, super over enabled with 1 over, 2 wickets, `repeat`, no round limit, `restrictRepeatPlayers`, no mandatory retirement). Toss: Lions won and chose to bat. Opening event `innings_started {0, Lions, striker L1, nonStriker L2, bowler T7}`. |
| **M3** | M20 with `oversPerInnings: 3`, `maxOversPerBowler: 2`, `powerplays: [{name:'Powerplay', fromOver:1, toOver:1}]`. This is the "golden match", reused by the integration (IT-M) and E2E (E2E-01) plans. |
| **M8-LMS** | M20 with `playersPerSide: 8`, `lastManStands: true`. |
| **M8-7** | M20 with `playersPerSide: 8`, `teamBPlayers: 7`, so `MatchTeam.playersInSide` is 8 for Lions and 7 for Tigers. |

"Fresh innings" means state after the opening event only: L1 is on strike, L2 at the non-striker's end, T7 bowling, 0/0.

**Golden match G1 (fixture M3)**

Every later section asserts against it.

| Over | Bowler | Deliveries (intent → token) | Score at end |
|---|---|---|---|
| 1 | T7 Hassan | `scoreRuns(1)` → `1` (L1), `scoreRuns(4)` → `4` (L2), `wide()` → `WD`, `scoreRuns(0)` → `0`, `scoreRuns(2)` → `2`, `scoreRuns(6)` → `6`, `scoreRuns(1)` → `1` | 15/0 |
| 2 | T8 Shaheen | `0` (L2), `wicket({dismissal:'bowled', nextBatterId:'L3'})` → `W`, `1` (L3), `noBall({runsRun:1})` → `NB+1` (L1), `0` (L3, free hit), `legBye(1)` → `LB1` (L3), `2` (L1) | 21/1 |
| 3 | T7 Hassan | six × `scoreRuns(1)`, strike alternating L3/L1 | 27/1 → innings complete (`overs_complete`) |
| Chase | openers T1/T2, L10 Imran | Over 1 (L10): `4 4 1 1 2 6` | 18/0 |
| | | Over 2 (L11 Abdul): `1`, `0`, `wicket({dismissal:'caught', fielderIds:['L7'], nextBatterId:'T3'})`, `2`, `1`, `4` | 26/1 |
| | | Over 3 (L10): `1`, `1` | 28/1 at 2.2 → `confirm_result` "Tigers won by 9 wickets (4 balls left)" |

---

## 1. Scoring buttons → intents → events (`scoring/commands.ts`)

The UI pad is `0 1 2 3 4 6 EXTRAS WICKET` (§9). Each row checks three things:
- (a) the constructor output (`toMatchObject`);
- (b) the `buildEvents(setup, freshInningsState, intent)` payload (always `{ok:true}`, exactly one event);
- (c) the state after `applyEvent`.

Stamps are always `strikerId L1, nonStrikerId L2, bowlerId T7`. `shortRuns` is 0 unless stated.

| ID | Button / call | (a) intent | (b) payload facts | (c) team / legal / L1 line / T7 line / next striker / token (kind) |
|---|---|---|---|---|
| U-CMD-01 | `0` → `scoreRuns(0)` | `{type:'runs', runsRun:0}` | `fair, bat, runsRun 0, boundary 0, wicket null` | 0/0, 1 legal; L1 0 (1); T7 0 runs, 1 dot; L1; `0` (dot) |
| U-CMD-02 | `1` → `scoreRuns(1)` | `{type:'runs', runsRun:1}` | `fair, bat, 1, 0` | 1/0, 1; L1 1 (1); T7 1; **L2**; `1` (runs) |
| U-CMD-03 | `2` → `scoreRuns(2)` | `runsRun:2` | `fair, bat, 2, 0` | 2/0; L1 2 (1); L1; `2` |
| U-CMD-04 | `3` → `scoreRuns(3)` | `runsRun:3` | `fair, bat, 3, 0` | 3/0; L1 3 (1); **L2**; `3` |
| U-CMD-05 | `4` → `scoreRuns(4)` | `{runsRun:0, boundary:4}` | `fair, bat, 0, 4` | 4/0; L1 4 (1), 4s 1; T7 4, `foursConceded` 1; L1; `4` (four) |
| U-CMD-06 | `6` → `scoreRuns(6)` | `{runsRun:0, boundary:6}` | `fair, bat, 0, 6` | 6/0; L1 6 (1), 6s 1; T7 `sixesConceded` 1; L1; `6` (six) |
| U-CMD-07 | all-run four `scoreRuns(4,{allRun:true})` | `{runsRun:4}` (boundary 0 or absent) | `fair, bat, 4, 0` | 4/0; L1 4, **4s 0**; L1; `4` (runs) |
| U-CMD-08 | `scoreRuns(5)` | `runsRun:5` | `fair, bat, 5, 0` | 5/0; **L2**; warning `UNUSUAL_RUNS`; `5` |
| U-CMD-09 | 1 + 4 overthrows `overthrowBoundary(1)` | `{runsRun:1, boundary:4}` | `fair, bat, 1, 4` | 5/0; L1 5, 4s 0; **L2**; **no** `UNUSUAL_RUNS`; `5` (runs) |
| U-CMD-10 | overthrow off byes `overthrowBoundary(1,{runsTo:'bye'})` | `{type:'bye', runsRun:1, boundary:true}` | `fair, bye, 1, 4` | 5/0, byes 5; T7 0 runs, 1 dot; L2; `B5` |
| U-CMD-11 | NB + 1 + 4 overthrows `noBall({runsRun:1, boundary:4})` | `{type:'no_ball', runsRun:1, boundary:4}` | `no_ball, bat, 1, 4` | 6/0, nb 1; L1 5 (1), 4s 0; T7 6; **L2**; free hit next; `NB+5` |
| U-CMD-12 | short run `scoreRuns(2,{shortRuns:1})` | `{runsRun:2, shortRuns:1}` | `fair, bat, 2, shortRuns 1, 0` | 1/0; L1 1 (1); **L1** (two crossings); `1s`, label "One run, one short" |
| U-CMD-13 | `scoreRuns(3,{shortRuns:1})` | `{runsRun:3, shortRuns:1}` | `fair, bat, 3, 1, 0` | 2/0; **L2**; `2s` |
| U-CMD-14 | `WICKET` → `wicket({dismissal:'bowled'})` | `{type:'wicket', dismissal:'bowled'}` | `fair, bat, 0, 0, wicket {bowled, playerOutId L1, fielderIds [], dismissalEnd null}` | 0/1; pending `select_next_batter {position:'striker', candidates [L3…L11]}`; `W` (wicket) |
| U-CMD-15 | wicket with next batter `wicket({dismissal:'bowled', nextBatterId:'L3'})` | — | **two** events: the delivery, then `batter_in {L3, striker}` | 0/1; L3 on strike; pending null; `scriptedMatch` gives both one actionId |
| U-CMD-16 | `swapStrike()` | `{type:'swap_strike'}` | `strike_swapped` | L2 on strike, no ball counted |
| U-CMD-17 | `selectBowler('T8')` at an over start | `{type:'select_bowler', bowlerId:'T8'}` | `bowler_selected {T8, reason 'over_start'}` (default filled) | bowler T8 |
| U-CMD-18 | `selectBowler('T8')` mid-over with no reason | — | `{ok:false, code:'BOWLER_CHANGE_REASON_INVALID'}` | — |
| U-CMD-19 | `batterIn('L3')` with a single vacancy at the non-striker end | `{type:'batter_in', playerId:'L3'}` | `batter_in {L3, position 'non_striker'}` (default) | — |
| U-CMD-20 | stumping without fielder `wicket({dismissal:'stumped'})` | — | `fielderIds: ['T1']` (designated keeper) | `st Rizwan b Hassan` |
| U-CMD-21 | `{type:'penalty', teamId:LIO, runs:5, reason:'Ball hit helmet'}` while Lions bat innings 0 | — | `penalty_awarded {LIO, inningsIndex 0, 5}` | penalty extras 5 |
| U-CMD-22 | `{type:'revise_overs', inningsIndex:0, overs:12, scope:'both_innings', reason:'Rain'}` at 5.0 | — | two `overs_revised` (index 0 `maxBalls 72`, index 1 `maxBalls 72`), `terminal:false` | innings 0 `limits.maxBalls` 72; `plannedRevisions[0].inningsIndex` 1 |
| U-CMD-23 | `revise_overs {inningsIndex:1, balls:86, target:111, terminal:true, reason:'Rain'}` during a suspended chase at 14.2 | — | one `overs_revised {1, maxBalls 86, target 111, terminal true}` | see U-RES-08 |
| U-CMD-24 | Any intent while `pendingAction` is `select_next_bowler` (e.g. `scoreRuns(1)`) | — | `{ok:false, code:'PENDING_ACTION_REQUIRED'}` | — |
| U-CMD-25 | `buildEvents` purity | same `(setup, state, intent)` twice | deep-equal results; frozen inputs never mutated | — |

UI binding (RNTL, WP-match-ui; see ACCEPTANCE AC-E4-01): each pad button dispatches exactly the intent in column (a), with one tap and no confirmation.

---

## 2. Extras (§17) — `buildEvents` + replay

All rows start from a fresh innings under M20 unless the Rule column says otherwise.

Column key:
- wd, nb, b, lb = `ExtrasBreakdown` components.
- **Faced** = does it count in L1's `balls`?
- **Legal** = does it count toward the over?
- **BwlR** = `bowlerRuns`.

### 2.1 Wides (§17 "Wide: 1, 2, 3, 4, 5, custom")

| ID | Intent | Rule | Payload | wd | Total | Legal | Faced | BwlR | Striker after | Token |
|---|---|---|---|---|---|---|---|---|---|---|
| U-EXT-01 | `wide()` ("1") | pen 1 | `wide, runsRun 0, b 0` | 1 | 1 | no | no | 1 | L1 | `WD` |
| U-EXT-02 | `wide(1)` ("2") | pen 1 | `wide, 1, 0` | 2 | 2 | no | no | 2 | L2 | `WD+1` |
| U-EXT-03 | `wide(2)` ("3") | pen 1 | `wide, 2, 0` | 3 | 3 | no | no | 3 | L1 | `WD+2` |
| U-EXT-04 | `wide(3)` ("4") | pen 1 | `wide, 3, 0` | 4 | 4 | no | no | 4 | L2 | `WD+3` |
| U-EXT-05 | `wide(0,{boundary:true})` ("5") | pen 1 | `wide, 0, 4` | 5 | 5 | no | no | 5 | L1 | `WD+4` |
| U-EXT-06 | `wide(5)` (custom) | pen 1 | `wide, 5, 0` | 6 | 6 | no | no | 6 | L2 | `WD+5`, warning `UNUSUAL_RUNS` |
| U-EXT-07 | `wide()` | pen **0** (gully) | `wide, 0, 0` | 0 | 0 | no | no | 0 | L1 | `WD` |
| U-EXT-08 | `wide(1)` | pen **2** | `wide, 1, 0` | 3 | 3 | no | no | 3 | L2 | `WD+1` |
| U-EXT-09 | `wide()` × 6 | `countsAsBall: true` | — | 6 | 6 | **yes** | no | — | over ends after the **6th wide**: `endsOver` true, L1 balls 0 | `WD` ×6 |
| U-EXT-10 | `wide(2,{shortRuns:1})` | pen 1 | `wide, 2, short 1, 0` | 2 | 2 | no | no | 2 | L1 (even crossings) | `WD+1s` |
| U-EXT-11 | `{call:'wide', boundary:6}` via `rawEvents` | — | — | rejected `SIX_NOT_OFF_BAT` | | | | | | |

### 2.2 No-balls (§17 "NB+0, +1, +2, +3, +4, +6, custom")

| ID | Intent | Rule | Payload | nb | Other | Total | Faced | BwlR | Striker after | Free hit next | Token |
|---|---|---|---|---|---|---|---|---|---|---|---|
| U-EXT-12 | `noBall()` | pen 1, FH | `no_ball, bat, 0, 0` | 1 | — | 1 | yes (L1 balls 1) | 1 | L1 | true | `NB` |
| U-EXT-13 | `noBall({runsRun:1})` | | `no_ball, bat, 1, 0` | 1 | L1 +1 | 2 | yes | 2 | L2 | true | `NB+1` |
| U-EXT-14 | `noBall({runsRun:2})` | | `no_ball, bat, 2, 0` | 1 | L1 +2 | 3 | yes | 3 | L1 | true | `NB+2` |
| U-EXT-15 | `noBall({runsRun:3})` | | `no_ball, bat, 3, 0` | 1 | L1 +3 | 4 | yes | 4 | L2 | true | `NB+3` |
| U-EXT-16 | `noBall({boundary:4})` | | `no_ball, bat, 0, 4` | 1 | L1 +4, 4s 1 | 5 | yes | 5 | L1 | true | `NB+4` |
| U-EXT-17 | `noBall({boundary:6})` | | `no_ball, bat, 0, 6` | 1 | L1 +6, 6s 1 | 7 | yes | 7 | L1 | true | `NB+6` |
| U-EXT-18 | `noBall({runsTo:'bye', runsRun:2})` | | `no_ball, bye, 2, 0` | 1 | b 2 | 3 | yes, L1 runs 0 | **1** | L1 | true | `NB+2B`, label "No ball, plus two byes" |
| U-EXT-19 | `noBall({runsTo:'leg_bye', runsRun:1})` | | `no_ball, leg_bye, 1, 0` | 1 | lb 1 | 2 | yes | **1** | L2 | true | `NB+1LB` |
| U-EXT-20 | `noBall({runsTo:'bye', boundary:4})` | | `no_ball, bye, 0, 4` | 1 | b 4 | 5 | yes | 1 | L1 | true | `NB+4B` |
| U-EXT-21 | `noBall()` | pen **2** | | 2 | — | 2 | yes | 2 | L1 | true | `NB` |
| U-EXT-22 | `noBall()` | `freeHit: false` | | 1 | — | 1 | yes | 1 | L1 | **false** | `NB` |
| U-EXT-23 | `noBall()` | `countsAsBall: true` | | 1 | — | 1 | yes | 1 | L1 | true | `NB`, legal balls 1 |
| U-EXT-24 | `noBall({runsTo:'bye', boundary:6})` via `rawEvents` | | | rejected `SIX_NOT_OFF_BAT` | | | | | | | |

### 2.3 Free-hit sequence (§20)

**U-EXT-25.** Sequence: `noBall()`, `wide()`, `noBall()`, `scoreRuns(0)`, `scoreRuns(0)`.
- `BallRecord.isFreeHit` on each delivery: `false, true, true, true, false`.
- `InningsState.isFreeHitNext` after each delivery: `true, true, true, false, false`.
- Token `isFreeHit` mirrors `BallRecord.isFreeHit`.

### 2.4 Byes and leg-byes (§17 "Bye: 1, 2, 3, 4, custom" and the same for leg-byes)

| ID | Intent | Payload | b / lb | Total | L1 balls / runs | T7 runs / dots | Striker after | Token |
|---|---|---|---|---|---|---|---|---|
| U-EXT-26 | `bye(1)` | `fair, bye, 1, 0` | b 1 | 1 | 1 / 0 | 0 / 1 | L2 | `B1` (bye) |
| U-EXT-27 | `bye(2)` | `fair, bye, 2, 0` | b 2 | 2 | 1 / 0 | 0 / 1 | L1 | `B2` |
| U-EXT-28 | `bye(3)` | `fair, bye, 3, 0` | b 3 | 3 | 1 / 0 | 0 / 1 | L2 | `B3` |
| U-EXT-29 | `bye(0,{boundary:true})` | `fair, bye, 0, 4` | b 4 | 4 | 1 / 0 | 0 / 1 | L1 | `B4` |
| U-EXT-30 | `bye(4)` (all run) | `fair, bye, 4, 0` | b 4 | 4 | 1 / 0 | 0 / 1 | L1 | `B4` |
| U-EXT-31 | `bye(5)` (custom) | `fair, bye, 5, 0` | b 5 | 5 | — | 0 / 1 | L2 | `B5`, `UNUSUAL_RUNS` |
| U-EXT-32 | `legBye(1)` | `fair, leg_bye, 1, 0` | lb 1 | 1 | 1 / 0 | 0 / **1** (a leg-bye is a bowler dot) | L2 | `LB1` (leg_bye) |
| U-EXT-33 | `legBye(2)` / `legBye(3)` / `legBye(0,{boundary:true})` | | lb 2 / 3 / 4 | 2 / 3 / 4 | 1 / 0 | 0 / 1 | L1 / L2 / L1 | `LB2` / `LB3` / `LB4` |
| U-EXT-34 | `legBye(2,{shortRuns:1})` | `fair, leg_bye, 2, 1, 0` | lb 1 | 1 | 1 / 0 | 0 / 1 | L1 | `LB1s` |
| U-EXT-35 | `{fair, bye, boundary 6}` via `rawEvents` | | rejected `SIX_NOT_OFF_BAT` | | | | | |

### 2.5 Extras totals

**U-EXT-36.** G1 innings 0 → `extras = {wides:1, noBalls:1, byes:0, legByes:1, penalty:0, total:3}`.
- `total` always equals `wides + noBalls + byes + legByes + penalty`. This is also a property test.

---

## 3. Wickets (§18)

### 3.1 `allowedDismissals(call, isFreeHit)` — the full matrix (U-WKT-01 … U-WKT-04)

| Dismissal | fair | wide | no_ball | free hit (any call) |
|---|---|---|---|---|
| bowled | ✓ | ✗ | ✗ | ✗ |
| caught | ✓ | ✗ | ✗ | ✗ |
| lbw | ✓ | ✗ | ✗ | ✗ |
| run_out | ✓ | ✓ | ✓ | ✓ |
| stumped | ✓ | ✓ | ✗ | ✗ |
| hit_wicket | ✓ | ✓ | ✗ | ✗ |
| hit_ball_twice | ✓ | ✗ | ✓ | ✓ (fair / no-ball) |
| obstructing_field | ✓ | ✓ | ✓ | ✓ |
| handled_ball | ✓ | ✓ | ✓ | ✓ |

- U-WKT-01 is `('fair', false)`, U-WKT-02 is `('wide', false)` and U-WKT-03 is `('no_ball', false)`.
- U-WKT-04 is `(call, true)` for each call: the result equals that call's column ∩ {run_out, hit_ball_twice, obstructing_field, handled_ball}.
- The same matrix drives validation. Every ✗ cell, submitted as a delivery, returns `DISMISSAL_NOT_ALLOWED_ON_CALL`, or `DISMISSAL_NOT_ALLOWED_ON_FREE_HIT` on a free hit. That is 36 generated cases (U-WKT-05).

### 3.2 Each dismissal on a fair ball (fresh innings, L1 on strike)

| ID | Intent | Out | Vacancy | Wickets | `creditedBowlerId` | Dismissal text | Notes |
|---|---|---|---|---|---|---|---|
| U-WKT-10 | `wicket({dismissal:'bowled'})` | L1 | striker | 1 | T7 | `b Hassan` | |
| U-WKT-11 | caught, `fielderIds:['T9']` | L1 | striker | 1 | T7 | `c Naseem b Hassan` | T9 `playerMatchStats.catches` 1 |
| U-WKT-12 | caught, `fielderIds:['T7']` | L1 | striker | 1 | T7 | `c & b Hassan` | |
| U-WKT-13 | caught, no fielder | L1 | striker | 1 | T7 | `c ? b Hassan` | warning `FIELDER_UNKNOWN`; no catch credited |
| U-WKT-14 | caught, `fielderIds:['T12']` (sub Ali) | L1 | striker | 1 | T7 | `c sub (Ali) b Hassan` | T12 never gets a batting row |
| U-WKT-15 | lbw | L1 | striker | 1 | T7 | `lbw b Hassan` | |
| U-WKT-16 | stumped, `fielderIds:['T1']` | L1 | striker | 1 | T7 | `st Rizwan b Hassan` | T1 stumpings 1 |
| U-WKT-17 | hit_wicket | L1 | striker | 1 | T7 | `hit wicket b Hassan` | |
| U-WKT-18 | hit_ball_twice | L1 | striker | 1 | **null** | `hit the ball twice` | |
| U-WKT-19 | run_out L1, `dismissalEnd:'striker_end'`, fielders `['T9','T1']` | L1 | striker | 1 | null | `run out (Naseem/Rizwan)` | T9 run-outs 1 |
| U-WKT-20 | run_out, one fielder `['T9']` / none / `['T12']` | L1 | striker | 1 | null | `run out (Naseem)` / `run out` / `run out (sub (Ali))` | |
| U-WKT-21 | obstructing_field L2 at `non_striker_end` | L2 | non_striker | 1 | null | `obstructing the field` | |
| U-WKT-22 | handled_ball L1 at `striker_end` | L1 | striker | 1 | null | `handled the ball` | |
| U-WKT-23 | `batter_dismissed {L2, run_out, fielderIds ['T7']}` (backing up, off-ball) | L2 | non_striker | 1 | null | `run out (Hassan)` | legal balls unchanged (0); `DismissalRecord.onDelivery` false; `bowlerId` T7 |
| U-WKT-24 | `batter_dismissed {L3, timed_out}` while the vacancy after U-WKT-10 is open | L3 | vacancy **remains** at striker | 2 | null | `timed out` | L3 status `out`; pending is still `select_next_batter` |
| U-WKT-25 | off-ball `obstructing_field` of L2 between deliveries | L2 | non_striker | 1 | null | `obstructing the field` | no ball counted |
| U-WKT-26 | `batter_retired {L1, retired_hurt}` | — | striker | **0** | — | `retired hurt` | status `retired_hurt`; not in FoW; the partnership ends with `retirement` |
| U-WKT-27 | `batter_retired {L1, retired_not_out}` | — | striker | 0 | — | `retired not out` | status `retired_not_out` |
| U-WKT-28 | `batter_retired {L1, retired_out}` | L1 | striker | **1** | null | `retired out` | status `out`; in FoW; never eligible again |

### 3.3 Wickets combined with extras (§17 × §18)

| ID | Intent | Runs | Wicket | Token | Legal |
|---|---|---|---|---|---|
| U-WKT-30 | `wicket({dismissal:'stumped', call:'wide'})` | wd 1 (the wide stands) | L1 st, credited T7 | `WD+W` | no |
| U-WKT-31 | `wicket({dismissal:'run_out', call:'wide', runsRun:1, playerOutId:'L1', dismissalEnd:'non_striker_end'})` | wd 2 | L1 run out | `WD+1+W` | no |
| U-WKT-32 | `wicket({dismissal:'hit_wicket', call:'wide'})` | wd 1 | L1, credited T7 | `WD+W` | no |
| U-WKT-33 | `wicket({dismissal:'run_out', call:'no_ball', runsRun:1, playerOutId:'L2', dismissalEnd:'non_striker_end'})` | nb 1 + L1 1 | L2 | `NB+1+W` | no; free hit next |
| U-WKT-34 | `wicket({dismissal:'run_out', call:'no_ball', runsTo:'bye', runsRun:1, playerOutId:'L1', dismissalEnd:'striker_end'})` | nb 1 + b 1 | L1 | `NB+1B+W` | no |
| U-WKT-35 | `wicket({dismissal:'hit_ball_twice', call:'no_ball'})` | nb 1 | L1, not credited | `NB+W` | no |
| U-WKT-36 | `wicket({dismissal:'run_out', runsTo:'bye', runsRun:1, …striker_end})` | b 1 | L1 | `B1+W` | yes |
| U-WKT-37 | same with `runsTo:'leg_bye'` | lb 1 | L1 | `LB1+W` | yes |
| U-WKT-38 | `wicket({dismissal:'obstructing_field', call:'no_ball', playerOutId:'L1', dismissalEnd:'striker_end'})` | nb 1 | L1 | `NB+W` | no |
| U-WKT-39 | caught on a no-ball | — | rejected `DISMISSAL_NOT_ALLOWED_ON_CALL` | | |
| U-WKT-40 | bowled on a wide | — | rejected `DISMISSAL_NOT_ALLOWED_ON_CALL` | | |
| U-WKT-41 | caught on a free hit (after `noBall()`) | — | rejected `DISMISSAL_NOT_ALLOWED_ON_FREE_HIT` | | |
| U-WKT-42 | stumped off a wide that is itself a free hit | — | rejected `DISMISSAL_NOT_ALLOWED_ON_FREE_HIT` | | |
| U-WKT-43 | run out on a free hit, `runsRun:1` | 1 run | L1 out | `1+W` | yes |
| U-WKT-44 | caught with `runsRun:1`; bowled with `boundary:4` (`rawEvents`) | — | rejected `RUNS_NOT_ALLOWED_WITH_DISMISSAL` | | |

### 3.4 Run-out ends and the next striker

Starting position: L1 is on strike at the striker's end and L2 is at the non-striker's end. In every row L3 then comes in to fill the vacancy.

| ID | Ball | Out | `dismissalEnd` | runsRun (counted) | Vacancy | Not-out batter | Next striker after `batter_in L3` |
|---|---|---|---|---|---|---|---|
| U-RO-01 | mid-over | L1 | striker_end | 0 | striker | L2 non-striker | L3 |
| U-RO-02 | mid-over | L1 | non_striker_end | 0 | non_striker | L2 → striker | L2 |
| U-RO-03 | mid-over | L1 | striker_end | 1 (+1 run) | striker | L2 non-striker | L3 |
| U-RO-04 | mid-over | L2 | non_striker_end | 1 (+1 run) | non_striker | L1 striker (the dismissal overrides the odd-run swap) | L1 |
| U-RO-05 | mid-over | L2 | striker_end | 1 | striker | L1 non-striker | L3 |
| U-RO-06 | mid-over | L2 | non_striker_end | 0 | non_striker | L1 striker | L1 |
| U-RO-07 | **last legal ball** | L1 | striker_end | 0 | striker → swapped to **non_striker** at over end | L2 striker | L2 faces the next over; L3 at the non-striker's end |
| U-RO-08 | last legal ball, caught | L1 | — | 0 | → non_striker | L2 striker | L2 |
| U-RO-09 | mid-over, caught | L1 | — | 0 | striker (Law 18.11: the new batter faces) | L2 | L3 |
| U-RO-10 | mid-over, run out of L1 at striker_end with `runsRun:2` | L1 | striker_end | 2 | striker | L2 | L3; team +2 |

### 3.5 Law 16.6 — no wicket after the winning run (`WICKET_AFTER_RESULT`)

Setup: M20 chase, target 150. Each row gives the score before the delivery.

| ID | Delivery | Expected |
|---|---|---|
| U-L166-01 | 149/8, need 1; `wicket({dismissal:'run_out', runsRun:1, playerOutId:<non-striker>, dismissalEnd:'striker_end'})` | rejected `WICKET_AFTER_RESULT` |
| U-L166-02 | 149/8; the same ball recorded as `scoreRuns(1)` | 150/8, `target_reached`, `confirm_result`, "Tigers won by 2 wickets (n balls left)" |
| U-L166-03 | 149/8, need 1; `wicket({dismissal:'stumped', call:'wide'})` | rejected (the wide penalty alone reaches the target) |
| U-L166-04 | 148/8, need 2; run out completing 1 run (scores level) | accepted: 149/9, the chase continues |
| U-L166-05 | the same as U-L166-01 in a super-over chase (innings 3) | rejected `WICKET_AFTER_RESULT` |
| U-L166-06 | 145/8, need 5; `noBall({boundary:4})` + a run out (`rawEvents`) | rejected (nb 1 + 4 = 5 ≥ target) |

---

## 4. Strike rotation (§19)

| ID | Situation | Expected striker next ball |
|---|---|---|
| U-STR-01 | runsRun 1 / 3 / 5 off the bat | swapped |
| U-STR-02 | runsRun 0 / 2 / 4 | unchanged |
| U-STR-03 | boundary 4 or 6 (`runsRun 0`) | unchanged |
| U-STR-04 | 1 + 4 overthrows (`runsRun 1, boundary 4`) | swapped |
| U-STR-05 | bye 1 / leg-bye 3 | swapped |
| U-STR-06 | `wide(1)` / `noBall({runsRun:1})` | swapped |
| U-STR-07 | ran 2 with 1 short (1 run scored) | unchanged (crossings 2) |
| U-STR-08 | ran 3 with 1 short | swapped |
| U-STR-09 | last legal ball, `scoreRuns(1)` | L1 faces 5.1 (odd-run swap, then the over-end swap) |
| U-STR-10 | last legal ball, `scoreRuns(0)` | L2 faces the next over |
| U-STR-11 | `strike_swapped` mid-over / between overs | swapped; legal balls unchanged |
| U-STR-12 | two `strike_swapped` in a row | back to the original |
| U-STR-13 | M8-LMS lone batter (7 down): `scoreRuns(1)` and the over end | strike never moves; `nonStrikerId` null |
| U-STR-14 | M8-LMS lone batter: `strike_swapped` | rejected `NOTHING_TO_SWAP` |
| U-STR-15 | G1 innings 0 over 3 | strikers L3, L1, L3, L1, L3, L1 |

---

## 5. Overs, bowlers and quotas (§12, §13)

| ID | Case | Expected |
|---|---|---|
| U-OVR-01 | G1 over 1 | 7 deliveries; `deliveryInOver` 1..7; labels `0.1 0.2 0.3 0.3 0.4 0.5 0.6` (the wide after two legal balls is `0.3`); the last has `endsOver` true |
| U-OVR-02 | after the 6th legal ball | positions swap; `bowlerId` null; `previousOverBowlerIds` [T7]; pending `select_next_bowler {overIndex 1, eligible excludes T7 with reason bowled_previous_over}` |
| U-OVR-03 | `ballsPerOver: 8` | the over ends after 8 legal balls; `formatOvers(10, 8)` is `'1.2'` |
| U-OVR-04 | maiden: 6 × `0` | `isMaiden` true; T7 maidens 1 |
| U-OVR-05 | maiden: 5 × `0` + `legBye(1)` | maiden (the leg-bye is not charged) |
| U-OVR-06 | not a maiden: 5 × `0` + `wide()` + `0` | not a maiden |
| U-OVR-07 | not a maiden: `noBall()` + 6 × `0` | not a maiden |
| U-OVR-08 | not a maiden: split over (T7 bowls 3 dots, injury, T8 bowls 3 dots) | neither bowler gets a maiden; `OverSummary.bowlerIds` [T7, T8] |
| U-OVR-09 | not a maiden: innings ends mid-over at 5 dots | the incomplete over is never a maiden |
| U-OVR-10 | consecutive overs: select T7 for over 2 | `BOWLER_CONSECUTIVE_OVERS`; with `allowBowlerConsecutiveOvers:true` it is accepted |
| U-OVR-11 | mid-over injury: `bowler_selected {T8, injury}` after 3 balls | T8 is credited with balls 4–6; T7 and T8 `oversUsed` 1 each; T7 may bowl over 3; T8 may **not** bowl over 2 (bowled part of the previous over) |
| U-OVR-12 | `bowler_selected {T8, suspended}` mid-over | T7 is in `removedBowlerIds`; selecting T7 later in the innings gives `BOWLER_REMOVED_FROM_ATTACK`; the next innings is unaffected |
| U-OVR-13 | re-selecting T7 in the same over after replacing him | `BOWLER_ALREADY_REPLACED` (`replaced_this_over` in `bowlerEligibility`) |
| U-OVR-14 | `bowler_selected {T8, over_start}` then `{T9, over_start}` before any delivery | T9 bowls; the first selection is simply superseded (no error) |
| U-OVR-15 | `bowler_selected {T8, injury}` at 0 deliveries / `{T8, over_start}` at 3 deliveries | `BOWLER_CHANGE_REASON_INVALID` both times |
| U-OVR-16 | uniform quota, T5 preset (`maxOversPerBowler 1`) | T7 is `quota_reached` for over 3 |
| U-OVR-17 | T20: selecting T7 for his 4th over | accepted with warning `BOWLER_QUOTA_LAST_OVER`; a 5th → `BOWLER_QUOTA_REACHED` |
| U-OVR-18 | `icc_one_fifth`, 17 overs (102 balls) | `limits.maxOversPerBowler` 3, `extraOverBowlers` 2; T7 and T8 each bowl a 4th; T9 selected for a 4th → `BOWLER_QUOTA_REACHED` |
| U-OVR-19 | `icc_one_fifth`, revision to 12 overs | `maxOversPerBowler` 2, `extraOverBowlers` 2 (recomputed from `maxBalls` 72) |
| U-OVR-20 | `oversUsed` counts distinct overs | T8 bowls the second half of over 2 and all of over 4 → `oversUsed` 2 |
| U-OVR-21 | super over round 2 with `restrictRepeatPlayers` | the bowler of round 1 is ineligible with `bowled_previous_super_over`; selecting him → `PLAYER_INELIGIBLE_SUPER_OVER` |
| U-OVR-22 | a substitute (T12) is never in `bowlerEligibility` | eligible ∪ ineligible = T1..T11 |

---

## 6. Innings completion (§64)

| ID | Case | Expected completion | Pending after |
|---|---|---|---|
| U-INN-01 | M20: 10 wickets | `all_out` at the 10th wicket | `start_next_innings {inningsIndex 1, kind regular, suggestedBattingTeamId TIG}` |
| U-INN-02 | `playersPerSide: 8` | `all_out` at 7 | |
| U-INN-03 | M8-LMS | 7 down: lone striker, no vacancy; `all_out` at **8** | |
| U-INN-04 | M8-7: Tigers bat | `all_out` at **6** wickets (7 players); Lions still at 7 | |
| U-INN-05 | M8-7 with `lastManStands` | Tigers' survivor alone at 6, all out at 7 | |
| U-INN-06 | M20: 120th legal ball | `overs_complete` | |
| U-INN-07 | custom 17 overs (`rulesForOvers(17)`) | `overs_complete` at 102 legal balls | |
| U-INN-08 | chase needs 4 at 18.2; `scoreRuns(4)` on 18.3 | `target_reached` at once (no further deliveries allowed) | `confirm_result` |
| U-INN-09 | `innings_ended {declared, absentees: []}` | `declared` | `start_next_innings` |
| U-INN-10 | `innings_ended {declared, absentees:[L11]}` | rejected `INVALID_ABSENTEE` | |
| U-INN-11 | 9 down, L11 injured: `innings_ended {batters_unavailable, absentees:[{L11, hurt:true}]}` | `batters_unavailable`; L11 status `absent`, text `absent hurt`; `InningsSummary.allOut` true | |
| U-INN-12 | absentee who already batted | `INVALID_ABSENTEE` | |
| U-INN-13 | `match_ended {no_result}` mid-innings | `match_ended` | null |
| U-INN-14 | `overs_revised` with maxBalls = legal balls so far (e.g. 60 at 10.0) | `overs_complete` at once | `start_next_innings` |
| U-INN-15 | chase `overs_revised {terminal}` | `terminated` | `confirm_result` |
| U-INN-16 | super-over innings: 2 wickets | complete (`maxWickets` = min(2, 10)) | |
| U-INN-17 | super-over innings: 6 legal balls | `overs_complete` | |
| U-INN-18 | a completed innings never reopens: a delivery after U-INN-06 | `PENDING_ACTION_REQUIRED` | |
| U-INN-19 | substitutes are not batting rows | innings 0 has 11 batting rows (L1..L11); U-INN-11's "did not bat" list excludes L12 | |

---

## 7. Results and match completion (§21, §22, §63)

Result text comes from `formatResult`. Teams are Lions and Tigers.

| ID | Play | `naturalResult` | Text |
|---|---|---|---|
| U-RES-01 | Lions 160/6 (20), Tigers 157/9 (20) | win LIO, runs 3, `normal` | `Lions won by 3 runs` |
| U-RES-02 | Lions 160/6, Tigers 159/7 | win LIO, runs 1 | `Lions won by 1 run` |
| U-RES-03 | Tigers reach 161/5 at 18.0 | win TIG, wickets 5, ballsRemaining 12 | `Tigers won by 5 wickets (12 balls left)` |
| U-RES-04 | Tigers reach the target at 19.5, 9 down | wickets 1, ballsRemaining 1 | `Tigers won by 1 wicket (1 ball left)` |
| U-RES-05 | M8-7: Tigers chase 3 down | wickets **3** (own threshold 6 − 3) | `Tigers won by 3 wickets (…)` |
| U-RES-06 | 160 v 160, super over disabled | `{type:'tie', decider:null}` | `Match tied`; pending `confirm_result` |
| U-RES-07 | Lions 160/5 (20); innings 1 revised to 12 overs with target 100; Tigers 87/6 (12) | win LIO, runs 12, `revised_target` | `Lions won by 12 runs (revised target)` |
| U-RES-08 | Tigers bat first 170/7; Lions 131/2 at 14.2; `play_suspended`; `overs_revised {1, maxBalls 86, target 111, terminal}` while paused | win LIO, runs **21**, `par_score`; completion `terminated`; `confirm_result` outranks `resume_play`; `match_ended {natural}` accepted while paused | `Lions won by 21 runs (par score)` |
| U-RES-09 | as U-RES-08 with Lions 100/5 | win TIG, runs 10, `par_score` | `Tigers won by 10 runs (par score)` |
| U-RES-10 | as U-RES-08 with Lions 110/4 | tie, decider null | `Match tied (par score)` |
| U-RES-11 | 150 v 150; `resolve_tie {options: super_over, accept_tie, decide_other; nextSuperOverRound 1}`; `super_over_started {1}`; Tigers (batted second) bat first 11/1, Lions 8/2 | tie, decider `{super_over, TIG, superOverRounds 1}`; `resultWinner` TIG; `resultMethod` `super_over` | `Match tied — Tigers won the Super Over` |
| U-RES-12 | super over tied again, `ifTiedAgain:'repeat'` | undecided tie; `resolve_tie.nextSuperOverRound` 2; round 2 decides | |
| U-RES-13 | super over tied, `boundary_count`; 4s + 6s over the match and super overs: Lions 14, Tigers 12 | decider `{boundary_count, LIO}` | `Match tied — Lions won on boundary count` |
| U-RES-14 | as U-RES-13 with boundaries level | undecided; pending `resolve_tie` | |
| U-RES-15 | `maxRounds: 1`, round 1 tied | `resolve_tie.options` excludes `super_over`; `super_over_started {2}` → `SUPER_OVER_LIMIT_REACHED` | |
| U-RES-16 | undecided tie + `match_ended {tie_decided, coin_toss, LIO}` | decider `{coin_toss, LIO, 0}`; `resultMethod` `coin_toss` | text (proposed): `Match tied — Lions won the coin toss` |
| U-RES-17 | `match_ended {no_result, 'Rain'}` at 8.0 | `no_result`; lifecycle `completed`; `matchStatusLabel` `No Result` | `No result` |
| U-RES-18 | empty log + `match_ended {abandoned, 'Waterlogged'}` | `abandoned`; lifecycle `abandoned` | `Match abandoned` |
| U-RES-19 | `match_ended {walkover, TIG}` as the first event | walkover TIG, loser LIO; no innings | `Tigers won by walkover` |
| U-RES-20 | walkover after one delivery | rejected `WALKOVER_AFTER_PLAY` | |
| U-RES-21 | `match_ended {awarded, TIG, 'Lions refused to continue', margin null}` mid-innings | awarded TIG | `Match awarded to Tigers` |
| U-RES-22 | awarded with `winnerTeamId: null` | `resultWinner` null, `resultLoser` null | (proposed) `No result (awarded)` |
| U-RES-23 | the natural result needs confirmation | before `match_ended`: `result` null, `naturalResult` set, `lifecycle` `live`, `canRecordDelivery` false, `resultText` set; after: `result` equals `naturalResult`, lifecycle `completed`, pending null |
| U-RES-24 | `match_ended {natural}` at 10.0 of innings 0 | `NATURAL_RESULT_NOT_REACHED` | |
| U-RES-25 | `match_ended {tie_decided}` when the natural result is a win | `RESULT_NOT_TIED` | |
| U-RES-26 | any event after `match_ended` | `MATCH_ALREADY_ENDED` | |
| U-RES-27 | `resultLoser(tieDecidedByTigers, [LIO, TIG])` | LIO | |
| U-RES-28 | `matchStatusLabel` | `(scheduled,null)` Scheduled · `(live,null)` Live · `(paused,null)` Paused · `(postponed,null)` Postponed · `(cancelled,null)` Cancelled · `(completed,win)` Completed · `(completed,tie)` Tied · `(completed,no_result)` No Result · `(completed,walkover)` Walkover · `(abandoned,abandoned)` Abandoned · `(completed,awarded)` Completed | |
| U-RES-29 | `suggestRevisedTarget('average_run_rate', 160, 120, 72)` | **97** (⌊160 × 72 ÷ 120⌋ + 1) | |
| U-RES-30 | `suggestRevisedTarget('average_run_rate', 150, 120, 70)` / `(…, 150, 0, 70)` | **88** / **null** | |
| U-RES-31 | G1 | natural result at 2.2 of the chase: win TIG, wickets 9, ballsRemaining 4 | `Tigers won by 9 wickets (4 balls left)` |

### 7.1 Penalty runs (`penalty_awarded`, Law 41)

| ID | Situation | Event | Expected |
|---|---|---|---|
| U-PEN-01 | Lions batting, innings 0, 50/1 | `{LIO, inningsIndex 0, 5}` | 55/1, extras.penalty 5 |
| U-PEN-02 | Tigers chasing 150, 146/3 | `{TIG, 1, 5}` | 151 ≥ 150 → `target_reached` → `confirm_result` |
| U-PEN-03 | innings 0 complete at 160; Tigers batting in innings 1 | `{LIO, 0, 5}` (fielding side, already batted) | innings 0 is 165; target rises from 161 to 166 |
| U-PEN-04 | innings 0 in progress; Tigers (fielding, not yet batted) awarded | `{TIG, 1, 5}` | `carriedPenalties` [{1, TIG, 5}]; innings 1 starts on 5 |
| U-PEN-05 | the last ball of the chase ties 160 v 160; the penalty is recorded after it | `{TIG, 1, 5}` | innings 1 stays complete at 165; the natural result becomes a TIG win by wickets; no further deliveries allowed |
| U-PEN-06 | a super over in progress (round 1) | `{LIO, 0, 5}` / `{TIG, 1, 5}` | `INVALID_PENALTY_INNINGS` for both; main-match totals unchanged |
| U-PEN-07 | a super over in progress, penalty to the batting side of innings 2 | `{…, 2, 5}` | applied to innings 2 only |
| U-PEN-08 | while paused | `{LIO, 0, 5}` | accepted |
| U-PEN-09 | `runs: 0` / `runs: 100` | | `INVALID_PENALTY` |
| U-PEN-10 | a penalty to a third team id | | `TEAM_NOT_IN_MATCH` |
| U-PEN-11 | `buildEvents` default `inningsIndex` for batting-side / fielding-side penalties | | the index per the placement rules (current innings / most recent innings of the phase / upcoming innings) |

### 7.2 Overs revision (§7)

| ID | Event | Expected |
|---|---|---|
| U-REV-01 | innings 0 at 8.0; `overs_revised {0, maxBalls 72}` | `limits.maxBalls` 72, `revised` true; warning `CHASE_OVERS_NOT_REVISED` |
| U-REV-02 | `revise_overs {scope:'both_innings'}` | no warning; innings 1 starts with `maxBalls` 72 |
| U-REV-03 | revise to fewer balls than bowled | `INVALID_OVERS_REVISION` |
| U-REV-04 | target on innings 0 | `INVALID_TARGET` |
| U-REV-05 | chase at 120/2 with target 150; revision `{1, maxBalls 84, target 118}` | target ≤ runs → `target_reached` at once, `method: revised_target` |
| U-REV-06 | chase revision with a new target but the same `maxBalls` | warning `TARGET_REVISION_WITHOUT_OVERS_CHANGE` |
| U-REV-07 | powerplays clamp: M20 revised to 5 overs with `powerplays` undefined | phase `1–6` becomes `1–5` |
| U-REV-08 | two revisions of the same innings | the later one supersedes the earlier |
| U-REV-09 | `terminal` on innings 0, or without a target, or with `maxBalls` ≠ balls bowled | `INVALID_OVERS_REVISION` |
| U-REV-10 | revision of a completed innings | `INVALID_OVERS_REVISION` |

### 7.3 Suspension and pending-action priority

| ID | State | Expected `pendingAction` |
|---|---|---|
| U-PND-01 | fresh innings | null; `canRecordDelivery` true |
| U-PND-02 | a wicket with no incoming batter chosen | `select_next_batter {position striker, candidates L3..L11 in squad order, canEndInnings false}` |
| U-PND-03 | the wicket falls on the last ball of the over | `select_next_batter` first, then after `batter_in` `select_next_bowler` |
| U-PND-04 | `play_suspended {rain}` with a vacancy open | `resume_play {rain}` (outranks `select_next_batter`); lifecycle `paused`; a delivery → `PLAY_SUSPENDED` |
| U-PND-05 | `play_resumed` | back to `select_next_batter`; a second `play_resumed` → `NOT_SUSPENDED` |
| U-PND-06 | innings complete, then `play_suspended` | `resume_play` before `start_next_innings` |
| U-PND-07 | natural result reached, then `play_suspended` | `confirm_result` (outranks `resume_play`) |
| U-PND-08 | tie + suspended | `resolve_tie`; `super_over_started` → `PLAY_SUSPENDED` until `play_resumed` |
| U-PND-09 | all yet-to-bat batters used up: 9 down, L11 retired hurt and unable to bat | `select_next_batter.candidates` [L11] (retired_hurt), `canEndInnings` true |
| U-PND-10 | mandatory retirement `{atRuns 30, mayReturn true, timing 'immediately'}`; L1 reaches 31 | `retirementsDue` [{L1, 30}]; pending still null; `canRecordDelivery` true; scoring on works |
| U-PND-11 | the same with `timing:'end_of_over'` | listed only after the over's last legal ball |
| U-PND-12 | no yet-to-bat batter remains | `retirementsDue` empty |
| U-PND-13 | L1 retires not out at 31, returns once no yet-to-bat batter remains | `returnedFromRetirement` true; never listed again; with `mayReturn:false` → `BATTER_NOT_ELIGIBLE` |
| U-PND-14 | `needsRepair` log | `canRecordDelivery` false whatever the pending action |

---

## 8. Statistics formulas and cards (`scoring/stats.ts`, replay cards)

### 8.1 Formulas

| ID | Call | Expected |
|---|---|---|
| U-STAT-01 | `ballsToOvers(100, 6)` | 16.666667 (not 16.4) |
| U-STAT-02 | `ballsToOvers(10, 8)` | 1.25 |
| U-STAT-03 | `strikeRate(13, 7)` / `strikeRate(0, 0)` | 185.714286 / null |
| U-STAT-04 | `economyRate(28, 22, 6)` / `economyRate(5, 0, 6)` | 7.636364 / null |
| U-STAT-05 | `runRate(142, 100, 6)` (§10 CRR) | 8.52 |
| U-STAT-06 | `requiredRunRate(76, 50, 6)` (§10 RRR: 25-over chase, target 218, 142/4 at 16.4) | 9.12 |
| U-STAT-07 | `requiredRunRate(10, 0, 6)` | null |
| U-STAT-08 | `battingAverage(250, 5)` / `battingAverage(250, 0)` | 50 / null |

### 8.2 G1 innings 0 cards (Lions 27/1, 3 overs)

| ID | Row | Expected |
|---|---|---|
| U-CARD-01 | L1 Babar | position 1, `not_out`, 7 runs (6 balls), 0 × 4s, 0 × 6s, SR 116.666667 |
| U-CARD-02 | L2 Fakhar | position 2, `out`, 13 (7), 1 × 4, 1 × 6, SR 185.714286, `b Shaheen` |
| U-CARD-03 | L3 Saim | position 3, `not_out`, 4 (6), SR 66.666667 |
| U-CARD-04 | L4..L11 | `yet_to_bat`, position null, `dismissalText` `''`; L12 has no row |
| U-CARD-05 | T7 Hassan | order 1, 12 legal balls, `oversUsed` 2, 0 maidens, 21 runs, 0 wickets, economy 10.5, dots 1, 1 wide delivery for 1 wide run, 1 four and 1 six conceded; `formatBowlingFigures` `'2-0-21-0'` |
| U-CARD-06 | T8 Shaheen | order 2, 6 balls, 5 runs (1 + nb 1 + 1 + 2; the leg-bye is not charged), 1 wicket, economy 5.0, dots 4 (`0`, `W`, `0`, `LB1`), 1 no-ball delivery; `'1-0-5-1'` |
| U-CARD-07 | Partnership 1 | wicketNumber 1, {L1, L2}, 15 runs, 8 balls; L1 1 (1), L2 13 (7); extras 1; `endedBy: 'wicket'` |
| U-CARD-08 | Partnership 2 | wicketNumber 2, {L1, L3}, 12 runs, 10 balls; L1 6 runs (5 balls incl. the no-ball), L3 4 (6); extras 2; `endedBy: 'innings_end'` |
| U-CARD-09 | Fall of wickets | [{1, L2, teamRuns 15, legalBalls 8, overLabel `'1.2'`, bowled}] |
| U-CARD-10 | Overs | over 0: [T7], runs 15, bowlerRuns 15, wickets 0, extras 1, tokens `1 4 WD 0 2 6 1`, score at end 15/0 · over 1: [T8], 6, 5, 1, 2, `0 W 1 NB+1 0 LB1 2` (the 5th token has `isFreeHit`), 21/1 · over 2: [T7], 6, 6, 0, 0, 27/1 |
| U-CARD-11 | Innings | 27/1, 18 legal balls, `runRate` 9.0, completion `overs_complete`, powerplay phase 1 `complete` with 15 runs, 0 wickets, 6 balls |
| U-CARD-12 | `worm(state)` innings 0 | points (0,0,0), (6,15,0), (12,21,1), (18,27,1) |
| U-CARD-13 | `manhattan(innings0)` | (0,15,0), (1,6,1), (2,6,0) |
| U-CARD-14 | G1 chase batting | T1 17 (7) `c Amir b Abdul`; T2 7 (4) not out; T3 4 (3) not out |
| U-CARD-15 | G1 chase bowling | L10 Imran `'1.2-0-20-0'`; L11 Abdul `'1-0-8-1'` |
| U-CARD-16 | `boundaryCounts` G1 | LIO 4s 1, 6s 1; TIG 4s 3, 6s 1 |
| U-CARD-17 | `playerMatchStats(G1, 'L7')` | batting null; bowling null; catches 1 |
| U-CARD-18 | super-over runs never enter innings 0/1 cards or `playerMatchStats` | U-RES-11 cards equal the main innings only |

### 8.3 CRR, RRR and chase state (§10)

| ID | State | Expected |
|---|---|---|
| U-CRR-01 | G1 innings 0 after over 2 (21/1, 12 balls) | `currentRunRate` 10.5; `formatRate` `'10.50'` |
| U-CRR-02 | G1 chase after over 1 (18/0) | `chase = {target 28, runsRequired 10, ballsRemaining 12, requiredRunRate 5.0}`; CRR 18.0 |
| U-CRR-03 | 25-over chase, target 218, 142/4 at 16.4 | CRR 8.52, RRR 9.12, `formatScore` `142/4`, `formatOvers(100,6,{alwaysShowBalls:true})` `'16.4'` |
| U-CRR-04 | before the first legal ball | `currentRunRate` null → `formatRate` `'–'` |
| U-CRR-05 | first innings | `chase` null |
| U-CRR-06 | after a target revision | `chase.target` = revised target; `ballsRemaining` uses the revised `maxBalls` |

---

## 9. Formatting (`scoring/format.ts`)

| ID | Call | Expected |
|---|---|---|
| U-FMT-01 | `formatOvers(100,6)` · `(120,6)` · `(0,6)` · `(120,6,{alwaysShowBalls:true})` · `(10,8)` · `(5,6)` | `16.4` · `20` · `0` · `20.0` · `1.2` · `0.5` |
| U-FMT-02 | `formatScore(142,4)` | `142/4` |
| U-FMT-03 | `formatRate(8.5238)` · `(null)` · `(10.5)` | `8.52` · `–` · `10.50` |
| U-FMT-04 | `formatNrr(1.2344)` · `(-0.5674)` · `(0)` · `(null)` · `(3.254902)` · `(-0.00001)` | `+1.234` · `-0.567` · `0.000` · `–` · `+3.255` · `0.000` (proposed: never `-0.000`) |
| U-FMT-05 | `formatBowlingFigures({legalBalls:22, maidens:0, runsConceded:28, wickets:2}, 6)` | `3.4-0-28-2` (economy 7.64, not the "7.00" printed in §12) |
| U-FMT-06 | `formatRequirement(23,14)` · `(1,1)` · `(10,12)` | `Need 23 from 14 balls` · `Need 1 run from 1 ball` · `Need 10 from 12 balls` (the contract's example wording; see the report) |
| U-FMT-07 | `ballToken` for every grammar form | `0` (`•` with `dotStyle:'dot'`), `1`, `4` (four), `6` (six), `5`, `WD`, `WD+1`, `WD+4`, `NB`, `NB+4`, `NB+6`, `NB+2B`, `NB+1LB`, `B1`, `LB2`, `W`, `1+W`, `WD+W`, `NB+1+W`, `1s` |
| U-FMT-08 | accessibility labels | `WD+1` → "Wide, plus one run"; `NB+2B` → "No ball, plus two byes"; `1s` → "One run, one short"; caught → "Wicket, caught" |
| U-FMT-09 | `dismissalText` | every text in U-WKT-10…28; an unknown fielder id renders `Unknown` |

---

## 10. Validation codes — one trigger per code (`validateEvent`, mode `append`)

Every `EVENT_VALIDATION_CODES` member has at least one row. Messages are asserted non-empty, organizer-friendly, and free of ids or stack text. The base state is M20 at a fresh innings unless stated.

| ID | Code | Trigger |
|---|---|---|
| U-VAL-01 | MATCH_ALREADY_ENDED | a delivery after `match_ended` |
| U-VAL-02 | MATCH_NOT_STARTED | a delivery or `strike_swapped` on an empty log |
| U-VAL-03 | PLAY_SUSPENDED | a delivery or `bowler_selected` while paused |
| U-VAL-04 | NOT_SUSPENDED | `play_resumed` while live |
| U-VAL-05 | PENDING_ACTION_REQUIRED | a delivery while `select_next_batter` or `select_next_bowler` is pending |
| U-VAL-06 | INNINGS_NOT_IN_PROGRESS | `innings_ended {declared}` after innings 0 completed and before `innings_started {1}` (proposed trigger; see the report on precedence) |
| U-VAL-07 | INNINGS_STILL_IN_PROGRESS | `innings_started {1}` while innings 0 is in progress |
| U-VAL-08 | WRONG_INNINGS_INDEX | `innings_started {2}` after innings 0 (expected 1) |
| U-VAL-09 | WRONG_BATTING_TEAM | `innings_started {1, battingTeamId LIO}` |
| U-VAL-10 | TOSS_MISMATCH | toss LIO/bat but `innings_started {0, TIG}`; with toss null, either team is accepted |
| U-VAL-11 | SUPER_OVER_NOT_STARTED | `innings_started {2}` after a tie with no `super_over_started` |
| U-VAL-12 | SUPER_OVER_NOT_ALLOWED | `super_over_started` with `superOver.enabled:false` |
| U-VAL-13 | SUPER_OVER_LIMIT_REACHED | U-RES-15 |
| U-VAL-14 | PLAYER_NOT_IN_SQUAD | `batter_in {X99}` |
| U-VAL-15 | PLAYER_WRONG_SIDE | `bowler_selected {L7}` while Tigers are fielding |
| U-VAL-16 | SAME_PLAYER_BOTH_ENDS | `innings_started {striker L1, nonStriker L1}` |
| U-VAL-17 | BATTER_NOT_AT_CREASE | `batter_retired {L5}` |
| U-VAL-18 | BATTER_ALREADY_BATTING | `batter_in {L2}` into L1's vacancy |
| U-VAL-19 | BATTER_ALREADY_OUT | `batter_in {L1}` after L1 was bowled |
| U-VAL-20 | BATTER_NOT_ELIGIBLE | `batter_in` of a `retired_not_out` batter while yet-to-bat batters remain |
| U-VAL-21 | SUBSTITUTE_NOT_ALLOWED | T12 as opener, as bowler, or in `batter_in` |
| U-VAL-22 | PLAYER_INELIGIBLE_SUPER_OVER | U-OVR-21; also a batter dismissed in round 1 opening round 2 |
| U-VAL-23 | NO_VACANCY | `batter_in` with both batters in |
| U-VAL-24 | POSITION_NOT_VACANT | vacancy at non_striker, `batter_in {L3, striker}` |
| U-VAL-25 | VACANCY_MUST_BE_FILLED | `strike_swapped` while a vacancy is open (proposed trigger) |
| U-VAL-26 | BOWLER_NOT_SELECTED | `applyHistoryEdits` deleting the only over-start `bowler_selected` of over 2 → `{ok:false, code:'BOWLER_NOT_SELECTED', atSeq}` |
| U-VAL-27 | BOWLER_CONSECUTIVE_OVERS | U-OVR-10 |
| U-VAL-28 | BOWLER_QUOTA_REACHED | U-OVR-17 |
| U-VAL-29 | BOWLER_ALREADY_REPLACED | U-OVR-13 |
| U-VAL-30 | BOWLER_REMOVED_FROM_ATTACK | U-OVR-12 |
| U-VAL-31 | BOWLER_CHANGE_REASON_INVALID | U-OVR-15 |
| U-VAL-32 | CONTEXT_MISMATCH | a delivery stamped `strikerId L2` while L1 is the derived striker (append) |
| U-VAL-33 | INVALID_RUNS | `runsRun` 10, −1 or 1.5 |
| U-VAL-34 | INVALID_SHORT_RUNS | `runsRun 1, shortRuns 2` |
| U-VAL-35 | INVALID_BOUNDARY | `boundary 5` |
| U-VAL-36 | SIX_NOT_OFF_BAT | U-EXT-11, 24, 35 |
| U-VAL-37 | RUNS_NOT_ALLOWED_WITH_DISMISSAL | U-WKT-44 |
| U-VAL-38 | DISMISSAL_NOT_ALLOWED_ON_CALL | U-WKT-39, 40 |
| U-VAL-39 | DISMISSAL_NOT_ALLOWED_ON_FREE_HIT | U-WKT-41, 42 |
| U-VAL-40 | DISMISSED_PLAYER_NOT_AT_CREASE | bowled with `playerOutId L2`; run out of L5 |
| U-VAL-41 | DISMISSAL_END_REQUIRED | run out without `dismissalEnd` |
| U-VAL-42 | DISMISSAL_END_NOT_ALLOWED | bowled with `dismissalEnd:'striker_end'` |
| U-VAL-43 | FIELDER_NOT_IN_FIELDING_SIDE | caught by L5 while Lions bat |
| U-VAL-44 | TOO_MANY_FIELDERS | run out with 3 fielders |
| U-VAL-45 | WICKET_AFTER_RESULT | U-L166-01 |
| U-VAL-46 | INVALID_PENALTY | U-PEN-09 |
| U-VAL-47 | INVALID_PENALTY_INNINGS | U-PEN-06 |
| U-VAL-48 | INVALID_ABSENTEE | U-INN-10, 12 |
| U-VAL-49 | INVALID_OVERS_REVISION | U-REV-03, 09, 10 |
| U-VAL-50 | INVALID_TARGET | U-REV-04; target 0 |
| U-VAL-51 | NOTHING_TO_SWAP | U-STR-14 |
| U-VAL-52 | NATURAL_RESULT_NOT_REACHED | U-RES-24 |
| U-VAL-53 | RESULT_NOT_TIED | U-RES-25 |
| U-VAL-54 | WALKOVER_AFTER_PLAY | U-RES-20 |
| U-VAL-55 | TEAM_NOT_IN_MATCH | U-PEN-10; walkover to a third team |
| U-VAL-56 | SEQ_OUT_OF_ORDER | replay of seqs `1,2,4,5` → the event with seq 4 is an error issue; seq 5 is applied (it follows the previous event read) |
| U-VAL-57 | UNKNOWN_EVENT_KIND | replay of `{kind:'coin_flip'}` |

Warnings (`ok:true`), one row each:
- U-VAL-60 `BOWLER_QUOTA_LAST_OVER` (U-OVR-17).
- U-VAL-61 `TARGET_REVISION_WITHOUT_OVERS_CHANGE` (U-REV-06).
- U-VAL-62 `CHASE_OVERS_NOT_REVISED` (U-REV-01).
- U-VAL-63 `SQUAD_EXHAUSTED`: `batter_in` of the last yet-to-bat player (proposed trigger).
- U-VAL-64 `UNUSUAL_RUNS` (U-CMD-08).
- U-VAL-65 `FIELDER_UNKNOWN` (U-WKT-13).

**Stamp mode (U-VAL-70).** The same stale-stamp delivery as U-VAL-32:
- in `replay` mode gives `ok:true` and becomes a `warning` `ReplayIssue`;
- the delivery is applied with the derived striker;
- `needsRepair` stays false.

---

## 11. Undo, redo and historical edits (`scoring/history.ts`, §15, §16)

| ID | Case | Expected |
|---|---|---|
| U-HIS-01 | `lastActionGroup([])` / `undoLastAction([])` | `[]` / null |
| U-HIS-02 | G1 innings 0 after U-CMD-15 (delivery + batter_in, one actionId) | `undoLastAction` removes **both**; replay equals the state before the wicket (0 wickets, L1 on strike) |
| U-HIS-03 | undo three times across an over end | the state equals `replayMatch` of the truncated log (never arithmetic) |
| U-HIS-04 | `redoAction(setup, events, undone)` | `{ok:true}`; events deep-equal the pre-undo log (same ids, seqs, `recordedAt`) |
| U-HIS-05 | undo, then a new ball, then redo | `{ok:false, code:'REDO_STALE'}` |
| U-HIS-06 | undo `match_ended` (G1 after confirmation) | lifecycle `live`; pending `confirm_result` again |
| U-HIS-07 | 1 → 2 runs: over `scoreRuns(1)` (L1), `0` (L2), `4` (L2); `editEvent(seq of ball 1, [2 runs])` | balls 2–3 restamped striker L1 (`diff.restampedIds` = those 2 ids); L1 2 + 0 + 4 = 6 runs (3 balls); L2 0 balls |
| U-HIS-08 | wide → legal: over 1 with a wide at delivery 3 (7 deliveries); `bowler_selected T8` precedes delivery 8 | after editing delivery 3 to `0`: the over ends at delivery 6 (old 7th becomes 1.1 by T8); `bowler_selected` re-anchored before old delivery 7 (`diff.reanchoredIds`); old delivery 7 restamped with bowler T8 |
| U-HIS-09 | legal → wide (the inverse) | the selection moves one delivery later; that delivery restamped with T7 |
| U-HIS-10 | replace a wicket delivery with a dot without removing its `batter_in` | `{ok:false, code:'NO_VACANCY', atSeq: <batter_in seq>}` |
| U-HIS-11 | the same, with a second op deleting the `batter_in` | ok; wickets −1; `affectedInnings` [0] |
| U-HIS-12 | inserted events | fresh ids from `ctx.ids`, `recordedAt = ctx.now`, **one fresh actionId per op**: an `insert_before` mid-log and an `insert_after` at the tail get different actionIds |
| U-HIS-13 | `normalizeLog` twice | the second call is a no-op (deep-equal, empty reanchored/restamped lists) |
| U-HIS-14 | `resultChanged` | G1: editing chase over 1 ball `6` → `0` leaves the chase short of 28 (no natural result): `resultChanged` true; changing the catcher of the chase wicket from L7 to L8 gives false |
| U-HIS-15 | `logFingerprint` | 8 lowercase hex chars; deterministic; changes when any field of any event changes; **undo + a different new ball with the same `lastSeq`** gives a different fingerprint |
| U-HIS-16 | edit ops address ORIGINAL seqs | ops `[replace seq 5, delete seq 9]` applied in order refer to the original numbering; the output is renumbered 1..n |
| U-HIS-17 | an edited log must replay with zero issues | an edit introducing `CONTEXT_MISMATCH` is impossible (restamped); an invalid edit returns `{ok:false}` with the first failing seq |

---

## 12. Replay invariants (`scoring/replay.ts`)

| ID | Invariant | Method |
|---|---|---|
| U-RPL-01 | Determinism | `replayMatch(M3, G1)` twice → deep-equal |
| U-RPL-02 | Purity | frozen inputs; no throw on mutation attempts |
| U-RPL-03 | `initialMatchState(setup)` deep-equals `replayMatch(setup, [])` | lifecycle `not_started`, `lastSeq` 0, `lastAppliedSeq` 0, `issues` [] |
| U-RPL-04 | Incremental equivalence | for every prefix k of G1: `applyEvent(setup, replayMatch(setup, E[0..k)), E[k])` deep-equals `replayMatch(setup, E[0..k])`; plus 500 random valid matches (seeded generator: random intents from the legal set of the current pending action) |
| U-RPL-05 | Totality (fuzz) | 2 000 random arrays of 1–300 events (random kinds, random fields, shuffled seqs) never throw; every invalid event appears as an `error` issue; `needsRepair` ⇔ an error issue exists |
| U-RPL-06 | One bad event in the middle | G1 with seq 10 replaced by an invalid delivery (`boundary 5`): exactly one error issue (seq 10); seqs 11..n applied; `lastSeq` = n; `lastAppliedSeq` = n; `needsRepair` true |
| U-RPL-07 | A seq gap | seqs 1..9, 11..n: seq 11 is `SEQ_OUT_OF_ORDER` (error, skipped); seq 12 follows 11 and is applied |
| U-RPL-08 | Duplicate seq | two events with seq 7: the second is an error |
| U-RPL-09 | A stale stamp during replay | a warning issue; applied with the derived context; `needsRepair` false |
| U-RPL-10 | `deriveMatchStatus` | `(not_started, 'postponed')` → postponed; `(live, 'scheduled')` → live; paused → paused; completed → completed; abandoned → abandoned |
| U-RPL-11 | `currentInnings` | null before innings 0; the in-progress innings; the last started innings after completion |
| U-RPL-12 | Performance | 50-over match, about 700 events, `replayMatch` median of 5 runs < 50 ms in node (after one warm-up run) |

---

## 13. Match summary (`scoring/summary.ts`)

| ID | Case | Expected |
|---|---|---|
| U-SUM-01 | `buildMatchSummary` of a live match | null |
| U-SUM-02 | G1 completed | `summaryVersion` 2; `status` completed; winner TIG; `ballsPerOver` 6; innings[0] `{LIO, 27, 1, legalBalls 18, allottedBalls 18, allOut false, completion overs_complete, target null, extras 3, fours 1, sixes 1}`; innings[1] `{TIG, 28, 1, 14, 18, false, target_reached, target 28, targetRevised false}`; `superOvers` []; `squads` without L12/T12 |
| U-SUM-03 | after a revision to 12 overs | `allottedBalls` 72; `targetRevised` true |
| U-SUM-04 | all out / batters_unavailable | `allOut` true for both |
| U-SUM-05 | a super-over match | `superOvers` has 2 innings; `innings[*].batting` excludes super-over balls |
| U-SUM-06 | no tournament context fields exist on the object | keys ⊆ `MatchSummary` keys |
| U-SUM-07 | `summariesAffectStandingsEqually(a, a')` | true for a clone; false when the margin, winner, method, tie decider, `ballsPerOver`, any innings runs/balls/wickets/allotted/allOut/completion, target or `targetRevised` differs; true when only a player line differs |
| U-SUM-08 | `SCORING_PROJECTION_VERSION` is a positive integer | ≥ 1 |

## 14. Presets and rules (`scoring/presets.ts`)

| ID | Call | Expected |
|---|---|---|
| U-PRE-01 | `getBuiltinPreset('T20')` / `('X')` | the T20 preset / null |
| U-PRE-02 | `defaultMaxOversPerBowler` for 1, 2, 5, 6, 17, 20, 50 | 1, 1, 1, 2, 4, 4, 10 |
| U-PRE-03 | `rulesForOvers(17)` | `oversPerInnings` 17, `maxOversPerBowler` 4, powerplay `1–5` (6 × 17 ÷ 20 = 5.1 → 5), everything else as the base |
| U-PRE-04 | `rulesForOvers(1)` | `maxOversPerBowler` 1, powerplay `1–1` |
| U-PRE-05 | `validateRules` errors | `oversPerInnings` 0 → OVERS_INVALID; `ballsPerOver` 13 → BALLS_PER_OVER_INVALID; `playersPerSide` 1 or 16 → PLAYERS_PER_SIDE_INVALID; wide penalty −1 → PENALTY_INVALID; powerplay 7–6 → POWERPLAY_INVALID; phases 1–6 and 5–8 → POWERPLAY_OVERLAP; super over 0 overs → SUPER_OVER_INVALID; retirement `atRuns` 0 → RETIREMENT_INVALID |
| U-PRE-06 | `validateRules` warning | 20 overs, `maxOversPerBowler` 1, 11-a-side → BOWLER_QUOTA_TOO_LOW (severity warning) |
| U-PRE-07 | every built-in preset | `validateRules` returns [] |
| U-PRE-08 | `OVERS_QUICK_PICKS` | `[1,2,5,6,10,20,25,30,40,50]` (§7) |

---

## 15. RNG and pools (`tournament/rng.ts`, `tournament/pools.ts`, §30–§33)

| ID | Call | Expected |
|---|---|---|
| U-RNG-01 | `mulberry32(847291)` first 3 values | 0.4183025225, 0.6612153111, 0.4243005631 (±1e-10) |
| U-RNG-02 | `mulberry32(1)` first 3 values | 0.6270739406, 0.0027357212, 0.5274470400 |
| U-RNG-03 | `normalizeSeed('847291')` · `(847291)` · `(4294967297)` · `('abc')` · `('Summer Cup 2026')` | 847291 · 847291 · 1 · 440920331 · 3343153722 |
| U-RNG-04 | `shuffle(items, rng)` | a permutation; a new array; input untouched; same seed → same order |
| U-RNG-05 | `randomInt(rng, 10)` | an integer in [0,10) over 10 000 draws; every value is hit |
| U-POOL-01 | `poolName(0)` · `(1)` · `(25)` · `(26)` · `(27)` | `Pool A` · `Pool B` · `Pool Z` · `Pool AA` · `Pool AB` |
| U-POOL-02 | `distributePoolSizes` for (10,3), (16,4), (9,2), (7,3), (11,4), (5,5), (128,16) | [4,3,3], [4,4,4,4], [5,4], [3,2,2], [3,3,3,2], [1,1,1,1,1], sixteen × 8 |
| U-POOL-03 | `assignRandom(T01..T16, {poolCount:4}, [pA..pD], 847291)` | 4 pools of 4; every team exactly once; `seed` 847291 |
| U-POOL-04 | the same call twice | deep-equal (determinism with seed) |
| U-POOL-05 | seed 847292 | a different assignment (asserted not deep-equal) |
| U-POOL-06 | 10 teams, `{sizes:[4,3,3]}` | sizes 4, 3, 3 in pool order |
| U-POOL-07 | `{sizes:[4,4,3]}` for 10 members | throws (programmer error; proposed, like `roundRobin`) |
| U-POOL-08 | `assignSeeded` 8 teams, seeds 1..8, 4 pools | A {1,8}, B {2,7}, C {3,6}, D {4,5}; `seed` null |
| U-POOL-09 | `assignSeeded` 12 teams (seeds 1..10, two unseeded "Zulu", "Alpha") | A {1,8,9}, B {2,7,10}, C {3,6,Alpha}, D {4,5,Zulu} (unseeded last, by name) |
| U-POOL-10 | `assignSlotsToPools` slots idx 0..7 (A1,B1,C1,D1,A2,B2,C2,D2), 2 pools, `snake` | pool 1 [0,3,4,7], pool 2 [1,2,5,6] |
| U-POOL-11 | `fixed_order` `[[0,5,2,7],[1,4,3,6]]` | Group 1 = A1, B2, C1, D2; Group 2 = B1, A2, D1, C2 |
| U-POOL-12 | `moveMember(asg, team T04, pC)` | T04 is last in pC; every other member keeps its pool and position |
| U-POOL-13 | `swapMembers(team T01 in pA pos 0, slot S5 in pB pos 2)` | positions exchanged; others untouched (team ↔ slot allowed) |
| U-POOL-14 | `replaceMember(T03, T17)` | T17 at T03's position; T03 removed; replacing with an already assigned member throws (proposed) |
| U-POOL-15 | `poolWarnings` [4,3,3] | `UNEVEN_POOLS` with message "Teams in different pools may play different numbers of matches." |
| U-POOL-16 | an empty pool / a one-member pool / a duplicate member / an unassigned entrant | `EMPTY_POOL` / `SINGLE_TEAM_POOL` / `TEAM_IN_MULTIPLE_POOLS` / `UNASSIGNED_TEAMS` with the members listed |
| U-POOL-17 | a direct-entry team in the tournament (entered into stage 2) | not reported as unassigned for stage 1 (`entrants` = `stageEntrants(snapshot, stage1)`) |
| U-POOL-18 | inputs frozen | no mutation |

## 16. Fixtures (`tournament/fixtures.ts`, §35–§37)

### 16.1 Round-robin properties

For every n ∈ {2, 3, …, 17, 128}, with legs 1 and 2:

| ID | Property |
|---|---|
| U-FIX-01 | rounds per leg = n − 1 (n even) or n (n odd) |
| U-FIX-02 | every unordered pair meets exactly once per leg (n(n−1)/2 pairings per leg; 8128 for n = 128) |
| U-FIX-03 | no entrant appears twice in a round; odd n: exactly one `bye` per round and each entrant sits out exactly once per leg |
| U-FIX-04 | leg 2 mirrors leg 1: the same pairings in the same round order, sides swapped; round numbers continue (leg-2 round 1 = n−1+1 for even n) |
| U-FIX-05 | side-A balance per leg: each entrant is side A ⌊(n−1)/2⌋ or ⌈(n−1)/2⌉ times |
| U-FIX-06 | input order respected: entrant 0 appears in every round (the fixed point of the circle method) for even n |
| U-FIX-07 | `legs: 3` (custom encounters): each pair meets 3 times, alternating sides |
| U-FIX-08 | slot entrants (FixtureSide slot) work identically |
| U-FIX-09 | n = 1 or legs = 0 | throws |

### 16.2 Drafts, validation and scheduling

| ID | Case | Expected |
|---|---|---|
| U-FIX-10 | `draftsFromRoundRobin(rr(4 teams), {startMatchNumber: 13, …}, ids)` | 6 drafts numbered 13..18 in round order; status `scheduled`; `bracket` null; `isFinal` false; `round`/`leg` set; ids from the generator in call order |
| U-FIX-11 | `manualFixture` | `round` null, `leg` null, `label` kept |
| U-FIX-12 | `validateFixtureDrafts`: side A = side B | error `SAME_SIDE_TWICE` |
| U-FIX-13 | a side not in its pool / not in the tournament | error `SIDE_NOT_IN_POOL` / `SIDE_NOT_IN_TOURNAMENT` |
| U-FIX-14 | the same pair twice in a single-RR pool | warning `DUPLICATE_ENCOUNTER` |
| U-FIX-15 | a 3-team pool with `legsByPool` 2 beside single-RR pools; each 3-team pair twice | **no** `DUPLICATE_ENCOUNTER` |
| U-FIX-16 | the same side at the same date and time twice | warning `TEAM_DOUBLE_BOOKED` |
| U-FIX-17 | a date outside `startDate..endDate` | warning `OUTSIDE_TOURNAMENT_DATES` |
| U-FIX-18 | `scheduleSequential(6 drafts of a 4-team RR, {startDate:'2026-05-01', matchesPerDay:2, times:['09:00','13:00'], restDates:['2026-05-02']})` | 3 match days (05-01, 05-03, 05-04); 2 matches per day at 09:00 and 13:00; no side twice on one day; 05-02 skipped |
| U-FIX-19 | `fixturesForPoolMove`: Pool A {LIO, TIG, EAG, HAW}, HAW v EAG played, HAW v LIO and HAW v TIG unplayed; move HAW to Pool C {X, Y}, legs 1, startMatchNumber 40 | `removeFixtureIds` = [HAW v LIO, HAW v TIG]; `addFixtures` = [HAW v X #40, HAW v Y #41]; the played fixture is untouched. The pairs, legs and match numbers are normative; the side order is not, because sides alternate per pairing and per leg (CONTRACT_REFERENCE `fixturesForPoolMove`) |
| U-FIX-20 | the same with legs 2 | 4 drafts, sides alternating per leg |

### 16.3 Knockout bracket (`knockoutBracket`, `roundName`)

| ID | Entrants (seed order) | Expected |
|---|---|---|
| U-KOB-01 | 2 | 1 fixture: final (`isFinal`, round 1, position 0, `roundName` Final); no progression slots |
| U-KOB-02 | 4 (8-team-t20 entry slots A1, B1, A2, B2) | round 1: SF1 (pos 0) A1 v B2, SF2 (pos 1) B1 v A2 (`roundName` Semifinal); round 2: Final with sides slot "Winner SF1" v slot "Winner SF2"; progression slots idx 4, 5 (`firstSlotIndex` 4), role `progression`, sources `bracket_winner {stage, round 1, position 0/1}`; `entrySlotSeeds` A1 1, B1 2, A2 3, B2 4 |
| U-KOB-03 | 4 with `thirdPlacePlayoff` | + a fixture `kind: third_place`, round 2, position 0, sides `bracket_loser` of SF1/SF2; its `roundName` is "Third place" |
| U-KOB-04 | 8 | QF pairs by `standardBracketOrder(8)` [1,8,4,5,2,7,3,6]: QF1 1v8, QF2 4v5, QF3 2v7, QF4 3v6; SF1 = W(QF1) v W(QF2); SF2 = W(QF3) v W(QF4) |
| U-KOB-05 | 6 | P = 8; byes to seeds 1 and 2; round 1 has 2 fixtures (4v5, 3v6); seeds 1 and 2 are sides in round 2; `byes` = [seed1, seed2] (see the report on bye position numbering) |
| U-KOB-06 | 5 | byes to seeds 1–3; 1 round-1 fixture (4v5) |
| U-KOB-07 | every n in 2..33 | P = next power of 2; byes = P − n given to the top seeds; seeds 1 and 2 can only meet in the final; exactly one `isFinal` |
| U-KOB-08 | 8 with `rounds: 1` | only the 4 QFs; no final; no progression slots |
| U-KOB-09 | a re-draw with new fixture ids | progression slot sources are unchanged (they name bracket positions, never fixture ids) |
| U-KOB-10 | `roundName(2,·)` · `(4,·)` · `(8,·)` · `(16,·)` · `(32,·)` · `(64,1)` | Final · Semifinal · Quarterfinal · Round of 16 · Round of 32 · Round 1 |

## 17. Knockout seeding and advancement (`tournament/knockout.ts`, §46)

| ID | Call | Expected |
|---|---|---|
| U-KO-01 | `standardBracketOrder` 2 / 4 / 8 | [1,2] / [1,4,2,3] / [1,8,4,5,2,7,3,6] |
| U-KO-02 | `bracketShape(8,null)` · `(8,1)` · `(6,null)` · `(16,2)` | {8,3,3,1} · {8,3,1,4} · {8,3,3,1} · {16,4,2,4} |
| U-KO-03 | `seedEntrants` `fixed`, 2 pools × 2 | seed order A1, B1, A2, B2 → the bracket gives A1 v B2 and B1 v A2 |
| U-KO-04 | `fixed`, 4 pools × 2 | QFs in bracket order A1 v B2, C1 v D2, B1 v A2, D1 v C2 (one consistent seed order: A1, B1, D1, C1, D2, C2, A2, B2); A1 and A2 in opposite halves |
| U-KO-05 | `fixed` with a best-of and a direct-entry entrant | seeded after all pool-positioned entrants, by slot index |
| U-KO-06 | `random` with seed 847291 twice / seed null | deep-equal / throws (seed required) |
| U-KO-07 | `ranking` ranks [3,1,4,2] | order by rank ascending |
| U-KO-08 | `knockoutGenerationGuard('ranking', [final, provisional])` | `{ok:false, reason: "Seeding by ranking is possible once all … qualifiers are known."}` |
| U-KO-09 | `knockoutGenerationGuard('fixed' or 'random', unresolved)` | `{ok:true}` |

`knockoutAdvancer(fixture, {a: LIO, b: TIG}, summary, config, seedOf)`, with `seedOf` LIO → 1, TIG → 4 unless stated:

| ID | Summary result | Config | Expected {winner, loser, basis} |
|---|---|---|---|
| U-KO-10 | win LIO | default | LIO, TIG, `result` |
| U-KO-11 | walkover TIG | default | TIG, LIO, `walkover` |
| U-KO-12 | awarded TIG | default | TIG, LIO, `awarded` |
| U-KO-13 | tie, decider super_over TIG | default | TIG, LIO, `tie_decider` |
| U-KO-14 | tie, decider boundary_count LIO | default | LIO, TIG, `tie_decider` |
| U-KO-15 | tie undecided | `tiedMatch: 'higher_seed'` | LIO, TIG, `higher_seed` |
| U-KO-16 | tie undecided | `super_over` (still undecided) | null, null, `organizer_required` |
| U-KO-17 | tie undecided | `organizer` | null, null, `organizer_required` |
| U-KO-18 | no_result | `noResult: 'higher_seed'` | LIO, TIG, `higher_seed` |
| U-KO-19 | no_result, `seedOf` → null for both | `higher_seed` | null, null, `organizer_required` |
| U-KO-20 | abandoned | `shared` | null, null, `shared` |
| U-KO-21 | no_result | `replay` / `organizer` | null, null, `organizer_required` |
| U-KO-22 | summary null | any | null, null, `not_played` |
| U-KO-23 | custom stage (config absent → caller passes `DEFAULT_KNOCKOUT_CONFIG`) | tie undecided | `organizer_required` (the default `tiedMatch` is super_over) |
| U-KO-24 | the fixture has `matchSides {TIG, LIO}` (frozen, reversed) | win TIG | TIG advances (frozen sides are used, never the slot resolution) |

## 18. Slots (`tournament/slots.ts`, §44, §45)

| ID | Rules on the target stage | Expected entry slots (index: label ← source) |
|---|---|---|
| U-SLOT-01 | `top_per_pool {count 2, fromPosition 1}` over pools A, B | 0: A1, 1: B1, 2: A2, 3: B2 — `pool_position`, role `entry`, seed null |
| U-SLOT-02 | `top_per_pool {count 2, fromPosition 3}` | 0: A3, 1: B3, 2: A4, 3: B4 |
| U-SLOT-03 | `pool_position {pool C, 1}` | 0: C1 |
| U-SLOT-04 | `top_per_pool 1` + `best_of_position {position 2, count 1, per_match_average}` over 3 pools | 0: A1, 1: B1, 2: C1, 3: "Best runner-up" (`best_of_position rank 1`) |
| U-SLOT-05 | `best_of_position {position 3, count 2}` | "Best 3rd", "Best 3rd #2" (labels short and human) |
| U-SLOT-06 | `top_overall {count 8}` | "1st overall" … "8th overall" (`overall_position` rank 1..8) |
| U-SLOT-07 | `knockout_winners` from a QF stage of 8 entrants with `rounds 1` (brackets map: lastRound 1, positions 4) | 4 slots `bracket_winner {round 1, position 0..3}`, labels "Winner QF1".."Winner QF4"; no fixture needs to exist |
| U-SLOT-08 | `manual {count 2, label 'Wildcard'}` | 2 slots `manual {teamId null}` |
| U-SLOT-09 | `top_per_pool 2` + `direct_entry {teamIds [LIO]}` | 0..3 as U-SLOT-01, 4: `manual {LIO}` |
| U-SLOT-10 | re-expansion with `existing` after pools go from 2 to 3 | ids of indexes 0..3 kept; new ids for 4, 5; nothing removed |
| U-SLOT-11 | re-expansion shrinking 6 → 4 | ids 0..3 kept; `removed` = the old 4, 5 |
| U-SLOT-12 | `explainEntryRules` | "Top 2 from each pool" · "Pool winners + best 4 runners-up" · "Top 8 overall" · "Organizer selects 4" · "3rd and 4th of each pool" · "2 direct entries" |
| U-SLOT-13 | `defaultSlotLabel` | A1, B2, "Best runner-up", "Winner SF1", "Loser SF2", "Winner QF3", "TBD" (manual null) |

## 19. Templates (`tournament/templates.ts`, §56)

| ID | Case | Expected |
|---|---|---|
| U-TPL-01 | `builtinTemplates()` | 5 templates with ids `builtin:8-team-t20`, `builtin:4-team-league`, `builtin:8-team-knockout`, `builtin:16-team-groups`, `builtin:20-team-pools`; each has exactly one `decidesChampion` stage; the same content on every call; frozen |
| U-TPL-02 | instantiate `8-team-t20` | stages [a group stage (2 pools × 4, single RR), "Knockouts" (knockout, `decidesChampion`, seeding fixed)]; entry slots 0–3 A1, B1, A2, B2 (progression slots 4–5 come from `knockoutBracket` at generation, U-KOB-02 — see the report) |
| U-TPL-03 | instantiate each built-in with its team count | `templateFitsTeamCount` ok; stage and pool counts as documented |
| U-TPL-04 | `templateFitsTeamCount(8-team-t20, 10)` | `{ok:false, message:'Designed for 8 teams; you have 10.'}` |
| U-TPL-05 | `templateFromSnapshot` of a Super 8 tournament (pools built from slots) | `poolSlotIndexes` set; knockout progression → `knockout_winners`; direct entries → `direct_entry {count}`; instantiating it again gives the same structure (ids aside) |

## 20. State machines and edit policies (`tournament/stateMachine.ts`)

Each allowed and each forbidden transition in [STATE_MACHINES.md](../architecture/STATE_MACHINES.md) is one table row (`it.each`). Representative rows:

| ID | Call | Expected |
|---|---|---|
| U-SM-01 | `canTransitionMatch('scheduled','live',{hasDeliveries:false})` | ok |
| U-SM-02 | `('paused','completed')` | ok (natural result while paused) |
| U-SM-03 | `('scheduled','completed',{hasDeliveries:true})` | not ok (walkover only before play) |
| U-SM-04 | `('completed','live')` / `('abandoned','live')` | ok (reopen) |
| U-SM-05 | `('cancelled','live')` | not ok |
| U-SM-06 | `canTransitionFixture('abandoned','rescheduled',{hasMatch:true, replayAllowed:false})` | not ok; with `replayAllowed:true` ok |
| U-SM-07 | `('live','scheduled')` | not ok |
| U-SM-08 | `('cancelled','scheduled')` | ok |
| U-SM-09 | `canTransitionTournament('registration','structure_configured',{activeTeamCount:1, stageCount:1,…})` | not ok (needs ≥ 2 teams) |
| U-SM-10 | `('fixtures_generated','pools_configured',{matchesStarted:1})` | not ok |
| U-SM-11 | `('active','completed',{championDecided:false, allStagesComplete:false})` | not ok |
| U-SM-12 | `('completed','archived')` and back | ok both ways |
| U-SM-13 | `canTransitionStage('completed','active')` | ok (correction) |
| U-SM-14 | `tournamentEditPolicy` | each cell of the §3 matrix (6 situations × 11 columns) plus `seeds` (= the Rules column) and `deleteTournament` (allowed with no started match · confirm with started matches · forbidden archived) |
| U-SM-15 | `matchEditPolicy` | each cell of the §1 match table, incl. `history`: live → warn, completed → confirm; `delete` tournament live → forbidden |

## 21. NRR (`tournament/nrr.ts`, §41)

Unless stated: `DEFAULT_NRR_CONFIG` (`icc`, exclude NR/abandoned/walkover/awarded, `icc_par`), 6-ball overs, 20 overs = 120 balls.

| ID | Match(es) | Expected |
|---|---|---|
| U-NRR-01 | Lions 180/6 (120 b) v Tigers 150 all out in 18.2 (110 b) | Lions for 180/120, against 150/**120**; NRR Lions **+1.500**, Tigers −1.500 |
| U-NRR-02 | the same, `mode: 'actual_overs'` | Tigers balls 110; Lions **+0.818182**, Tigers −0.818182 |
| U-NRR-03 | Tigers 140/8 (120 b) v Lions 141/3 in 16.4 (100 b) | chase won early → actual 100 balls; Lions **+1.460000** |
| U-NRR-04 | aggregate U-NRR-01 + U-NRR-03 for Lions | runs for 321 / overs 36.6667, against 290 / 40 → **+1.504545** (not the mean of the two match NRRs, 1.48); `formatNrr` `+1.505` |
| U-NRR-05 | Lions 160/5 (20) v Tigers chase revised to 12 overs (72 b), target 100, Tigers 95/4 (72 b) — `icc_par` | Lions credited 99/72; Lions **+0.333333**, Tigers −0.333333 |
| U-NRR-06 | the same, `revisedTarget: 'actual'` | Lions 160/120 v 95/72 → **+0.083333** |
| U-NRR-07 | U-NRR-05 but Tigers 80 all out in 10.3 (63 b) | Tigers balls = allotted **72** → Tigers **−1.583333** |
| U-NRR-08 | terminated par chase: Tigers 170/7 (120 b); Lions 131/2 at 14.2, terminal `maxBalls 86`, target 111 | Tigers credited par 110 off 86; Lions **+1.465116** (126 ÷ 86); Tigers −1.465116 |
| U-NRR-09 | no result: Lions 60/1 in 8.0, `includeNoResult:false` | `matchNrrContributions` → null |
| U-NRR-10 | the same with `includeNoResult: true` | only the innings with ≥ 1 legal ball counts: Lions for 60/48 b; Tigers against 60/48; Lions' match NRR is null from this match alone (`computeNrr` with 0 overs against → null) |
| U-NRR-11 | abandoned with `includeAbandoned` false / true | excluded / as U-NRR-10 |
| U-NRR-12 | walkover, policy `exclude` | null |
| U-NRR-13 | walkover, `notional {winnerRuns 120, winnerBalls 120, loserRuns 100, loserBalls 120}` | winner **+1.000**, loser −1.000 |
| U-NRR-14 | awarded, `exclude` / `use_played_innings` (innings 0 complete 150/120 b, innings 1 30/2 at 5.0 unfinished) | null / only the completed innings counts |
| U-NRR-15 | tied match with a super over (Lions 15/1, Tigers 10/2 in the SO) | 150/120 v 150/120 → both **0.000**; the super over is ignored |
| U-NRR-16 | mixed balls per over: 8-ball match Lions 100/80 b v 90/80 b + 6-ball match Lions 120/120 b v 100/120 b | for 220 / 30 overs, against 190 / 30 overs → **+1.000** |
| U-NRR-17 | `expungedTeamIds` contains Tigers | Lions v Tigers excluded for both |
| U-NRR-18 | `computeNrr(0, 0, 50, 5)` | null |
| U-NRR-19 | `compareNrr(1.0, 1.0 + 1e-10)` / `(null, -5)` / `(0.5, 0.2)` | 0 / > 0 (null last) / < 0 |
| U-NRR-20 | `aggregateNrr(…, {restrictToTeams:true})` for [LIO, TIG] | only Lions v Tigers matches counted |

## 22. Points and standings (`tournament/standings.ts`, §40, §42, §50)

### 22.1 Points per result type

`DEFAULT_POINTS_SYSTEM` is 2/1/1/0, abandoned null, walkovers null, `superOverDecidedTie: 'win_loss'`.

| ID | Result (A v B) | Points | A / B columns |
|---|---|---|---|
| U-PTS-01 | win A | A 2, B 0 | A W, B L; played 1 each |
| U-PTS-02 | tie (decider null) | 1, 1 | T, T |
| U-PTS-03 | tie decided by super over for B (`win_loss`) | 0, 2 | L, W |
| U-PTS-04 | the same with `superOverDecidedTie: 'tie'` | 1, 1 | T, T |
| U-PTS-05 | no_result | 1, 1 | NR, NR |
| U-PTS-06 | abandoned, `abandoned: null` / `abandoned: 0` | 1, 1 / 0, 0 | NR |
| U-PTS-07 | walkover A, defaults / `walkoverWin 2, walkoverLoss -1` | 2, 0 / 2, −1 | W, L |
| U-PTS-08 | awarded B | 0, 2 | L, W |
| U-PTS-09 | awarded without winner | 1, 1 | NR |
| U-PTS-10 | cancelled fixture (no match) | nothing; played 0; `matchesRemaining` excludes it | |
| U-PTS-11 | points 3/1/1/0 | a win gives 3 | |
| U-PTS-12 | bonus `{run_rate_ratio 1.25, 1}`: A 180/120 b beats B 140/120 b (RR 9.0 v 7.0) | A **3** (`bonusPoints` 1) | |
| U-PTS-13 | the same with A 160/120 b (8.0 v 7.0, ratio 1.143) | A 2 | |
| U-PTS-14 | `points_adjustment −2` (active) / revoked | points −2, `pointsAdjustment` −2 / back to normal | |
| U-PTS-15 | `expunge_results` for team X | every X result removed from all rows | |

### 22.2 Fixture POOL-A (hand-built summaries, 2-over, 6-a-side; the same data as IT-T)

| # | Batting first | Chasing | Result |
|---|---|---|---|
| 1 | Lions 30/2 (12 b) | Tigers 20/4 (12 b) | Lions by 10 runs |
| 2 | Eagles 18/3 (12) | Hawks 16/4 (12) | Eagles by 2 runs |
| 3 | Lions 26/1 (12) | Eagles 22/4 (12) | Lions by 4 runs |
| 4 | Tigers 24/3 (12) | Hawks 12 all out (5 wkts) in 1.3 (9 b) | Tigers by 12 runs |
| 5 | Hawks 20/4 (12) | Lions 21/1 in 1.4 (10 b) | Lions by 4 wickets (2 balls left) |
| 6 | Tigers 25/2 (12) | Eagles 19/4 (12) | Tigers by 6 runs |

**U-STD-01.** `computeStandings` for POOL-A with ICC NRR:

| Pos | Team | P | W | L | T | NR | Pts | Runs / balls faced | Runs / balls bowled | NRR | Form |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Lions | 3 | 3 | 0 | 0 | 0 | 6 | 77 / 34 | 62 / 36 | +3.254902 | W W W |
| 2 | Tigers | 3 | 2 | 1 | 0 | 0 | 4 | 69 / 36 | 61 / 36 | +1.333333 | L W W |
| 3 | Eagles | 3 | 1 | 2 | 0 | 0 | 2 | 59 / 36 | 67 / 36 | −1.333333 | W L L |
| 4 | Hawks | 3 | 0 | 3 | 0 | 0 | 0 | 48 / **36** (all out in match 4 counts 12 b) | 63 / 34 | −3.117647 | L L L |

Further POOL-A cases:
- **U-STD-02.** `runRate` Lions 13.588235; `oversFaced` 5.666667; `matchesRemaining` 0; `complete` true; `tieBreak` null on each row (points alone separate them).
- **U-STD-03.** POOL-A with `mode: 'actual_overs'`: Tigers NRR +0.409091 and Hawks −2.390374 (Hawks faced 33 balls). Order unchanged.

### 22.3 Fixture POOL-B (three-way tie on points)

| # | Batting first | Chasing | Result |
|---|---|---|---|
| 7 | Bulls 28/3 (12) | Bears 22/4 (12) | Bulls by 6 runs |
| 8 | Cobras 20/2 (12) | Wolves 14/4 (12) | Cobras by 6 runs |
| 9 | Bulls 24/2 (12) | Cobras 25/1 in 1.5 (11 b) | Cobras by 4 wickets (1 ball left) |
| 10 | Bears 26/2 (12) | Wolves 18 all out in 1.4 (10 b) | Bears by 8 runs |
| 11 | Wolves 15/3 (12) | Bulls 16/0 in 1.2 (8 b) | Bulls by 5 wickets (4 balls left) |
| 12 | Bears 21/4 (12) | Cobras 20/3 (12) | Bears by 1 run |

**U-STD-04.** With `DEFAULT_TIE_BREAKERS` (Points → NRR → Head-to-Head → Most wins → Organizer decision):

| Pos | Team | Pts | NRR | TieBreakNote |
|---|---|---|---|---|
| 1 | Bulls | 4 | +2.121429 | separatedBy `nrr`, "Ahead of Cobras on net run rate (+2.121 vs +1.310)" |
| 2 | Cobras | 4 | +1.309524 | separatedBy `nrr` |
| 3 | Bears | 4 | +0.500000 | null |
| 4 | Wolves | 0 | −3.791667 | null |

### 22.4 Other standings cases

| ID | Case | Expected |
|---|---|---|
| U-STD-05 | POOL-B with chain `[points, head_to_head, nrr]` | the H2H mini-league is a cycle (Bulls beat Bears, Cobras beat Bulls, Bears beat Cobras) → all 2 H2H points → NRR decides → the same order; Bulls' note separatedBy `nrr` |
| U-STD-06 | slot members: a Super 8 group with members slots A1, B2, C1, D2 before any group result | 4 rows, `teamId` null, `slotLabel` A1…, ranked after resolved rows by label; with A1 provisionally Lions: row `provisional` true |
| U-STD-07 | `team_replace keep_for_opponents` (X replaced by Y after 1 played match) | X row `membership 'replaced'` keeps its result; Y starts at 0; X never occupies a qualification slot |
| U-STD-08 | `transfer_to_replacement` | Y row aggregates X's played results (`inheritsFrom` [X]) |
| U-STD-09 | `expunge` | X's results disappear from every row; opponents lose those points |
| U-STD-10 | uneven cross-pool table with `per_match_average` / `drop_extra_results` + `poolOrder` | see U-QUAL-04 |
| U-STD-11 | frozen sides | a fixture whose slot now resolves to Eagles but whose `matchSides` are Tigers v Lions counts for Tigers and Lions |
| U-STD-12 | `provisionalTies` | a level group appears in `provisionalTies`; `unresolvedTies` is always [] from `computeStandings` |
| U-STD-13 | `effectiveStageRules` | stage override points 3/1/1/0 win over tournament 2/1/1/0; null → tournament defaults |

## 23. Tie-breakers (`tournament/tiebreakers.ts`, §43)

`rankTeams(records, chain, ctx)`. The records give the level teams equal points unless stated.

| ID | Chain | Situation | Expected |
|---|---|---|---|
| U-TB-01 | [points, head_to_head, nrr] | two teams level; B beat A; A NRR higher | B 1st (separatedBy `head_to_head`), A 2nd |
| U-TB-02 | [points, nrr, head_to_head] | the same | A 1st (`nrr`) |
| U-TB-03 | [points, head_to_head, nrr] | **3-way cycle** (A beat B, B beat C, C beat A; each beat D); NRR A +0.8, B +0.5, C +0.2 | mini-league all level (2 pts each) → NRR: A, B, C; D 4th on points |
| U-TB-04 | [points, head_to_head, nrr] | **3-way, H2H separates all**: A beat B and C, B beat C; overall NRR C > B > A | A, B, C (H2H outranks NRR); notes `head_to_head` |
| U-TB-05 | [points, nrr, head_to_head] | **subgroup recompute**: same cycle as U-TB-03; NRR A +0.9, B +0.25, C +0.25 (equal) | A 1st (`nrr`); then H2H among **{B, C} only**: B beat C → B 2nd (`head_to_head`), C 3rd. A 3-team mini-league (all level) would wrongly leave B = C |
| U-TB-06 | [points, head_to_head, nrr] | **no restart**: cycle; NRR A +0.9, B +0.3, C +0.3 (equal) | A 1st; B and C stay level (chain exhausted) → shared position 2, `shared` true; display order = input order; H2H is not re-run for {B, C} |
| U-TB-07 | [points, head_to_head, nrr] + `headToHeadRequiresCompleteMiniLeague: true` | A beat B, C beat A, B v C not yet played | H2H skipped (incomplete) → NRR decides all three |
| U-TB-08 | the same with the flag false | | H2H: A 2, C 2, B 0 → B 3rd; A/C → NRR |
| U-TB-09 | [points, head_to_head_wins, …] vs [points, head_to_head, …] | A beat B; B v C NR; C v A NR (NR = 1 pt) | H2H points A 3, C 2, B 1 → A, C, B; H2H wins: A 1, B 0, C 0 → A, then B/C level |
| U-TB-10 | [points, head_to_head, head_to_head_nrr] | double RR, A and B beat each other once (A by 30 runs, B by 10 runs) | H2H level → H2H NRR A higher → A |
| U-TB-11 | [points, nrr, organizer_decision] | A, B fully level; no override | shared position; detail "Level with B — organizer decision required" |
| U-TB-12 | the same + `tie_resolution {orderedTeamIds [B, A], organizer_decision}` | | B, A; separatedBy `organizer_decision` |
| U-TB-13 | a resolution for {A, B, C} while only {A, B} is level | | not applied; A and B shared |
| U-TB-14 | `draw_lots` resolution with seed 847291 | | applied as ordered; the seed is carried for display |
| U-TB-15 | [points, seed] | seeds A 3, B 1, C null | B, A, C |
| U-TB-16 | [points, wins] / [points, fewer_losses] / [points, runs_scored] / [points, wickets_taken] | constructed records | each separates in the documented direction |
| U-TB-17 | NRR epsilon | 1.0 vs 1.0 + 1e-10 | level (next criterion used) |
| U-TB-18 | `describeTieBreakerChain(DEFAULT_TIE_BREAKERS)` | `Points → NRR → Head-to-Head → Most wins → Organizer decision` |
| U-TB-19 | `tieBreakerLabel` for each kind | the 12 labels in CONTRACT_REFERENCE (`Points`, `NRR`, `Head-to-Head`, `Head-to-Head wins`, `Head-to-Head NRR`, `Most wins`, `Fewest losses`, `Runs scored`, `Wickets taken`, `Seeding`, `Organizer decision`, `Draw of lots`) |
| U-TB-20 | ordering never uses names | records shuffled, names changed → the same order among separable teams |

## 24. Qualification, certainty and champion (`tournament/qualification.ts`, `evaluate.ts`, §44–§51)

| ID | Situation | Expected |
|---|---|---|
| U-QUAL-01 | POOL-A + POOL-B complete; Knockouts entry `top_per_pool 2` | slots A1 Lions, B1 Bulls, A2 Tigers, B2 Cobras, all `final`; Lions `qualified`/`mathematical`, explanation "Lions have mathematically qualified for the Knockouts as Pool A winners (Top 2 from each pool; Points → NRR → Head-to-Head → Most wins → Organizer decision)."; Eagles and Hawks `eliminated` |
| U-QUAL-02 | the same, stage incomplete (POOL-A after matches 1–4 only) | slot A1 `provisional` Lions; no false `mathematical` |
| U-QUAL-03 | **uneven pools and best runner-up** — 10 teams: Pool A {RAV, HAW, OWL, KIT} single RR; Pools B {BUL, BEA, BIS} and C {COB, VIP, PYT} with `legs 2`. A: RAV 3W; HAW beat OWL and KIT; OWL beat KIT. B: BUL 4W; BEA beat BIS twice. C: COB beat VIP, NR v VIP, beat PYT twice; VIP beat PYT twice. Rule: `top_per_pool 1` + `best_of_position {2, count 1}` | runners-up: HAW 4 pts / 3 played, BEA 4 / 4, VIP 5 / 4 |
| U-QUAL-04 | U-QUAL-03 with normalisation `raw` / `per_match_average` / `drop_extra_results` | best runner-up = **VIP** (5 pts) / **HAW** (1.333 v VIP 1.25 v BEA 1.0) / **HAW** (after dropping one result v the lowest-placed team: BEA 2 pts / 3, VIP 3 / 3, HAW 4 / 3); `comparisonTables` has key `position:2:<normalisation>`; explanation "HAW are the best runner-up: …" |
| U-QUAL-05 | pool winners + best 4 runners-up across 4 pools of uneven size | 8 slots; the runner-up ranking uses `comparisonTables` |
| U-QUAL-06 | `top_overall {8, raw}` over 16 teams | the overall table (`StageEvaluation.overall`) top 8 |
| U-QUAL-07 | Cup (`top_per_pool 2`) and Plate (`top_per_pool {fromPosition 3, count 2}`) fed by the same groups | Eagles `targets` = [{Cup, eliminated}, {Plate, qualified}]; top-level state `qualified`, `targetStageId` Plate; explanation "Eagles are out of the Cup but have qualified for the Plate semifinal as Pool A 3rd." |
| U-QUAL-08 | `direct_entry [LIO]` into the Knockouts | slot `manual {LIO}` final; Lions is not an entrant of the group stage (`stageEntrants`) |
| U-QUAL-09 | a `manual` slot unfilled / filled by `slot_assignment` | `pending` / final with `viaOverride` true |
| U-QUAL-10 | override `qualify {TIG, slot A2}` | Tigers in A2; `certainty 'manual'`; `override` attached; the displaced team moves down |
| U-QUAL-11 | override `eliminate {LIO}` | Lions occupies no automatic slot; the next team moves up |
| U-QUAL-12 | override `reassign` into another pool of a later stage | reflected in `slotIds` / pool |
| U-QUAL-13 | **one entry slot per team**: 8-team-t20 with Lions holding A1 | "Winner SF1" (progression) resolves to Lions after SF1 although Lions holds A1; entry slot B2 never takes Lions |
| U-QUAL-14 | **certainty**: pool {A, B, C, D}, top 2; played A beat B, A beat C, A beat D, B beat C, D beat C; left B v D | A `qualified` `mathematical`; C `eliminated` `mathematical`; B and D `in_contention` (a no-result leaves both on 3 → NRR) |
| U-QUAL-15 | U-QUAL-14 with B v D: B wins | table complete: A, B qualified; C, D eliminated; all `mathematical` |
| U-QUAL-16 | played A beat B, A beat C, B beat C, D beat C; left A v D, B v D | A `in_contention` (A, B, D could all finish on 4; ties are treated pessimistically); C `eliminated` |
| U-QUAL-17 | points-derived outcomes: top 1 qualifies; L done on 4 pts, X on 1 pt with one match left | default points → X `eliminated`; with `bonus {…, points 1}` → X `in_contention` (can reach 4); with `walkoverWin: 3` → `in_contention` |
| U-QUAL-18 | above `enumerationLimit` (10 undecided fixtures, default limit 8) | bounds reasoning; never a wrong `mathematical` (cross-checked against brute force on the same case with `enumerationLimit: 12`) |
| U-QUAL-19 | `unresolvedTies` | complete pool, B and C level on everything straddling the 2/3 boundary → `unresolvedTies` [[B, C]]; the same tie at positions 3/4 (no slot boundary) → `provisionalTies` |
| U-QUAL-20 | nothing played | no `unresolvedTies` anywhere |
| U-QUAL-21 | **frozen sides**: after SF2 (B1 Bulls v A2 Tigers) is played, POOL-A match 6 is corrected so Eagles win | A2 slot → Eagles; SF2 still Bulls v Tigers (`resolveFixtureTeams(...).frozen` true); "Winner SF2" and the champion unchanged; impact reports a slot change with `playedFixtureIds` [SF2] |
| U-CHMP-01 | 8-team-t20: Final won by Lions | `champion {teamIds:[LIO], basis 'final', fixtureId: final}` |
| U-CHMP-02 | Cup (decidesChampion) + Plate ordered last; Plate final won by Eagles | the champion is the Cup winner, never Eagles |
| U-CHMP-03 | final washed out with `noResult: 'shared'` | `{teamIds:[LIO, BUL], basis 'shared'}` |
| U-CHMP-04 | `champion` override naming two teams | `basis 'manual'` wins over the computed champion |
| U-CHMP-05 | league stage (`4-team-league`) complete | the top of the table, `league_table`; incomplete → null |
| U-CHMP-06 | custom stage with an organizer-marked `isFinal` | the winner of that fixture |
| U-EVAL-01 | `evaluateTournament` progress | 12 group + 3 KO fixtures, 12 terminal → `{done 12, total 15}`; `currentStageId` = Knockouts |
| U-EVAL-02 | `stageEntrants` | first stage = active teams minus direct entries; Knockouts = slots 0–3 |
| U-EVAL-03 | performance | 128 teams, 16 pools × 8, 448 group fixtures + a 32-team bracket (about 480 fixtures) → `evaluateTournament` median < 100 ms |
| U-EVAL-04 | the snapshot is deep-frozen | no mutation |

## 25. What-if (`tournament/whatif.ts`, §48)

| ID | Case | Expected |
|---|---|---|
| U-WIF-01 | POOL-A after matches 1–4; hypothetical match 6 `side_a_win` (Tigers) with no score | Tigers +2 pts; NRR unchanged for match 6; `narrative` includes "If Tigers beat Eagles, …"; `before` equals `evaluateTournament(snapshot)` |
| U-WIF-02 | with `score` | NRR moves by the given runs/balls |
| U-WIF-03 | `tie` + `tieWinner: 'side_b'` under `win_loss` | W/L for the side B team |
| U-WIF-04 | `abandoned`, `side_a_walkover`, `bonus: true` | points per `PointsSystem` |
| U-WIF-05 | a hypothetical on an already completed fixture | ignored and mentioned in `narrative` |
| U-WIF-06 | chained QF → SF (QF-only stage + SF stage) | the QF hypothetical resolves "Winner QF1"; an SF hypothetical then applies |
| U-WIF-07 | a hypothetical whose sides are unresolved at its stage | skipped and reported |
| U-WIF-08 | the snapshot is deep-frozen before `simulate` | no throw; the snapshot is unchanged |

## 26. Impact and change plans (`tournament/impact.ts`, §34, §99)

For every `ProposedChange` kind: `computeImpact(change, s, ctx)` equals the diff of `evaluateTournament(s)` and `evaluateTournament(applyPlan(s, planChange(s, change, ctx)))` (U-IMP-00, property over all kinds below).

| ID | Change | Expected plan / impact |
|---|---|---|
| U-IMP-01 | `pool_move` HAW → Pool C with lists from U-FIX-19 | plan: HAW's entry moved; fixtures.delete = the 2 unplayed; insert = the 2 new; the played fixture untouched; impact lists 4 fixtures (2 `removed`, 2 `created`) |
| U-IMP-02 | `pool_swap` HAW (A) ↔ WOL (B) with played fixtures on both sides | members exchanged; each takes over the other's unplayed fixtures; played fixtures keep their teams |
| U-IMP-03 | `team_replace` X → Y, `transfer_to_replacement` / `keep_for_opponents` / `expunge` | X membership `replaced`, `replacedByTeamId` Y; Y `inheritsFromTeamId` X / nothing / an `expunge_results` override; line "Tigers' 3 results transfer to Eagles." |
| U-IMP-04 | `team_withdraw {walkover}` with 2 remaining fixtures | `matchesToCreate` 2, each with events `[match_ended {walkover, opponent}]`; membership `withdrawn`; `applyPlan` shows them as summaries (walkover points) |
| U-IMP-05 | `team_withdraw {cancel, expungeResults true}` | the 2 fixtures `cancelled`; an `expunge_results` override |
| U-IMP-06 | `pools_replace {seed 847291}` | pool entries replaced; fixtures with matches kept; `seedingSeed` 847291 |
| U-IMP-07 | `team_seeds_change` | seeds updated; the order changes only where `seed` is in the chain |
| U-IMP-08 | `stage_upsert` of the group stage (3 pools instead of 2) | the Knockouts entry slots re-expanded with ids kept by index |
| U-IMP-09 | `fixtures_replace` (knockout re-draw) | new fixtures; progression slots still valid; `seed` stored |
| U-IMP-10 | `match_result_change` | `summaryChanges` only |
| U-IMP-11 | `rules_change` points 3/1/1/0 | `rules` set; impact lists standings changes |
| U-IMP-12 | `slot_change` of a slot with a played fixture | `SlotChange.playedFixtureIds` lists it |
| U-IMP-13 | `override_apply` / `override_revoke` | overrides insert / revoke rows |
| U-IMP-14 | `fixture_delete` of a completed fixture | `blocked {reason}`; severity `destructive` |
| U-IMP-15 | severities | a date change → `info`; a standings change → `warning`; detaching played data → `destructive`; nothing → `none` |
| U-IMP-16 | `requiresConfirmation` / `requiresReason` | true when completed data, standings, qualification or NRR are affected / for historical changes and overrides |
| U-IMP-17 | `headline` and `lines` | "This change affects 6 fixtures, 2 of them completed." · "Lions move from 2nd to 3rd in Pool A." · "Net run rate changes for 4 teams." |
| U-IMP-18 | `applyChange(s, c, ctx)` | deep-equals `applyPlan(s, planChange(s, c, ctx))` |

## 27. Tournament statistics (`tournament/stats.ts`, §52)

| ID | Case | Expected |
|---|---|---|
| U-TST-01 | an empty tournament | zeros and nulls; no sample data |
| U-TST-02 | G1 as a tournament match | totalRuns 55, totalWickets 2; highestTeamScore TIG 28; highestIndividualScore T1 17; bestBowling T8 1/5 (vs L11 1/8: fewest runs); highestPartnership TIG 19 (T1–T2, 9 balls) |
| U-TST-03 | player `matches` from `squads` | L9 (did not bat or bowl) has `matches` 1, `innings` 0 |
| U-TST-04 | averages | L2 13 runs, 1 dismissal → 13.0; L1 not out → `battingAverage` null |
| U-TST-05 | record ties | the earliest match number wins |
| U-TST-06 | super-over runs | excluded everywhere |

## 28. Backup id visitor (`export/backup/remap.ts`)

| ID | Case | Expected |
|---|---|---|
| U-BKP-01 | `collectIdReferences` of a knockout tournament backup | includes `data.matchEvents[i].fielderIds[0]`, `…absentees[k].playerId`, `…outcome.winnerTeamId`, stage `config.entryRules[*].sourceStageId/poolId/teamIds`, slot `source.*`, fixture and pool entry sides, override payload ids, `Tournament.venueIds`, `TournamentTeam.replacedByTeamId/inheritsFromTeamId`, `Team.captainId`; excludes audit `previousValue/newValue/impact` |
| U-BKP-02 | `remapBackupIds(data, idFor)` with an injective `idFor` | no original id left in any row key or reference (audit values excepted); `idFor` called once per distinct (entity, oldId) |
| U-BKP-03 | every remapped match | `validateLog` ok (zero error issues) |
| U-BKP-04 | round trip | `collectIdReferences(remap(d))` equals the references of `d` mapped through `idFor` |

---

## 29. §90 traceability

| §90 item | Cases |
|---|---|
| Scoring 0, 1, 2, 3, 4, 6 | U-CMD-01…07 |
| Wide / no ball / bye / leg bye | U-EXT-01…36 |
| Wicket | U-WKT-01…44, U-RO-01…10, U-L166-* |
| Batting / bowling stats | U-CARD-01…06, 14–18, U-STAT-03, 04, 08 |
| Partnerships | U-CARD-07, 08 |
| Run rate / required run rate | U-STAT-05…07, U-CRR-01…06 |
| Strike rotation | U-STR-01…15, U-RO-* |
| End of over | U-OVR-01…22 |
| Wickets (match logic) | U-WKT-*, U-INN-01…05, 11 |
| Innings completion | U-INN-01…19 |
| Match completion | U-RES-01…31, U-PEN-*, U-REV-*, U-PND-* |
| Points | U-PTS-01…15 |
| Standings | U-STD-01…13 |
| NRR (incl. all out, reduced overs) | U-NRR-01…20 |
| Tie-breakers (incl. 3-way H2H) | U-TB-01…20 |
| Qualification (incl. uneven pools, best runners-up) | U-QUAL-01…21, U-SLOT-* |
| Pool assignment (seed determinism) | U-RNG-*, U-POOL-01…18 |
| Fixture generation (round-robin properties) | U-FIX-01…20, U-KOB-* |
| Knockout advancement | U-KO-10…24, U-QUAL-13, 21, U-CHMP-* |
