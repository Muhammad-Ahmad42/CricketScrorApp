# Scoring Engine Design

Engineering design for the §60 "CricketRulesEngine": `src/domain/scoring/*` (owner WP-scoring-engine). It is the implementation plan for the contract in [CONTRACT_REFERENCE.md](../architecture/CONTRACT_REFERENCE.md) (`replay.ts`, `validate.ts`, `commands.ts`, `history.ts`, `result.ts`, `summary.ts`, `stats.ts`, `format.ts`, `presets.ts`) and the event-log decisions D1–D4, D6, D7, D16 in [ARCHITECTURE.md](../architecture/ARCHITECTURE.md). Where this document and the contract disagree, the contract wins and the difference is a bug in this document.

Contents: 1 module layout · 2 internal model · 3 replay algorithm · 4 event validation table · 5 delivery arithmetic · 6 strike rotation · 7 innings and match completion · 8 pending action derivation · 9 commands · 10 undo/redo · 11 historical edit · 12 performance · 13 worked examples · 14 test matrix.

---

## 1. Module layout

```
src/domain/scoring/
  replay.ts        replayMatch, applyEvent, initialMatchState, currentInnings, deriveMatchStatus
  validate.ts      validateEvent, validateLog, allowedDismissals, bowlerEligibility, eligibleIncomingBatters
  commands.ts      ScoringIntent, buildEvents, intent constructors
  history.ts       undo/redo groups, applyHistoryEdits, normalizeLog, logFingerprint
  result.ts        computeNaturalResult, resultWinner/Loser, formatResult, matchStatusLabel, suggestRevisedTarget
  summary.ts       buildMatchSummary, summariesAffectStandingsEqually, SCORING_PROJECTION_VERSION
  stats.ts         rate formulas, worm, manhattan, boundaryCounts, playerMatchStats
  format.ts        formatOvers, formatScore, ballToken, dismissalText, formatRequirement …
  presets.ts       built-in formats, rulesForOvers, validateRules
  internal/
    draft.ts       mutable ReplayDraft + freeze()
    steps.ts       one step function per event kind (shared by replay and applyEvent)
    context.ts     derived on-field context: positions, vacancies, current bowler, phase
    limits.ts      InningsLimits, maxWickets, bowler quota (uniform / icc_one_fifth)
    penalties.ts   phase + penalty placement rules
    pending.ts     derivePendingAction, retirementsDue
    stamps.ts      stamp comparison shared by validate (append) and replay (warning)
    canonical.ts   canonical JSON for logFingerprint
  testing/         matchSetup(), scriptedMatch() builders (tests of other packages may import)
```

Dependency direction inside the package: `format`, `stats`, `limits` are leaves; `validate` uses `context`, `limits`, `penalties`; `steps` uses `validate` only through `replay`; `result` uses `limits`; `pending` uses `result` and `validate#eligibleIncomingBatters/bowlerEligibility`; `history` uses `replay` and `validate`. Nothing in `scoring/` imports `tournament/`.

## 2. Internal model

### 2.1 Why a draft

`replayMatch` must be pure and produce deep-frozen-equivalent output, yet a 700-event replay must finish in < 50 ms. Building a fresh immutable `MatchState` after every event is O(n²) in copies. The engine therefore uses one **mutable internal draft** during replay and freezes it once:

```
ReplayDraft
  innings: InningsDraft[]
  lifecycle, suspension, naturalResult, result
  plannedRevisions, carriedPenalties
  lastSeq, lastAppliedSeq, issues
InningsDraft
  battingTeamId, bowlingTeamId, kind, superOverRound, index
  positions { striker: PlayerId | null, nonStriker: PlayerId | null, lone: boolean }
  bowlerId, previousOverBowlerIds, removedBowlerIds, replacedThisOver: Set
  batters: Map<PlayerId, BatterAcc>      insertion order = arrival order
  bowlers: Map<PlayerId, BowlerAcc>      insertion order = first-bowled order
  oversBowledBy: Map<PlayerId, Set<overIndex>>
  balls: BallRecord[]  overs: OverAcc[]  partnerships: PartnershipAcc[]  fow: FallOfWicket[]
  runs, wickets, legalBalls, extras, limits, target, completion, isFreeHitNext, revisions
```

`freeze(draft) → MatchState` converts maps to the ordered arrays the contract exposes (`batting`, `bowling`, `partnerships`, `overs`), computes `runRate`, `chase`, `currentRunRate`, `resultText`, `pendingAction`, `canRecordDelivery`, `retirementsDue`, and never leaks a mutable reference.

### 2.2 Incremental path and structural sharing

`applyEvent(setup, state, event)` must equal `replayMatch(setup, [...E, event])` (invariant 3). It works by **thawing only what the event can touch**:

* `thaw(state)` builds a draft whose completed innings, and whose unchanged rows, are the *same objects* as in `state` (they are frozen values, safe to share).
* The current innings is thawed into maps keyed by player id (O(players), ≤ 30 entries).
* `balls` is extended with one `BallRecord` (array spread, O(n) memcpy of references — ≈ 5 µs for 700 entries).
* `freeze` re-emits a batting/bowling row object only when its accumulator changed; untouched rows keep their previous object identity.

This **reference stability is a requirement**, not an optimisation detail: the live-scoring UI subscribes with selectors that compare references (see [COMPONENT_ARCHITECTURE.md §9](COMPONENT_ARCHITECTURE.md#9-re-render-strategy-88)). A test asserts that after a dot ball the previous innings object, the non-striker's `BattingCardRow`, and every completed `OverSummary` are `===` to their predecessors.

Both paths run the **same step functions** (`internal/steps.ts`); `replayMatch` is literally `events.reduce(stepInto, draft)` followed by one `freeze`, and `applyEvent` is `thaw → stepInto → freeze`. The property test "`applyEvent ∘ replayMatch = replayMatch`" over random valid matches guards that nothing hidden lives outside `MatchState` (the reason `plannedRevisions` and `carriedPenalties` are part of the state).

## 3. Replay algorithm

`replayMatch(setup, events)` — total, deterministic, never throws.

```
draft ← initialDraft(setup)                     lifecycle not_started, lastSeq 0, lastAppliedSeq 0
prevSeq ← 0
for e in events (array order):
  1. seq check        if e.seq ≠ prevSeq + 1 → issue(error, SEQ_OUT_OF_ORDER); prevSeq ← e.seq; draft.lastSeq ← e.seq; continue
  2. kind check       unknown kind → issue(error, UNKNOWN_EVENT_KIND); same bookkeeping; continue
  3. validate         r ← validateEvent(setup, view(draft), payloadOf(e), 'replay')
                      r.ok = false → issue(error, r.code, r.message); bookkeeping; continue
  4. stamps           delivery only: stamps.compare(draft, e) mismatch → issue(warning, CONTEXT_MISMATCH)
                      (the delivery is applied with the DERIVED striker/non-striker/bowler, never the stamp)
  5. apply            steps[e.kind](setup, draft, e)
  6. post-steps       delivery, penalty_awarded, overs_revised, innings_ended, match_ended,
                      innings_started: completion → natural result → retirementsDue (§7, §8)
  7. bookkeeping      prevSeq ← e.seq; draft.lastSeq ← e.seq; draft.lastAppliedSeq ← e.seq
state ← freeze(draft); state.needsRepair ← issues.some(severity = error)
```

Notes that matter for implementation:

* **Seq is compared with the previous event READ**, applied or skipped. A duplicated seq 57 inside `…, 56, 57, 57, 58, …` skips only the second 57; a garbage row `…, 5, 900, 6, 7…` produces two issues (900 and 6) and the tail from 7 replays. `lastSeq` is always the stored tail, which is what the next append must follow.
* `view(draft)` is a read-only façade implementing the `MatchState` fields `validateEvent` reads (positions, bowler, pending action, limits). Validation is written against `MatchState` so it can be unit-tested with frozen states; the façade avoids freezing per event.
* The stamp comparison lives in `internal/stamps.ts` because `ValidationResult` cannot carry a `CONTEXT_MISMATCH` warning (its warning type is `EventWarningCode`). In `append` mode `validateEvent` calls the same helper and fails with `CONTEXT_MISMATCH`; in `replay` mode it skips it and replay records the warning itself.
* The first `innings_started` flips lifecycle `not_started → live`; `play_suspended` → `paused`; `play_resumed` → `live`; `match_ended` → `completed` or `abandoned`.
* `deriveMatchStatus(state, stored)`: `lifecycle === 'not_started'` → `stored` (scheduled / postponed / cancelled); otherwise the lifecycle mapped 1:1 (`live`, `paused`, `completed`, `abandoned`).

`validateLog(setup, events)` = `replayMatch` + `ok = !needsRepair` (warnings stay in `state.issues`).

## 4. Event validation table

`validateEvent(setup, state, event, mode)` checks in this order and returns the **first** failure: (A) lifecycle → (B) pending-action compatibility → (C) players and squads → (D) stamps (`append` only) → (E) event facts. Warnings are collected only when every check passes.

### 4.1 (A) Lifecycle — every kind

| Condition | Code |
|---|---|
| a `match_ended` has been applied | `MATCH_ALREADY_ENDED` |
| no innings started yet and kind ∉ {`innings_started`, `overs_revised` (planned), `match_ended` abandoned / walkover / awarded} | `MATCH_NOT_STARTED` |
| paused and kind ∉ {`play_resumed`, `overs_revised`, `penalty_awarded`, `match_ended`} | `PLAY_SUSPENDED` |
| `play_resumed` while not paused | `NOT_SUSPENDED` |

### 4.2 (B) Pending-action compatibility

Rows = the state's `pendingAction`, columns = what is accepted. Anything else fails with the code in the last column.

| Pending action | Accepted kinds | Other kinds fail with |
|---|---|---|
| `null` (ready) | delivery, strike_swapped, batter_retired, batter_dismissed (run_out / obstructing_field), bowler_selected (mid-over `injury`/`suspended`; `over_start` only before the over's first delivery), penalty_awarded, overs_revised, play_suspended, innings_ended, match_ended (no_result / abandoned / awarded) | `PENDING_ACTION_REQUIRED` |
| `select_next_batter` | batter_in, batter_dismissed (`timed_out`), innings_ended, penalty_awarded, overs_revised, play_suspended, match_ended (no_result / abandoned / awarded) | delivery → `VACANCY_MUST_BE_FILLED`; bowler_selected, strike_swapped, batter_retired → `VACANCY_MUST_BE_FILLED` |
| `select_next_bowler` | bowler_selected (`over_start`), strike_swapped, batter_retired, batter_dismissed, innings_ended, penalty_awarded, overs_revised, play_suspended, match_ended (no_result / abandoned / awarded) | delivery → `BOWLER_NOT_SELECTED` |
| `start_next_innings` | innings_started, penalty_awarded, overs_revised (planned), play_suspended, match_ended (no_result / abandoned / awarded) | delivery and in-innings kinds → `INNINGS_NOT_IN_PROGRESS` |
| `resume_play` | (lifecycle rule 4.1 already limits the kinds) | — |
| `confirm_result` | match_ended (any outcome except walkover), penalty_awarded | delivery → `INNINGS_NOT_IN_PROGRESS`; others → `PENDING_ACTION_REQUIRED` |
| `resolve_tie` | super_over_started, match_ended (natural / tie_decided / no_result / awarded), penalty_awarded, play_suspended | `PENDING_ACTION_REQUIRED` |

The prompt priority (§8) decides what the UI asks first; the table above is deliberately a little wider than the prompt (a declaration at the fall of a wicket is legal while `select_next_batter` is pending) because real scorers do these things.

### 4.3 (C)–(E) Per event kind

"Batting squad" = non-substitute `MatchPlayer`s of the batting team; "fielding side" = all `MatchPlayer`s of the bowling team (substitutes included); "phase" = main match (innings 0–1) or one super-over round (innings 2k+2, 2k+3).

| Kind | Preconditions (in check order) | Error codes | Warnings |
|---|---|---|---|
| `innings_started` | previous innings complete; `inningsIndex` = number of innings so far; index ≥ 2 needs `super_over_started` for round ⌊(index−2)/2⌋+1; `battingTeamId` ∈ match teams; index 1: the other team; second innings of a super-over pair: the other team; index 0 with a toss: bats per toss (winner + decision); openers in the batting squad, distinct; bowler in the fielding side, not a substitute, not an opener; super-over round ≥ 2 with `restrictRepeatPlayers`: openers not dismissed in an earlier super over, bowler did not bowl in the previous super over | `INNINGS_STILL_IN_PROGRESS`, `WRONG_INNINGS_INDEX`, `SUPER_OVER_NOT_STARTED`, `TEAM_NOT_IN_MATCH`, `WRONG_BATTING_TEAM`, `TOSS_MISMATCH`, `PLAYER_NOT_IN_SQUAD`, `PLAYER_WRONG_SIDE`, `SAME_PLAYER_BOTH_ENDS`, `SUBSTITUTE_NOT_ALLOWED`, `PLAYER_INELIGIBLE_SUPER_OVER` | `SQUAD_EXHAUSTED` when the batting squad has fewer players than `playersInSide` |
| `delivery` | innings in progress; bowler selected; no vacancy; stamps equal derived context (`append`); `runsRun` integer 0..9; `shortRuns` 0..runsRun; `boundary` ∈ {0,4,6}; six only with `runsTo: 'bat'` on fair / no-ball; wicket: type ∈ `allowedDismissals(call, isFreeHitNext)`; striker-only types (bowled, caught, lbw, stumped, hit wicket, hit twice) need `playerOutId` = striker and `runsRun = 0 ∧ boundary = 0`; run out / obstructing / handled need `dismissalEnd` and `playerOutId` at the crease; other types forbid `dismissalEnd`; ≤ 2 fielders, all from the fielding side; Law 16.6 in a chase innings (regular or super over): pre-wicket runs (call penalty + scored running runs + boundary) must stay below `target − current runs` | `INNINGS_NOT_IN_PROGRESS`, `BOWLER_NOT_SELECTED`, `VACANCY_MUST_BE_FILLED`, `PLAYER_NOT_IN_SQUAD`, `CONTEXT_MISMATCH`, `INVALID_RUNS`, `INVALID_SHORT_RUNS`, `INVALID_BOUNDARY`, `SIX_NOT_OFF_BAT`, `DISMISSAL_NOT_ALLOWED_ON_CALL`, `DISMISSAL_NOT_ALLOWED_ON_FREE_HIT`, `RUNS_NOT_ALLOWED_WITH_DISMISSAL`, `DISMISSED_PLAYER_NOT_AT_CREASE`, `DISMISSAL_END_REQUIRED`, `DISMISSAL_END_NOT_ALLOWED`, `TOO_MANY_FIELDERS`, `FIELDER_NOT_IN_FIELDING_SIDE`, `WICKET_AFTER_RESULT` | `UNUSUAL_RUNS` (scored running runs ≥ 5 without a boundary), `FIELDER_UNKNOWN` (caught / stumped without fielder), `SQUAD_EXHAUSTED` (a wicket leaves no eligible incoming batter) |
| `batter_in` | innings in progress; a vacancy exists; `position` is that vacancy; player in the batting squad, not a substitute; not at the crease; not out / retired out / absent; `retired_not_out` only when no yet-to-bat batter remains and (under mandatory retirement) `mayReturn`; super-over round ≥ 2 restriction | `INNINGS_NOT_IN_PROGRESS`, `NO_VACANCY`, `POSITION_NOT_VACANT`, `PLAYER_NOT_IN_SQUAD`, `PLAYER_WRONG_SIDE`, `SUBSTITUTE_NOT_ALLOWED`, `BATTER_ALREADY_BATTING`, `BATTER_ALREADY_OUT`, `BATTER_NOT_ELIGIBLE`, `PLAYER_INELIGIBLE_SUPER_OVER` | — |
| `bowler_selected` | innings in progress; bowler in the fielding side, not a substitute; `over_start` only with 0 deliveries in the current over, `injury`/`suspended` only mid-over; mid-over: differs from the current bowler and was not already replaced this over; not the bowler of (part of) the previous over unless `allowBowlerConsecutiveOvers`; quota not reached (`limits.maxOversPerBowler` distinct overs; `icc_one_fifth` extra-over allowance); not removed from the attack; super-over round ≥ 2: did not bowl the previous super over | `INNINGS_NOT_IN_PROGRESS`, `PLAYER_NOT_IN_SQUAD`, `PLAYER_WRONG_SIDE`, `SUBSTITUTE_NOT_ALLOWED`, `BOWLER_CHANGE_REASON_INVALID`, `BOWLER_ALREADY_REPLACED`, `BOWLER_CONSECUTIVE_OVERS`, `BOWLER_QUOTA_REACHED`, `BOWLER_REMOVED_FROM_ATTACK`, `PLAYER_INELIGIBLE_SUPER_OVER` | `BOWLER_QUOTA_LAST_OVER` |
| `strike_swapped` | innings in progress; both positions filled and not a lone batter | `INNINGS_NOT_IN_PROGRESS`, `NOTHING_TO_SWAP` | — |
| `batter_retired` | innings in progress; no existing vacancy; player at the crease | `INNINGS_NOT_IN_PROGRESS`, `VACANCY_MUST_BE_FILLED`, `BATTER_NOT_AT_CREASE` | — |
| `batter_dismissed` | innings in progress; `timed_out`: a vacancy exists and the player is an eligible incoming batter; `run_out` / `obstructing_field`: no existing vacancy, player at the crease; fielders ≤ 2 from the fielding side | `INNINGS_NOT_IN_PROGRESS`, `NO_VACANCY`, `BATTER_NOT_ELIGIBLE`, `BATTER_ALREADY_BATTING`, `VACANCY_MUST_BE_FILLED`, `BATTER_NOT_AT_CREASE`, `TOO_MANY_FIELDERS`, `FIELDER_NOT_IN_FIELDING_SIDE` | — |
| `penalty_awarded` | match started; `teamId` ∈ match; runs integer 1..99; `inningsIndex` inside the current phase and one of: the innings `teamId` bats now; `teamId`'s most recent innings of the phase (even if just completed); `teamId`'s not-yet-started innings of the phase | `MATCH_NOT_STARTED`, `TEAM_NOT_IN_MATCH`, `INVALID_PENALTY`, `INVALID_PENALTY_INNINGS` | — |
| `overs_revised` | `inningsIndex` = the in-progress innings or a not-yet-started REGULAR innings; never a completed or super-over innings; `maxBalls` integer ≥ 1 and ≥ legal balls already bowled; `target` only for a chase innings, integer ≥ 1; `terminal` only for the chase in progress, with `maxBalls` = legal balls and a non-null `target`; `maxOversPerBowler` null or ≥ 1 | `WRONG_INNINGS_INDEX`, `INVALID_OVERS_REVISION`, `INVALID_TARGET` | `CHASE_OVERS_NOT_REVISED` (innings 0 reduced, no planned revision of innings 1), `TARGET_REVISION_WITHOUT_OVERS_CHANGE` (target set, `maxBalls` unchanged) |
| `play_suspended` | lifecycle `live` | `MATCH_NOT_STARTED`, `PLAY_SUSPENDED` | — |
| `play_resumed` | lifecycle `paused` | `NOT_SUSPENDED` | — |
| `innings_ended` | innings in progress; `declared`: `absentees` empty; `batters_unavailable`: every absentee is a batting-squad player who is yet to bat or retired hurt, no duplicates | `INNINGS_NOT_IN_PROGRESS`, `INVALID_ABSENTEE` | — |
| `super_over_started` | `rules.superOver.enabled`; natural result is an undecided tie; `round` = rounds played + 1; round ≥ 2 only with `ifTiedAgain: 'repeat'`; `maxRounds` null or round ≤ maxRounds | `SUPER_OVER_NOT_ALLOWED`, `RESULT_NOT_TIED`, `WRONG_INNINGS_INDEX`, `SUPER_OVER_LIMIT_REACHED` | — |
| `match_ended` | `natural`: `naturalResult ≠ null`; `tie_decided`: natural result is an undecided tie, winner ∈ match; `walkover`: no delivery recorded, winner ∈ match; `awarded`: winner null or ∈ match; `no_result`: match started | `NATURAL_RESULT_NOT_REACHED`, `RESULT_NOT_TIED`, `WALKOVER_AFTER_PLAY`, `TEAM_NOT_IN_MATCH`, `MATCH_NOT_STARTED` | — |

Replay-only codes: `SEQ_OUT_OF_ORDER`, `UNKNOWN_EVENT_KIND` (§3). Messages are organizer English built from names in `setup.players`, e.g. `BOWLER_CONSECUTIVE_OVERS` → "Hassan bowled the previous over and can't bowl two overs in a row.", `WICKET_AFTER_RESULT` → "The winning run was already scored on this ball, so this wicket doesn't count."

### 4.4 `allowedDismissals(call, isFreeHit)`

| Call | Allowed | On a free hit |
|---|---|---|
| fair | all nine | run out, hit twice, obstructing, handled |
| wide | stumped, hit wicket, run out, obstructing, handled | run out, obstructing, handled |
| no_ball | run out, hit twice, obstructing, handled | same |

The wicket sheet renders exactly this list — impossible options are hidden, not disabled.

## 5. Delivery arithmetic

With `r = runsRun − shortRuns` (scored running runs), `b = boundary`, `pW = rules.wide.penaltyRuns`, `pN = rules.noBall.penaltyRuns`:

| Call / runsTo | batterRuns | wides | noBalls | byes | legByes | totalRuns | bowlerRuns | legal | ball faced |
|---|---|---|---|---|---|---|---|---|---|
| fair / bat | r + b | 0 | 0 | 0 | 0 | r + b | r + b | yes | yes |
| fair / bye | 0 | 0 | 0 | r + b | 0 | r + b | 0 | yes | yes |
| fair / leg_bye | 0 | 0 | 0 | 0 | r + b | r + b | 0 | yes | yes |
| wide | 0 | pW + r + b | 0 | 0 | 0 | pW + r + b | pW + r + b | `wide.countsAsBall` | never |
| no_ball / bat | r + b | 0 | pN | 0 | 0 | pN + r + b | pN + r + b | `noBall.countsAsBall` | yes |
| no_ball / bye | 0 | 0 | pN | r + b | 0 | pN + r + b | pN | `noBall.countsAsBall` | yes |
| no_ball / leg_bye | 0 | 0 | pN | 0 | r + b | pN + r + b | pN | `noBall.countsAsBall` | yes |

* `isFour` / `isSix`: `runsTo = bat`, `b ∈ {4,6}`, `runsRun = 0`. An overthrow boundary (`runsRun 1, boundary 4`) is 5 runs to the batter but not a four.
* Bowler dot = legal delivery with `bowlerRuns = 0` (a leg-bye ball is a bowler dot); batter dot = ball faced with `batterRuns = 0`.
* Maiden: the over is complete, delivered entirely by one bowler (no mid-over replacement), and the sum of that over's `bowlerRuns` is 0.
* Numbering: `overIndex = ⌊legalBefore / bpo⌋`, `ballInOver = legalBefore mod bpo + 1`, `deliveryInOver` = count of the over's deliveries + 1, `label = "overIndex.ballInOver"`. A wide after two legal balls and the ball that follows it are both `x.3`.
* Free hit next: `call = no_ball ∧ rules.noBall.freeHit` → true; else if the current ball was a free hit and the call is wide or no-ball → stays true; else false.

## 6. Strike rotation

Positions are held as `striker`, `nonStriker` (player id or `null` = vacancy) plus a `lone` flag for a last-man-stands batter.

```
afterDelivery(d, inn):
  if not inn.lone and d.runsRun is odd:  swap(striker, nonStriker)                 crossings, short runs included
  if d.wicket:
    if d.wicket.type is striker-only:     striker ← null                          runsRun = 0 guaranteed, no swap happened
    else:
      outPos  ← d.wicket.dismissalEnd = striker_end ? 'striker' : 'non_striker'
      notOut  ← the batter at the crease who is not playerOutId
      set outPos ← null, otherPos ← notOut                                         overrides the parity swap
    if rules.lastManStands and inn.wickets = playersInSide(batting) − 1:
      striker ← the surviving batter; nonStriker ← null; lone ← true            no vacancy is raised
  if d is legal and inn.legalBalls mod bpo = 0:                                    over complete
    if not lone: swap(striker, nonStriker)                                        a vacancy swaps with it
    previousOverBowlerIds ← this over's bowlers; bowlerId ← null
```

Other events: `strike_swapped` swaps; `batter_retired`, off-ball `run_out`/`obstructing_field` set the player's position to `null`; `batter_in` fills the named vacancy; `timed_out` leaves the vacancy in place.

Consequences worth testing (A = striker, B = non-striker, mid-over unless stated):

| Delivery | Next striker |
|---|---|
| 1 run | B |
| 2 runs, 1 short (`runsRun 2, shortRuns 1`) — scores 1 | A (even crossings) |
| 3 runs, 1 short — scores 2 | B |
| 1 + 4 overthrows (`runsRun 1, boundary 4`) | B |
| four (`runsRun 0, boundary 4`) | A |
| wide + 1 run | B |
| caught, last ball of the over | vacancy moves to the non-striker's end by the over swap: B faces, new batter at the other end (Law 18.11) |
| caught mid-over | new batter faces |
| 1 run completed, B run out at the striker's end going for the 2nd | new batter faces, A at the non-striker's end |
| batters crossed but did not complete the run (`runsRun 0`), A run out at the non-striker's end | B faces (B is at the striker's end), vacancy at the non-striker's end |
| last-man-stands survivor alone, 1 run | survivor again (no rotation, no over-end swap) |

## 7. Innings and match completion

### 7.1 Limits (`internal/limits.ts`)

For the batting team with `N = setup.teams[i].playersInSide`:

* regular innings: `maxBalls = oversPerInnings × bpo` (then revisions), `maxWickets = N − 1`, or `N` with `lastManStands`;
* super over: `maxBalls = superOver.overs × bpo`, `maxWickets = min(superOver.maxWickets, regular threshold)`;
* bowler quota: `uniform` → `maxOversPerBowler`, `extraOverBowlers = 0`; `icc_one_fifth` with `O = ⌈maxBalls / bpo⌉` → `maxOversPerBowler = max(1, ⌊O/5⌋)`, `extraOverBowlers = O mod 5`; recomputed after every revision of the innings.

### 7.2 Completion (post-step, first match wins)

```
if inn.status = in_progress:
  if inn.target and inn.runs ≥ inn.target.runs         → complete(target_reached)
  elif inn.wickets ≥ inn.limits.maxWickets              → complete(all_out)
  elif inn.legalBalls ≥ inn.limits.maxBalls             → complete(overs_complete)
explicit: innings_ended → declared | batters_unavailable; match_ended mid-innings → match_ended;
          overs_revised { terminal } → terminated
on complete: close the unbroken partnership (endedBy innings_end), bowlerId ← null, freeHit ← false
```

`target_reached` and `all_out` can never fire on the same ball because §4 rejects a wicket whose pre-wicket runs reach the target (`WICKET_AFTER_RESULT`). `all_out` before `overs_complete` matters on the last ball (NRR full quota applies either way, but the card says "all out").

### 7.3 Targets

* innings 1: `first.runs + 1`, where `first.runs` already includes penalties to innings 0 (carried or post-hoc); an `overs_revised.target` replaces it (`revised: true`, `source: 'revision'`);
* super-over pair: the second innings' target = the first innings of the pair + 1 (`source: 'super_over'`);
* a penalty to the side batting first after the chase completed raises the target and re-runs §7.4 — the chase does not reopen.

### 7.4 Natural result (`result.ts#computeNaturalResult`)

Evaluated whenever a chase-bearing innings completes or its numbers change (delivery, penalty, revision):

```
main match (innings 0 and 1 complete, no super-over round in progress):
  T = innings1.target.runs, R = innings1.runs, par = T − 1
  if innings1.completion = terminated:
      R > par → win(chasing, runs: R − par, method par_score)
      R = par → tie(decider null)                                      text "Match tied (par score)"
      R < par → win(batting first, runs: par − R, method par_score)
  elif R ≥ T → win(chasing, wickets: innings1.limits.maxWickets − innings1.wickets,
                   ballsRemaining: innings1.limits.maxBalls − innings1.legalBalls,
                   method: target.revised ? revised_target : normal)
  elif R = par → tie(decider null)
  else → win(batting first, runs: par − R, method: revised ? revised_target : normal)
super-over round k (pair complete):
  higher runs → tie(decider { super_over, winner, superOverRounds: k })
  level and ifTiedAgain = boundary_count → compare boundaryCounts over main + super overs:
        different → tie(decider { boundary_count, winner, superOverRounds: k }); equal → undecided tie
  level otherwise → undecided tie (resolve_tie offers another round if allowed)
a super-over round in progress → naturalResult = null
```

`result` is set only by `match_ended`: `natural` copies `naturalResult`; `tie_decided` → `tie` with decider `{method, winner, superOverRounds}`; the other outcomes map 1:1 to `MatchResult` (walkover loser = the other team).

## 8. Pending action derivation (`internal/pending.ts`)

```
derivePendingAction(setup, s):
  if s.lifecycle ∈ {completed, abandoned}                → null
  nr ← s.naturalResult
  if nr and nr.type = tie and nr.decider = null           → resolve_tie { options, nextSuperOverRound }
  if nr                                                   → confirm_result { result: nr, text: formatResult(nr) }
  if s.suspension                                         → resume_play { reason }
  inn ← current innings
  if inn = null or inn.status = complete                  → start_next_innings { index, kind, round, suggestedBattingTeamId }
  if inn.striker = null or (inn.nonStriker = null and not inn.lone) → select_next_batter
  if inn.bowlerId = null                                  → select_next_bowler { overIndex, eligible, ineligible }
  → null
```

* `resolve_tie.options`: `super_over` when `superOver.enabled`, the next round is allowed by `maxRounds`, and (round ≥ 2) `ifTiedAgain = 'repeat'`; `accept_tie` and `decide_other` always. `nextSuperOverRound` = rounds played + 1 or null.
* `start_next_innings.suggestedBattingTeamId`: innings 0 from the toss (winner bats if `decision = bat`, else the other team; null without a toss); innings 1 the other team; first innings of a super-over round = the side that batted second in the previous pair (main match for round 1).
* `select_next_batter.candidates = eligibleIncomingBatters(setup, state)`; `canEndInnings` = candidates is empty **or** all remaining are retired-hurt batters (the UI offers "End innings (no batters available)" → `innings_ended { batters_unavailable, absentees }`).
* `select_next_bowler` = `bowlerEligibility(setup, state)`.
* `canRecordDelivery = lifecycle = live ∧ pendingAction = null ∧ current innings in progress ∧ ¬needsRepair`.
* `retirementsDue` (advisory): with `mandatoryRetirement` set and at least one yet-to-bat batter, list at-crease batters with `runs ≥ atRuns` who never returned from retirement; with `timing: 'end_of_over'` only when the over just completed (the list is empty mid-over).

## 9. Commands (`buildEvents`)

`buildEvents(setup, state, intent)` returns validated-shape payloads using the current context; it runs `validateEvent(…, 'append')` on each produced payload against the evolving state (via `applyEvent` on a scratch copy) so it can never produce an event the service will reject.

| Intent | Events | Defaults filled |
|---|---|---|
| `runs {runsRun, boundary, shortRuns}` | 1 delivery `fair/bat` | stamps from state, `shortRuns 0` |
| `wide`, `no_ball`, `bye`, `leg_bye` | 1 delivery | `boundary: true` → 4 |
| `wicket {…, nextBatterId}` | delivery (+ `batter_in` at the vacancy when `nextBatterId`) | `call fair`, `runsTo bat`, `runsRun 0`, `playerOutId` = striker, stumping fielder = designated keeper |
| `retire`, `off_ball_dismissal` with `nextBatterId` | event + `batter_in` | position = the new vacancy |
| `select_bowler` | `bowler_selected` | `reason: over_start` at an over start; mid-over requires a reason (`BOWLER_CHANGE_REASON_INVALID` otherwise) |
| `start_innings` | `innings_started` | batting team = pending suggestion |
| `revise_overs {scope: both_innings}` | two `overs_revised` (innings 0 now, innings 1 planned) | `terminal false`; `overs` × bpo → `maxBalls` |
| `penalty` | `penalty_awarded` | `inningsIndex` per the placement default (batting side: its current / just-completed innings; fielding side: its most recent innings of the phase, else its upcoming one) |
| `end_match` | `match_ended` | — |

All events of one intent share one `actionId` assigned by the service — they undo together.

## 10. Undo / redo

* **Group**: `lastActionGroup(events)` = the trailing run of events whose `actionId` equals the last event's. Invariant: an `actionId` is one contiguous run (live appends use one id per intent; history edits give every inserted op a fresh id), so the group and `truncateFrom(group[0].seq)` always delete the same rows.
* **Undo** (`MatchService.undo(matchId, expectedLastSeq)`): `undoLastAction(events)` → `{events', undone}`; in one transaction `truncateFrom(matchId, undone[0].seq, expectedLastSeq)` (refuses if the tail moved), `writeProjection(replay(events'))`; if `undone` contains `match_ended` of a tournament match: preview impact first (`CONFIRMATION_REQUIRED` without a reason), fixture mirror back to `live`, revision bump, champion projection, audit `match_reopened`. The store pushes `undone` onto the session redo stack.
* **Redo**: `redoAction(setup, events, group)` fails with `REDO_STALE` unless `group[0].seq = lastSeq(events) + 1`; then each event is validated in `append` mode (stamps included — they match because the state is identical to the one they were recorded on) and appended verbatim (same ids, seqs, `recordedAt`, `actionId`). A group with `match_ended` follows `endMatch` rules (reason, audit `result_recorded`).
* **Session scope**: `open`, `close`, any `dispatch`, a `CONFLICT` reload clear the stack; nothing is persisted.
* Undo of the opening `innings_started` returns the match to `not_started` (status overlay = the stored `scheduled`), and the screen shows the openers prompt again.

## 11. Historical edit and re-validation

### 11.1 Algorithm (`applyHistoryEdits(setup, events, ops, ctx)`)

```
1. apply ops in order against ORIGINAL seqs                    replace / insert_before / insert_after / delete
   inserted events: id ← ctx.ids(), recordedAt ← ctx.now, actionId ← ONE fresh ctx.ids() per op
2. re-anchor over-start selections                             each bowler_selected{over_start} that was at the start of
                                                               over k of innings i is moved to immediately before the first
                                                               delivery of over k in the edited log; an over with no
                                                               selection → fail BOWLER_NOT_SELECTED; surplus selections
                                                               beyond the innings' overs are dropped (reported in diff)
3. renumber seq 1..n                                           ids and actionIds of kept events preserved
4. re-stamp                                                    replay; rewrite every delivery's striker/non-striker/bowler
                                                               stamp to the derived context (restampedIds)
5. validate                                                    replay in append mode: first error → { ok:false, code, atSeq }
6. outcome                                                     before/after states, diff, affectedInnings, resultChanged
```

`affectedInnings` = innings whose totals, cards or completion differ; `resultChanged` compares `result ?? naturalResult` by type, winner, margin and method. `normalizeLog` = steps 2–4 alone and is idempotent (`normalizeLog(normalizeLog(x)) = normalizeLog(x)`, tested).

### 11.2 What re-stamping cannot fix

Stamps are derived, but **dismissal facts are not**: `wicket.playerOutId` of a later striker-only dismissal stays as recorded. When an edit changes run parity (1 → 2 runs), every later delivery of the innings flips striker; a later "B caught" may now have A on strike and fails with `DISMISSED_PLAYER_NOT_AT_CREASE` at that seq. This is the common real-world case where the scorer mis-tapped and then used **Swap Strike** live to keep the right batter facing. The edit screen therefore offers, whenever `restampedIds` is non-empty, a toggle **"Keep later deliveries with the batters as recorded"**, implemented as an extra op `insert_after(seq, [strike_swapped])`. The preview shows both variants' consequences ("11 later balls move from Ahmed to Ali" vs "no later balls change").

### 11.3 Service flow

1. `previewHistoryEdit(matchId, ops)` → outcome + `baseFingerprint = logFingerprint(events)` (FNV-1a 32-bit over canonical JSON, 8 hex chars) + tournament impact when the match is terminal and in a tournament (`buildMatchSummary(after)` → `computeImpact({match_result_change})`) + `requiresReason`.
2. The organizer confirms (reason for completed / tournament matches).
3. `applyHistoryEdit(matchId, ops, reason, baseFingerprint)`: in one transaction, `CONFLICT` unless the current fingerprint equals `baseFingerprint` (catches undo + new ball with the same `lastSeq`), recompute the outcome, `replaceAll`, projections, fixture mirror, revision bump, audit `match_history_edited` or `result_corrected` (`result_corrected` when `summariesAffectStandingsEqually(before, after)` is false) with removed + inserted events and the previewed impact.

A log that `needsRepair` is repaired through exactly this path: the edit is accepted only if the resulting log replays with zero error issues.

## 12. Performance

Engine design targets below are tighter than, and never replace, the product budgets in [REQUIREMENTS.md NFR-P](../product/REQUIREMENTS.md) (tap → screen ≤ 50 ms p95 NFR-P-01; engine per delivery ≤ 2 ms NFR-P-02; undo end to end ≤ 150 ms NFR-P-06; edit preview ≤ 300 ms NFR-P-07). CI assertions use a 3× margin over the documented budget and log the measured time ([UNIT_TEST_PLAN.md §0.1](../qa/UNIT_TEST_PLAN.md)).

| Path | Engine work | Design target (mid-range Android, Hermes) |
|---|---|---|
| Tap → committed ball | `buildEvents` + `validateEvent` + `applyEvent` (≈ 30 µs) + 1 INSERT + projection UPDATEs | < 16 ms commit; engine < 1 ms (product budget NFR-P-01) |
| Open / resume a 50-over match (~700 events) | full `replayMatch` | < 50 ms (NFR-P-04; the node test asserts < 150 ms and logs the time) |
| Undo | `undoLastAction` + full replay of the shortened log | engine < 50 ms (end to end NFR-P-06) |
| History edit preview | ops + normalise (1 replay) + validate (1 replay) + summary + optional impact | < 200 ms (NFR-P-07: ≤ 300 ms, ≤ 500 ms with impact) |
| Bootstrap rebuild of stale projections | 1 replay per stale match, one transaction each | yields to the event loop between matches |

Mechanisms:

1. **Incremental live path.** `MatchService` keeps a per-open-match cache `{setup, events, state}` keyed by `matchId`. `record(matchId, expectedLastSeq, payloads)` uses the cache when `cache.state.lastSeq = expectedLastSeq` and applies each payload with `applyEvent`; the DB guard (`UNIQUE(match_id, seq)` + the tail check) remains the source of truth. On any mismatch, rollback, or `CONFLICT`, the cache is dropped and rebuilt by a full replay.
2. **Full replay on structural changes.** Undo, redo after a reload, history edits, rules edits and imports always replay from event 1 — correctness over cleverness; the budget above makes this acceptable.
3. **Checkpoints (only if profiling requires).** If a low-end device misses the undo budget, the cache may keep frozen states at every over end (≤ 100 for a 50-over match; structural sharing keeps them cheap) and undo replays from the nearest checkpoint before `undone[0].seq`. Not in V1 unless measured.
4. **Stable references** (§2.2) so a ball re-renders only the header, current over, the two batter rows and the bowler line.
5. **No per-ball summary for live matches.** `buildMatchSummary` runs only when the match is terminal (it returns null otherwise); projections of a live match are the innings and partnership rows.

`SCORING_PROJECTION_VERSION` is bumped by any change to replay, result or summary semantics; bootstrap rebuilds every projection written by an older engine.

## 13. Worked examples

Rules: T20 preset (`BASE_MATCH_RULES`: 6-ball overs, wide 1, no-ball 1 + free hit, 11-a-side). Players: Ali (A), Ahmed (B), Cara (C) batting; Hassan (H) bowling; Rizwan (R) keeper.

### 13.1 One over, every extra type

Innings 0, over 1, A on strike, H bowling.

| # | Stored delivery | Label | Token | Runs | Next striker | Notes |
|---|---|---|---|---|---|---|
| 1 | fair/bat runsRun 1 | 0.1 | `1` | 1 | B | |
| 2 | fair/bat boundary 4 | 0.2 | `4` | 5 | B | B's four |
| 3 | wide | 0.3 | `WD` | 6 | B | not legal, not faced |
| 4 | wide runsRun 1 | 0.3 | `WD+1` | 8 | A | 2 wides, odd run rotates |
| 5 | no_ball/bat boundary 6 | 0.3 | `NB+6` | 15 | A | 1 nb + 6 to A, faced, free hit next |
| 6 | fair/leg_bye runsRun 1 (free hit) | 0.3 | `LB1` | 16 | B | free hit cleared |
| 7 | fair/bat runsRun 2 | 0.4 | `2` | 18 | B | |
| 8 | fair/bat wicket caught B, fielder R | 0.5 | `W` | 18 | vacancy | FoW 1-18 (0.5) |
| – | batter_in C at striker (same actionId as #8) | | | | C | |
| 9 | fair/bat runsRun 1 | 0.6 | `1` | 19 | C | rotation → A, over-end swap → C |

Expected state after the over:

* Score **19/1 in 1 over** (`legalBalls 6`), CRR 19.00; extras 5 = wd 3, nb 1, b 0, lb 1, p 0.
* A 7* (3 balls: #1, #5, #6; one six; dots 1), B 6 (3 balls: #2, #7, #8; one four; "c Rizwan b Hassan"), C 1* (1). Bat runs 14 + extras 5 = 19.
* Hassan 1-0-18-1, economy 18.00 (18 = wides 3 + no-ball 1 + bat 14; the leg-bye is not charged), bowler dots 2 (#6, #8), wide deliveries 2, no-balls 1, not a maiden.
* Partnerships: A–B 18 runs off 5 legal balls (A 7 off 3, B 6 off 3, extras 5), ended by wicket 1; A–C 1* off 1.
* Current over strip: `1 4 WD WD+1 NB+6 LB1 2 W 1`; pending action `select_next_bowler` with Hassan ineligible (`bowled_previous_over`); striker C, non-striker A.

### 13.2 Chase, Law 16.6 and the wickets margin

Lions 142/8 (20 ov); Tigers chase 143.

* At 141/6 in 18.2 overs (110 balls): striker hits, one run completed (142, level), non-striker run out going for the second → pre-wicket runs 1 < 2 needed → the wicket **counts**: 142/7.
* At 142/7 in 18.3: batters complete one run (143) and one is run out going for the second → pre-wicket runs 1 ≥ 1 needed → `WICKET_AFTER_RESULT`. Recorded as `runsRun 1` without the wicket: 143/7 in 18.4 (112 balls) → innings `target_reached`, natural result `win` Tigers by 10 − 7 = **3 wickets** with 120 − 112 = **8 balls left**, `method normal`; pending `confirm_result` "Tigers won by 3 wickets (8 balls left)" until `match_ended { natural }`.

### 13.3 Uneven sides and last man stands

8-a-side (`playersPerSide 8`), Team B plays 7 (`teamBPlayers 7`):

* without last man stands: A's threshold 7 wickets, B's **6**; B chasing and winning 3 down → "won by **3** wickets" (6 − 3);
* with `lastManStands`: A's threshold 8, B's 7. At B's 6th wicket no vacancy is raised — the survivor becomes a lone striker (`nonStrikerId null`, tokens and strike never rotate); the 7th wicket is all out.

### 13.4 Rain: revision, revised target, par score

* **Both innings reduced before the chase**: `revise_overs { inningsIndex 0, overs 12, scope both_innings }` at 9.0 overs → two events, one action; innings 0 `maxBalls 72`. `suggestRevisedTarget('average_run_rate', 150, 120, 72)` = ⌊150 × 72 / 120⌋ + 1 = **91**.
* **Revised target, chase played out**: Lions 180/6 (20). Tigers' chase revised to 15 overs, target 141. Tigers 138/4 in 15 overs → `overs_complete`, Lions win by (141 − 1) − 138 = **2 runs (revised target)**.
* **Terminated chase on par**: Lions 180/6. Tigers 131/3 at 14.2 when rain ends play. While paused: `overs_revised { inningsIndex 1, maxBalls 86, target 111, terminal true }` (par 110). Innings completes `terminated`; natural result Tigers win by 131 − 110 = **21 runs (par score)**; `confirm_result` outranks `resume_play`, and `match_ended { natural }` is accepted while paused. Had Tigers been 104/3, Lions would win by **6 runs (par score)**; at 110 exactly, "Match tied (par score)".

### 13.5 Penalty on the last ball

Lions 160/8. Tigers need 161, reach 159/7 after 19.5 overs. Last ball: one run → 160/7, `overs_complete`, natural result tie (runs = target − 1) → `resolve_tie`. The umpire awards 5 penalty runs to Tigers for the ball striking a fielder's helmet (Law 28.3) — recorded after the delivery as `penalty_awarded { teamId: Tigers, inningsIndex 1, runs 5 }`. Replay adds 5 to the completed chase (165/7, extras p 5), keeps it complete, re-runs §7.4: 165 ≥ 161 → Tigers won by 10 − 7 = **3 wickets**, `ballsRemaining 0`; pending action becomes `confirm_result`. A super-over penalty naming innings 0 or 1 would be rejected with `INVALID_PENALTY_INNINGS`.

### 13.6 Short runs

`fair/bat runsRun 2 shortRuns 1` → 1 run to the batter, strike **unchanged** (2 crossings), token `1s`, label "One run, one short". `runsRun 3 shortRuns 1` → 2 runs, strike **changes**.

### 13.7 Undo of a wicket group

Tail of the log: seq 41 `delivery` (caught, action X), seq 42 `batter_in` (action X). `undo(matchId, expectedLastSeq 42)` → `truncateFrom(matchId, 41, 42)` deletes exactly 2 rows; replay restores the previous striker; redo stack = `[[41, 42]]`. Tapping "1" instead clears the redo stack and appends seq 41 with a new action id.

### 13.8 Historical edit 1 → 2 runs

Innings 0, over 4 (overIndex 3), A on strike at the start:

| Seq | Recorded | Before: striker, runs to | After edit of seq 30 to `runsRun 2` |
|---|---|---|---|
| 30 | 3.1 | A, 1 | A, **2** (A stays on strike) |
| 31 | 3.2 dot | B, 0 | **A**, 0 |
| 32 | 3.3 four | B, 4 | **A**, 4 |
| 33 | 3.4 one | B, 1 | **A**, 1 → B |
| 34 | 3.5 dot | A, 0 | **B**, 0 |
| 35 | 3.6 two | A, 2 | **B**, 2, over-end swap → A faces over 5 |

Before: A 3 (3 balls), B 5 (3 balls), over 8 runs. After: A 7 (4 balls, one four), B 2 (2 balls), over **9** runs, team total +1. `restampedIds` = 31–35 and every later delivery of innings 0 (parity stays flipped); `resultChanged` only if the extra run changes the outcome. With "Keep later deliveries with the batters as recorded", the ops become `[replace 30, insert_after 30 strike_swapped]`: only seq 30 changes (A 4 off 3, over 9) and no later ball is re-attributed.

### 13.9 Wide re-classified as legal (re-anchoring)

Over 6 recorded as `0 1 WD 2 0 1 4` (7 deliveries, 6 legal) by Hassan, then `bowler_selected Imran (over_start)`, then Imran's balls. Editing the wide to a legal dot makes the over end one delivery earlier: the recorded `4` becomes ball 6.1 **by Imran** — step 2 moves Imran's selection before it, step 4 re-stamps its bowler. Hassan's sixth over drops from 9 runs conceded (0+1+1wd+2+0+1+4) to 4 (0+1+0+2+0+1); Imran's first over gains the four. This is the correct attribution: the umpire had called "over" after six legal balls, and the scorer's app had credited Imran's first ball to Hassan.

## 14. Test matrix (engine-level)

Beyond the acceptance list in [CONTRACTS.md](../CONTRACTS.md) (WP-scoring-engine):

* table-driven tests generated from §4.3 (one failing case per code per kind) and §5 (one row per call/runsTo × boundary × short runs);
* §13 examples as golden tests asserting the exact numbers above;
* property tests: random valid matches built by `testing/scriptedMatch` with a seeded generator → invariant 3, `normalizeLog` idempotence, `validateLog` ok, reference stability (§2.2);
* fuzz: random payload arrays and seq permutations never throw; every skipped event is an error issue; `lastSeq` = last element's seq;
* performance: 50-over match (≈ 700 events) replay < 50 ms and 1 000 `applyEvent` calls < 30 ms in node.
