# Scorebook — Contract Reference

Per-symbol semantics of the WP-0 contract: every domain type and field, every engine function stub, the SQL schema notes, and the repository, service and store contracts. The source files carry no comments (CLAUDE.md: no code comments anywhere), so this document is where their meaning lives. It was generated from the contract's former inline documentation after the review recorded in [ARCHITECTURE.md §11](ARCHITECTURE.md#11-design-decisions--review-log), and is maintained by hand from now on: any contract change updates the matching entry here in the same change.

Conventions: `### Name` = exported symbol; `- \`member\`` = field, union member (by its discriminant, e.g. `kind: 'pool_move'`), parameter group or constant entry; `parent › member` = a field nested in that member. Section references (§N) point to [SPEC.md](../SPEC.md).

## Files

- [`src/domain/types/primitives.ts`](#srcdomaintypesprimitivests)
- [`src/domain/types/rules.ts`](#srcdomaintypesrulests)
- [`src/domain/types/team.ts`](#srcdomaintypesteamts)
- [`src/domain/types/match.ts`](#srcdomaintypesmatchts)
- [`src/domain/types/events.ts`](#srcdomaintypeseventsts)
- [`src/domain/types/state.ts`](#srcdomaintypesstatets)
- [`src/domain/types/validation.ts`](#srcdomaintypesvalidationts)
- [`src/domain/types/summary.ts`](#srcdomaintypessummaryts)
- [`src/domain/types/competition.ts`](#srcdomaintypescompetitionts)
- [`src/domain/types/tournament.ts`](#srcdomaintypestournamentts)
- [`src/domain/types/standings.ts`](#srcdomaintypesstandingsts)
- [`src/domain/types/impact.ts`](#srcdomaintypesimpactts)
- [`src/domain/types/audit.ts`](#srcdomaintypesauditts)
- [`src/domain/types/template.ts`](#srcdomaintypestemplatets)
- [`src/domain/types/backup.ts`](#srcdomaintypesbackupts)
- [`src/domain/types/settings.ts`](#srcdomaintypessettingsts)
- [`src/domain/types/readModels.ts`](#srcdomaintypesreadmodelsts)
- [`src/domain/types/index.ts`](#srcdomaintypesindexts)
- [`src/domain/index.ts`](#srcdomainindexts)
- [`src/domain/scoring/index.ts`](#srcdomainscoringindexts)
- [`src/domain/scoring/battingOrder.ts`](#srcdomainscoringbattingorderts)
- [`src/domain/scoring/replay.ts`](#srcdomainscoringreplayts)
- [`src/domain/scoring/validate.ts`](#srcdomainscoringvalidatets)
- [`src/domain/scoring/commands.ts`](#srcdomainscoringcommandsts)
- [`src/domain/scoring/history.ts`](#srcdomainscoringhistoryts)
- [`src/domain/scoring/result.ts`](#srcdomainscoringresultts)
- [`src/domain/scoring/summary.ts`](#srcdomainscoringsummaryts)
- [`src/domain/scoring/stats.ts`](#srcdomainscoringstatsts)
- [`src/domain/scoring/format.ts`](#srcdomainscoringformatts)
- [`src/domain/scoring/presets.ts`](#srcdomainscoringpresetsts)
- [`src/domain/tournament/index.ts`](#srcdomaintournamentindexts)
- [`src/domain/tournament/fixtureReplay.ts`](#srcdomaintournamentfixturereplayts)
- [`src/domain/tournament/rng.ts`](#srcdomaintournamentrngts)
- [`src/domain/tournament/pools.ts`](#srcdomaintournamentpoolsts)
- [`src/domain/tournament/fixtures.ts`](#srcdomaintournamentfixturests)
- [`src/domain/tournament/knockout.ts`](#srcdomaintournamentknockoutts)
- [`src/domain/tournament/slots.ts`](#srcdomaintournamentslotsts)
- [`src/domain/tournament/defaults.ts`](#srcdomaintournamentdefaultsts)
- [`src/domain/tournament/templates.ts`](#srcdomaintournamenttemplatests)
- [`src/domain/tournament/stateMachine.ts`](#srcdomaintournamentstatemachinets)
- [`src/domain/tournament/nrr.ts`](#srcdomaintournamentnrrts)
- [`src/domain/tournament/tiebreakers.ts`](#srcdomaintournamenttiebreakersts)
- [`src/domain/tournament/standings.ts`](#srcdomaintournamentstandingsts)
- [`src/domain/tournament/qualification.ts`](#srcdomaintournamentqualificationts)
- [`src/domain/tournament/evaluate.ts`](#srcdomaintournamentevaluatets)
- [`src/domain/tournament/whatif.ts`](#srcdomaintournamentwhatifts)
- [`src/domain/tournament/impact.ts`](#srcdomaintournamentimpactts)
- [`src/domain/tournament/stats.ts`](#srcdomaintournamentstatsts)
- [`src/db/types.ts`](#srcdbtypests)
- [`src/db/migrations/index.ts`](#srcdbmigrationsindexts)
- [`src/db/migrations/001_initial.ts`](#srcdbmigrations001_initialts)
- [`src/db/repositories/contracts.ts`](#srcdbrepositoriescontractsts)
- [`src/services/contracts.ts`](#srcservicescontractsts)
- [`src/stores/contracts.ts`](#srcstorescontractsts)
- [`src/export/backup/remap.ts`](#srcexportbackupremapts)
- [`src/ui` (WP-design-system): resolved documentation conflicts](#srcui-wp-design-system-resolved-documentation-conflicts)
- [`src/export/backup` (WP-export): additive internal API](#srcexportbackup-wp-export-additive-internal-api-wave-1)
- [Contract additions register (wave-1 integration)](#contract-additions-register-wave-1-integration)

## `src/domain/types/primitives.ts`

Primitive aliases shared by every bounded context (scoring, tournament, persistence, export).

Conventions (CLAUDE.md):
- IDs are string UUIDs (v4) generated OUTSIDE the domain and injected (`IdGenerator`).
- Timestamps are ISO-8601 strings, supplied by the caller (the domain never reads a clock).
- Overs are always stored/computed as LEGAL BALL COUNTS (`BallCount`, an integer) and only formatted as
  `16.4` at the edge (see `formatOvers` in `scoring/format.ts`).
- Randomness is always seeded (`Seed`) so every random draw is reproducible (§31).

### `Id`

Opaque string identifier (UUID v4). Plain alias, not branded, for ergonomics.

### `ActionId`

Groups the events appended by ONE user action (the unit of undo/redo).

### `IsoDateTime`

ISO-8601 date-time in UTC, e.g. `2026-09-30T13:41:00.000Z`.

### `IsoDate`

Local calendar date `YYYY-MM-DD` (a fixture's playing day, no timezone).

### `LocalTime`

Local wall-clock time `HH:mm` (24h).

### `BallCount`

Integer count of LEGAL deliveries. `16.4` overs with 6-ball overs === 100. Never fractional.

### `Runs`

Integer run count (≥ 0 unless documented otherwise).

### `Seq`

Position of an event in a match's append-only log: 1-based, contiguous, strictly increasing.

### `Seed`

Unsigned 32-bit integer seed for the deterministic PRNG in `tournament/rng.ts`.

### `IdGenerator`

Injected id factory (expo-crypto `randomUUID` in the app, a counter in tests).

### `JsonValue`

JSON-serialisable value (audit previous/new values, backup payloads).

### `DistributiveOmit`

`Omit` that distributes over unions so discriminated unions survive (e.g. event payloads).

### `Result`

Generic success/failure result used by pure functions that can reject input.

## `src/domain/types/rules.ts`

Match rules (§6, §7, §8, §17, §20, §21). Rules are DATA attached to every match (`matches.rules_json`) — never
hard-coded in UI components. Presets (§8) only pre-fill a `MatchRules` value that stays fully editable.

Rule decisions documented here are binding for the scoring engine (`scoring/replay.ts`).

### `WideRule`

Wide rule (§17, §20).

- `penaltyRuns`: Penalty runs for the wide itself (default 1). `0` is allowed for the gully "no run for a wide" variant.
  Runs run / a boundary off a wide are ALL wides (Law 22.6) and are added on top of this penalty.
- `countsAsBall`: `false` (Laws, default): a wide is not a legal delivery, does not count towards the over and is therefore
  re-bowled. `true` (local variant): the wide counts as one of the over's balls (it is NOT re-bowled).
  There is deliberately no separate `reBowl` flag — re-bowl ≡ `!countsAsBall` (see `isReBowled`) — so the
  two can never contradict each other. Even when it counts towards the over, a wide is never a ball FACED.

### `NoBallRule`

No-ball rule (§17, §20).

- `penaltyRuns`: Penalty runs for the no-ball itself (default 1). Always a no-ball extra, always charged to the bowler.
- `freeHit`: When `true` the delivery after ANY no-ball is a free hit (ICC limited-overs playing condition). The free hit
  carries over while the free-hit delivery is itself a wide or no-ball. On a free hit the striker can only be
  dismissed in the ways possible off a no-ball: run out, hit the ball twice, obstructing the field, handled
  the ball.
- `countsAsBall`: `false` (Laws, default): re-bowled. `true`: local variant where a no-ball counts as one of the over's balls.

### `PowerplayRule`

A powerplay phase (§20). Over numbers are HUMAN, 1-based and inclusive: `{ fromOver: 1, toOver: 6 }` is the
first six overs. The engine only reports status and phase totals — fielding restrictions are not scored.
After an overs revision, phases are clamped to the new limit unless the revision supplies replacements.

### `SuperOverTieBreak`

What happens when a Super Over is itself tied (§21).

- `'repeat'`: Play another super over (current ICC playing condition).
- `'boundary_count'`: Team with more boundaries (4s + 6s) across the match and super over(s) wins (2019 rule). Computed by the engine.
- `'tie_stands';`: The tie stands; the organizer may still decide via `match_ended { tie_decided }`.

### `SuperOverRule`

Super over (§21). Super-over innings are stored as separate innings of kind `super_over`, never merged.

- `enabled`: Whether the engine offers a super over when the main match is tied.
- `overs`: Overs per side in a super over (default 1).
- `maxWickets`: Wickets that end a super-over innings (default 2, i.e. three batters).
- `maxRounds`: Maximum super-over rounds before the tie stands; `null` = no limit.
- `restrictRepeatPlayers`: ICC super-over conditions (default true): in round ≥ 2 a batter dismissed in ANY earlier super over may not
  bat, and a bowler who bowled in the PREVIOUS super over may not bowl.

### `MandatoryRetirementRule`

School/club rule "batter retires at N runs" (common in junior and gully cricket). The rule is ADVISORY: when
a batter at the crease has reached `atRuns` (`timing: 'immediately'`) or has reached it and the over has
ended (`'end_of_over'`), and at least one yet-to-bat batter remains, the engine lists the batter in
`MatchState.retirementsDue`. The scorer records `batter_retired { retirement: 'retired_not_out' }`, or simply
keeps scoring (umpires not enforcing it) — it never blocks deliveries. Such a batter may bat again only once
no yet-to-bat batter remains, and only if `mayReturn`; a batter who returned is never listed again.

### `BowlerQuotaMode`

How the per-bowler over limit is applied.
- `uniform`: every bowler may bowl `maxOversPerBowler` distinct overs (null = unlimited). Gully/club default.
- `icc_one_fifth`: ICC limited-overs condition. With O = ⌈innings max balls ÷ ballsPerOver⌉ (after revisions):
  each bowler may bowl ⌊O ÷ 5⌋ overs, and only (O mod 5) bowlers may bowl ONE extra over (17 overs → 3 each,
  two bowlers may bowl 4). `maxOversPerBowler` is ignored. Minimum 1 over each.

### `MatchRules`

Complete rule set for one match. Invariants (validated by `scoring/presets.ts#validateRules`):
- `oversPerInnings` ≥ 1 integer (any number, custom allowed §7; e.g. 17). Never assume T10/T20/ODI.
- `ballsPerOver` integer 1..12 (default 6).
- `playersPerSide` integer 2..15: the agreed side size. A side that plays short or long by agreement (gully
  "8 v 7") gets a per-team count on the match (`Match.teamAPlayers / teamBPlayers`, resolved into
  `MatchTeam.playersInSide`). The innings of a team with N players is ALL OUT when wickets === N − 1, or N when
  `lastManStands` (the survivor bats alone, no non-striker, strike never rotates). The threshold is never
  squad-based: a side that cannot fill a vacancy (absent / injured player) ends its innings with the explicit
  `innings_ended { reason: 'batters_unavailable' }` event (treated as all out for NRR).
- `maxOversPerBowler`: `null` = unlimited; applied per `bowlerQuotaMode`. The quota counts DISTINCT overs in
  which the bowler delivered at least one ball (a part-over from a mid-over replacement counts as one).
- `allowBowlerConsecutiveOvers` false by Laws (Law 17.6): a bowler may not bowl consecutive overs, nor any part
  of the next over after bowling (part of) the previous one.

### `BUILTIN_FORMAT_IDS`

Built-in format preset ids (§8). User presets use a UUID id; `custom` means "no preset".

### `FormatPreset`

A named, editable pre-configuration of `MatchRules` (§8). Built-ins live in `scoring/presets.ts`.

### `isReBowled`

Re-bowl is exactly the negation of "counts as a ball" — helper kept here so no one re-derives it.

## `src/domain/types/team.ts`

Teams and players are a GLOBAL library (§27): the same "Pakistan XI" can play standalone matches and several
tournaments. A tournament references teams through `TournamentTeam` (see tournament.ts); a match references
the players who actually played through `MatchPlayer` (match.ts), which may include guests from other teams.

### `Team`

- `shortName`: 2–5 characters for tables/scoreboard, e.g. `PAK`.
- `logoUri`: Local file URI (expo-file-system) or null. Not embedded in JSON backups (§84) — see backup.ts.
- `archivedAt`: Soft-delete marker: archived teams are hidden from pickers but keep their history.

### `Player`

- `teamId`: Home team. A player may still appear for another side in a given match (guest) via `MatchPlayer.teamId`.

### `Venue`

Library venue. Venues used by matches/fixtures/tournaments are archived, never deleted (FK RESTRICT).

### `TeamRef`

Minimal display projection used by pickers/scorecards.

### `NewTeamInput`

Input for creating a team together with its initial squad (match setup §64 and tournament wizard §25).

- `captainIndex`: Index into `players` of the captain, if any.

## `src/domain/types/match.ts`

### `MATCH_STATUSES`

MATCH STATUS vs MATCH RESULT — reconciliation of §22 and §63.

§22 lists ten "states": Scheduled, Live, Paused, Completed, Postponed, Cancelled, Abandoned, No Result, Tied,
Walkover. They mix two orthogonal questions, so the model splits them:

1. `MatchStatus` — WHERE the match is in its lifecycle (can it be scored? is it over?).
2. `MatchResult` — HOW it ended. Only terminal statuses carry a result.

| §22 label  | status        | result.type                               |
|------------|---------------|-------------------------------------------|
| Scheduled  | `scheduled`   | —                                         |
| Live       | `live`        | —                                         |
| Paused     | `paused`      | —  (play suspended: rain, bad light, interval) |
| Postponed  | `postponed`   | —                                         |
| Cancelled  | `cancelled`   | —  (will not be played; ignored by standings) |
| Completed  | `completed`   | `win` / `awarded`                         |
| Tied       | `completed`   | `tie` (optionally with a decider, e.g. super over) |
| No Result  | `completed`   | `no_result`                               |
| Walkover   | `completed`   | `walkover`                                |
| Abandoned  | `abandoned`   | `abandoned`                               |

Invariants (DB CHECK + domain):
- `status ∈ {completed, abandoned}` ⇔ `result !== null`.
- `status === 'abandoned'` ⇔ `result.type === 'abandoned'`.
- §63 "Live → No Result" and "Live → Tied" are `live → completed` with result `no_result` / `tie`.
- `abandoned` (play called off; "abandoned without a ball bowled" is allowed from `scheduled`) and `no_result`
  (organizer declares no result after play) both appear in the standings NR column; points differ only if
  `PointsSystem.abandoned` is set.
- Use `scoring/result.ts#matchStatusLabel(status, result)` to render the §22 label; never re-derive it in UI.

Authority: when the match's event log is non-empty, `live | paused | completed | abandoned` is a projection of
the log (replay). `scheduled | postponed | cancelled` exist only while the log is empty and are owned by the
`matches.status` column (set by services / fixture management).

### `TerminalMatchStatus`

Terminal statuses: the match carries a `MatchResult` and scoring is closed (historical edits only).

### `Toss`

Toss (§6). `null` on the match means "not recorded" (common in gully cricket); then no consistency check.

### `WinMargin`

Winning margin.
- `runs`: normally the side batting first won; runs = (target − 1) − chasing runs (target may be revised).
  With `method: 'par_score'` (terminated chase, see `OversRevisedPayload.terminal`) either side can win by
  runs: chasing side ahead → chasing runs − par; behind → par − chasing runs (par = target − 1).
  With `method: 'penalty_runs'` (Law 16.10, see `MatchResult`) the chasing side won and runs = chasing runs −
  (target − 1), i.e. its lead after the penalty; the result text never states this number.
- `wickets`: the chasing side won by reaching the target; wickets = the chasing team's all-out threshold −
  wickets lost (`MatchTeam.playersInSide − 1 − w`, or `playersInSide − w` with last-man-stands; 10 − w in a
  normal 11-a-side match); `ballsRemaining` = allotted balls − legal balls used.

### `TieDecisionMethod`

How a tied match was nevertheless decided (e.g. knockout).

### `TieDecider`

- `superOverRounds`: Number of super-over rounds played (only for `super_over` / `boundary_count` after super overs).

### `MatchResult`

Match outcome (§22). Discriminated by `type`.

- `win.method`: `normal`; `revised_target` when the chase had a target set by `overs_revised` (rain/DLS/VJD
  supplied by the organizer) and was played out — text appends "(revised target)"; `par_score` when the chase
  was terminated (`overs_revised { terminal: true }`) and decided against the par score — margin in runs for
  either side, text appends "(par score)". A tie at par is `{ type: 'tie' }` with text "Match tied (par score)".
  `penalty_runs` (additive, Law 16.10) when the chasing side lost all its wickets (completion `all_out` or
  `batters_unavailable`) and passed the target only through penalty runs awarded to its completed innings
  afterwards (BR-PN-05) — margin `{ kind: 'runs' }` (see `WinMargin`), text "Tigers won by penalty runs",
  never "by 0 wickets". A chase with wickets in hand that passes the target through a later penalty
  (EC-PN-04) is still a normal win by wickets. Every reader of a stored result (backup validation, mappers,
  standings) accepts it like `normal`.
- `tie.decider`: `null` = the tie stands (standings count a tie). A super-over (or other) winner is recorded
  here rather than as a `win`, so the main-match innings are never corrupted (§21). Whether a decided tie
  scores as win/loss or tie in the table is `PointsSystem.superOverDecidedTie`. Knockout advancement uses
  `resultWinner()` which honours the decider.
- `no_result` / `abandoned`: no winner. Reason is free text ("Rain", "Bad light").
- `walkover`: one side did not play/forfeited before a ball was bowled. No innings exist.
- `awarded`: organizer decision with mandatory reason (misconduct, concession mid-match, par score computed
  off-app). `winnerTeamId: null` = awarded as no-winner (treated like no result for points).

A derived, flat "method" (normal | revised_target | super_over | … | walkover | awarded | none) is available
via `scoring/result.ts#resultMethod`.

### `Match`

Persistent match record (`matches` row). Scoring facts are NOT here — they live in the event log.
`result`, `winnerTeamId` and (for started matches) `status` are projections refreshed from replay in the same
transaction as every log write.

- `winnerTeamId`: `resultWinner(result)` projection (includes a tie decider's winner).
- `fixtureId`: Fixture this match was played for (a fixture may have several matches if replayed; see Fixture.matchId).
  The DB enforces that the fixture belongs to `tournamentId`. The stage/pool are NOT copied here: they are read
  from the fixture, so moving a completed fixture between stages/pools cannot leave a stale copy.
- `teamAPlayers`: Players each side fields in THIS match when different from `rules.playersPerSide` (gully "8 v 7", a side
  agreed to play short). null = `rules.playersPerSide`. Drives that team's all-out threshold, last-man-stands
  trigger and wickets margin. Changing it is a rules-level edit (log must still replay).
- `resumeDismissedAt`: §23 SAVE & EXIT: the startup resume prompt skips this match until the next event is appended.

### `MatchPlayer`

A player in a match squad (`match_players`). The FK anchor for every player id used in the match's events.

- `teamId`: The side the player plays for IN THIS MATCH (may differ from Player.teamId for guests).
- `name`: Name snapshot resolved from `players` at load time (renames propagate; not stored twice).
- `battingOrder`: Planned batting position (1-based) or null. Purely a UI ordering hint; the log decides who batted.
- `isSubstitute`: Substitute fielder / 12th man (Law 24): may field and take catches or run-outs (fielderIds), rendered
  "c sub (Name) b Bowler" / "run out (sub (Name))". Never bats, bowls, opens, appears on the batting card or
  counts towards the side's players. Full (e.g. concussion) replacements are ordinary squad members in V1.

### `MatchTeam`

- `playersInSide`: Resolved players in side: `Match.teamXPlayers ?? rules.playersPerSide`.

### `MatchSetup`

Everything the scoring engine needs besides the event log. Pure data; assembled by MatchRepository.
`replayMatch(setup, events)` is a pure function of exactly these two inputs.

Squads may grow during a match (players added on the fly in gully cricket): the service inserts the
`match_players` row first, then appends the event that references the player, in one transaction.

- `teams`: `[teamA, teamB]` in the order shown on the match card. Batting order is decided by `innings_started`.

### `NewMatchInput`

Service input for creating a match (standalone §64, or from a fixture §66).

- `teamAPlayers`: See `Match.teamAPlayers`; null = `rules.playersPerSide`.

### `MatchSquadEntry`

- `isSubstitute`: See `MatchPlayer.isSubstitute`.

## `src/domain/types/events.ts`

MATCH EVENT LOG (§14, §15, §16, §23, §59) — the single authoritative source of scoring truth.

Each match has ONE ordered, append-only log of `MatchEvent`s (`seq` 1..n, contiguous). Replaying the log from
nothing with the match's `MatchSetup` (`scoring/replay.ts#replayMatch`) deterministically reproduces every
score, card, partnership, fall of wicket, over summary, pending prompt and the result. Nothing derived is
ever trusted from storage.

**INPUT vs DERIVED**
INPUT (stored): only what a scorer observes — the umpire's call, runs physically run, boundary allowance,
where runs are credited (bat / byes / leg-byes), dismissals, player selections, and organizer decisions.
DERIVED (replay, never stored): over number, ball number, legality, batter/extra/total runs, runs charged to
the bowler, balls faced, free-hit status, strike after the ball, innings completion (all out, overs complete,
target reached), targets, required rate, the natural result, display tokens, dismissal text.

§14 BallEvent mapping: inningsId → BallRecord.inningsIndex; overNumber/ballNumber → BallRecord.overIndex /
ballInOver; batsmanId/nonStrikerId/bowlerId → delivery stamps; batterRuns/extraRuns/totalRuns/extraType/
isLegalDelivery → BallRecord (derived); wicketType/dismissedPlayer/fielder → `DeliveryWicket`;
timestamp → `recordedAt`.

**CONTEXT STAMPS**
`delivery.strikerId / nonStrikerId / bowlerId` are STAMPS: they must equal the on-field context the replay
derives at that point. On APPEND (`validateEvent(…, 'append')`) a mismatch is the blocking error
`CONTEXT_MISMATCH`. On REPLAY (`validateEvent(…, 'replay')`) a mismatch is only a WARNING-severity
`ReplayIssue`: the event is applied with the derived context, because stamps are derived data and must never
veto an authoritative delivery. Strike itself is always DERIVED from runs/ends/over ends/swaps, so a
historical edit (1 run → 2 runs) re-attributes later balls correctly; `scoring/history.ts` re-stamps later
deliveries after every edit so stored rows stay consistent and self-describing (exports, audits, SQL).

**SCORING CONVENTIONS (binding for replay/stats)**
- `runsRun` = runs the batters physically completed by running (crossings), incl. the run in progress if the
  batters had crossed when an overthrow was thrown (Law 19.8). `shortRuns` (Law 18.5) = how many of those were
  short and are NOT scored. Runs SCORED by running = `runsRun − shortRuns`; runs credited on the delivery =
  scored running runs + `boundary` (the 4/6 allowance). Every "runs" figure below means scored runs.
- Wides: ALL wide runs (penalty + scored running runs + boundary 4) are wides, charged to the bowler. Never a
  ball faced.
- No-balls: the penalty is a no-ball extra charged to the bowler. Runs off the bat are credited to the batter
  AND charged to the bowler; otherwise they are byes/leg-byes (Law 21.10) and NOT charged to the bowler
  ("no-ball + 2 byes" = `{ call: 'no_ball', runsTo: 'bye', runsRun: 2 }` → nb 1 + b 2). A no-ball IS a ball
  faced by the striker.
- Byes / leg-byes (on fair balls or no-balls) are never charged to the bowler.
- Balls faced = fair deliveries + no-balls received as striker; wides excluded.
- Bowler wicket credit: bowled, caught, lbw, stumped, hit wicket ONLY. Never: run out, obstructing the field,
  hit the ball twice, handled the ball, timed out, retired (any kind).
- Maiden: a complete over (all `ballsPerOver` legal balls) bowled entirely by ONE bowler with 0 runs charged
  to that bowler (wides/no-balls break a maiden; byes/leg-byes do not). Split or incomplete overs never count.
- Fours/sixes (batting 4s/6s columns): `boundary` 4/6 off the bat with `runsRun === 0`. Overthrow boundaries
  (`runsRun > 0` + 4) and all-run fours are runs but not "4s".
- Strike rotates when `runsRun` is ODD (physical crossings — including byes/leg-byes, the running portion of
  wides/no-balls and short runs, so "ran 2, one short" scores 1 with no change of ends); the boundary
  allowance never rotates strike. After the over's last legal ball, ends swap (the bowler changes ends).
  Order: apply runs rotation, then dismissal vacancy, then end-of-over swap.
- Dismissals: bowled/caught/lbw/stumped/hit wicket/hit twice dismiss the STRIKER, allow no runs
  (`runsRun === 0 && boundary === 0`; a stumping off a wide still scores the wide penalty) and the incoming
  batter takes the striker's end (Law 18.11, 2022: after a catch the new batter faces unless the over ended).
  Run out / obstructing / handled: `dismissalEnd` states where the wicket was put down (or the obstructing
  batter's end); the not-out batter is at the OTHER end and the incoming batter takes `dismissalEnd`.
  `runsRun` = runs completed before the wicket (they count).
- Law 16.6 (match ends at the winning run): in a chase innings (regular or super over) a delivery may not
  carry a wicket when the runs it credits BEFORE the wicket — no-ball/wide penalty + scored running runs
  (+ boundary) — already reach the target (`WICKET_AFTER_RESULT`). E.g. need 1, one run completed, non-striker
  run out going for the second → record `runsRun: 1` without the wicket (won by the wickets then in hand). A
  wicket that falls with the scores merely level still counts.
- Allowed dismissals by call: fair → all; wide → stumped, hit wicket, run out, obstructing, handled;
  no-ball → run out, hit twice, obstructing, handled. Free hit (any call) → run out, hit twice, obstructing,
  handled.
- Boundary 6 only off the bat (`runsTo: 'bat'`); byes, leg-byes and wides can have boundary 4 at most.
- Penalty runs (Law 41, usually 5) are a separate `penalty_awarded` event naming the innings they go to,
  shown as extras "p" (placement rules on `PenaltyAwardedPayload`).
- Substitute fielders (`MatchPlayer.isSubstitute`, Law 24) may appear only in `fielderIds`; they never bat,
  bowl or appear on the batting card.
- Super-over innings never contribute to main-innings totals, player batting/bowling aggregates for the
  match card, or NRR (§21, §41).

**Enumerations**

### `DELIVERY_CALLS`

The umpire's call on a delivery.

### `RUNS_TO`

Where the runs (run + boundary) of a fair delivery or no-ball are credited. Wides have no `runsTo`.

### `BoundaryAllowance`

Boundary allowance scored on a delivery.

### `DELIVERY_DISMISSAL_TYPES`

Dismissals that happen ON a delivery (§18). `handled_ball` kept for clubs on pre-2017 Laws.

### `OFF_BALL_DISMISSAL_TYPES`

Dismissals recorded WITHOUT a delivery being counted: `timed_out` (incoming batter late, Law 40), `run_out` of
a non-striker backing up before the ball is delivered (Law 38.3 — the ball does not count), and
`obstructing_field` between deliveries.

### `RETIREMENT_KINDS`

Retirements (§18). `retired_hurt` and `retired_not_out` are NOT wickets (batter is "not out" and may resume;
`retired_not_out` only once no yet-to-bat batter remains — used for mandatory retirement). `retired_out`
counts as a wicket (appears in fall of wickets) and the batter can never resume.

### `DismissalType`

Every way a batter can be OUT (counts as a wicket).

### `BOWLER_CREDITED_DISMISSALS`

Dismissals credited to the bowler. Everything else is not.

### `CreaseEnd`

Ends of the pitch, named relative to the delivery being recorded: striker's end = wicket-keeper's end.

### `CreasePosition`

Positions for the NEXT delivery.

**Payloads**

### `DeliveryWicket`

Wicket on a delivery.
- `playerOutId`: the striker for bowled/caught/lbw/stumped/hit wicket/hit twice; striker OR non-striker for
  run out / obstructing / handled.
- `fielderIds`: 0..2 players of the FIELDING side (substitute fielders included): catcher (caught; equal to
  the bowler for "c & b"), wicket-keeper (stumped), thrower then wicket-breaker (run out "Smith/Jones").
  Always optional: an unknown catcher is common in club/gully scoring and renders "c ? b Hassan" (warning
  `FIELDER_UNKNOWN`, no catch credited). `buildEvents` defaults a stumping's fielder to the fielding side's
  designated wicket-keeper (`MatchPlayer.isWicketKeeper`).
- `dismissalEnd`: REQUIRED for run_out, obstructing_field and handled_ball; must be null otherwise.

### `DeliveryCommon`

- `strikerId`: Context stamp — must equal the derived striker.
- `nonStrikerId`: Context stamp — null only when a last-man-stands batter is batting alone.
- `bowlerId`: Context stamp — must equal the derived current bowler (set by innings_started / bowler_selected).
- `runsRun`: Runs completed by running (0..9, physical crossings incl. short runs). For a run out: runs completed before the wicket.
- `shortRuns`: Short runs (Law 18.5): 0..runsRun, not scored; strike still follows `runsRun` parity. Usually 0.
- `boundary`: Boundary allowance (0, 4 or 6). A boundary normally has `runsRun === 0`; `>0` only for overthrow boundaries.

### `DeliveryPayload`

One delivery (§14). A discriminated sub-union on `call`:
- `fair` / `no_ball` carry `runsTo` (bat | bye | leg_bye);
- `wide` has no `runsTo` — every run on a wide is a wide.

Examples: dot `{call:'fair', runsTo:'bat', runsRun:0, boundary:0}`; FOUR `{fair, bat, 0, 4}`;
1 + 4 overthrows `{fair, bat, runsRun:1, boundary:4}` (5 to batter, strike rotates, not a "4");
wide `{call:'wide', runsRun:0, boundary:0}` (1 wd); wide to boundary `{wide, 0, 4}` (5 wd);
NB + hit for SIX `{no_ball, bat, 0, 6}` (1 nb + 6 to batter); NB + 2 byes `{no_ball, bye, 2, 0}`;
leg bye 1 `{fair, leg_bye, 1, 0}`; run out going for the 2nd `{fair, bat, runsRun:1, wicket:{run_out,…}}`;
ran 2 with one short `{fair, bat, runsRun:2, shortRuns:1}` (1 run, batters back at their original ends).
`shortRuns` is 0 in every example unless stated.

### `InningsStartedPayload`

Starts innings `inningsIndex` (0 = first, 1 = second/chase, 2k+2 / 2k+3 = super over round k+1).
Also sets the bowler of the innings' first over. Bowling team = the other match team.
Valid when: previous innings complete, index === number of innings so far, for index 1 the other team bats,
for super-over innings a `super_over_started` precedes and the pair has different batting teams, the first
innings respects the toss (`TOSS_MISMATCH`), all players belong to the right squads, none of them is a
substitute fielder (`SUBSTITUTE_NOT_ALLOWED`), and — for super-over round ≥ 2 with
`rules.superOver.restrictRepeatPlayers` — no opener was dismissed in an earlier super over and the bowler did
not bowl in the previous super over (`PLAYER_INELIGIBLE_SUPER_OVER`).

### `BatterInPayload`

A batter comes in to fill the vacancy at `position` (after a wicket or retirement), or a retired batter
resumes. Must fill an existing vacancy; the player must be yet to bat, `retired_hurt`, or `retired_not_out`
(the latter only when no yet-to-bat batter remains and, under mandatory retirement, `mayReturn`). Never a
substitute fielder; in super-over round ≥ 2 never a batter dismissed in an earlier super over (when
`restrictRepeatPlayers`).

### `BowlerSelectionReason`

Why a bowler is being selected.
- `over_start`: sets the bowler of an over with 0 deliveries so far; a repeat before the first ball replaces
  the previous selection (plain correction).
- `injury`: mid-over replacement because the bowler cannot finish the over (Law 17.8); the replaced bowler may
  bowl again later.
- `suspended`: mid-over replacement because the bowler was removed from the attack (Law 41 dangerous/unfair
  bowling); the replaced bowler may not bowl again in this innings (`removed_from_attack`).
A wrong bowler noticed mid-over is NOT an event: it is a history edit of the over-start selection (the log is
append-only; `history.normalizeLog` re-stamps the over's deliveries).

### `BowlerSelectedPayload`

Selects the bowler. `reason: 'over_start'` only with 0 deliveries in the current over; `injury`/`suspended`
only mid-over (`BOWLER_CHANGE_REASON_INVALID` otherwise). A mid-over replacement is credited with the rest of
the over; neither bowler can earn a maiden for that over.
Guards: bowler is a non-substitute member of the fielding squad; not the bowler of (any part of) the previous
over unless `allowBowlerConsecutiveOvers`; bowler quota (`InningsLimits`) not exhausted; not removed from the
attack this innings; in super-over round ≥ 2 not the bowler of the previous super over (when
`restrictRepeatPlayers`).
History edits re-anchor over-start selections to the first delivery of their over (see scoring/history.ts).

### `StrikeSwappedPayload`

Manual swap of striker and non-striker (§11, §19) — correction tool, allowed between deliveries.

### `BatterRetiredPayload`

A batter at the crease retires (between deliveries). Creates a vacancy at their position.

### `BatterDismissedPayload`

Dismissal without a counted delivery. `timed_out`: `playerId` is the incoming (not yet at the crease) batter;
requires a vacancy, which remains afterwards. `run_out` (non-striker backing up) / `obstructing_field`:
`playerId` is at the crease; creates a vacancy at their position. Never credited to the bowler; the ball does
not count.

### `PenaltyAwardedPayload`

Penalty runs (Law 41; usually 5) awarded to `teamId`, shown as extras "p" of innings `inningsIndex`.

PHASES: the main match (innings 0 and 1) is one phase; each super-over round (innings 2k+2, 2k+3) is its own
phase. The current phase is the super-over round in progress / last started, else the main match. A penalty
NEVER crosses phases, so a super-over penalty can never change a main-match total (§21).

`inningsIndex` is explicit (the command builder fills the default) and must be, within the current phase:
- the innings `teamId` is batting now; or
- `teamId`'s most recent innings of the phase, even when it has just completed (a penalty arising on an
  innings-ending ball — e.g. Law 28.3 helmet on the last ball — is recorded after that delivery and goes to
  that innings); or
- the index of `teamId`'s NOT-YET-STARTED innings of the phase (carried, applied at `innings_started`).
Anything else is `INVALID_PENALTY_INNINGS`. Runs 1..99 (`INVALID_PENALTY`).

Effects (replay re-runs completion, natural result and pending action after the event, replay.ts step 12):
- on an in-progress chase: runs ≥ target completes it (`target_reached`);
- on a completed first innings of the phase: the target of the chase rises (if the chase is complete, its
  result is recomputed);
- on a completed chase: its runs change and the natural result is recomputed (a last-ball tie can become a
  win); the innings stays complete — a penalty never reopens an innings for further deliveries.
Valid while play is suspended; invalid after `match_ended`.

### `OversRevisedPayload`

Overs revision (§7 "20 overs → rain → 12 overs", §41 reduced-over matches).
- Targets the current innings or a not-yet-started regular innings (future innings allowed, completed not).
- `maxBalls` is in LEGAL BALLS (so a chase stopped for good at 14.2 can be set to exactly 86), must be ≥ balls
  already bowled in that innings and ≥ 1. Setting it equal to the balls bowled completes the innings at once.
- `target`: runs required to WIN for a chase innings, e.g. from a DLS/VJD sheet or `suggestRevisedTarget`.
  `null` keeps the standard target (first-innings runs + penalties + 1). Only valid for chase innings.
- `maxOversPerBowler`: `undefined` = unchanged, `null` = unlimited, n = new quota.
- `bowlerQuotaMode`: `undefined` = unchanged (see `MatchRules.bowlerQuotaMode`; `icc_one_fifth` recomputes
  from the new limit automatically).
- `powerplays`: `undefined` = clamp existing phases to the new limit; array = replace phases.
- `terminal: true` = play will NOT resume (rain-terminated chase decided on a par score). Only for the chase
  innings in progress, with `maxBalls` = balls bowled and a non-null `target` = par + 1. The innings completes
  with reason `terminated` and the natural result compares runs with the par score (`method: 'par_score'`,
  margin in RUNS for either side: "Lions won by 21 runs (par score)"). Valid while play is suspended. A first
  innings that cannot be resumed is a normal revision (maxBalls = balls bowled) followed by a revised chase,
  or `match_ended { no_result }`.
A later revision of the same innings supersedes earlier ones. After the event replay re-runs completion,
natural result and pending action (a target at or below the current chase runs → `target_reached`).
Reducing innings 0 without a planned revision of innings 1 raises the warning `CHASE_OVERS_NOT_REVISED`.

### `PlaySuspendedPayload`

Play suspended (rain, bad light, interval…). Match status becomes `paused`. While paused only `play_resumed`,
`overs_revised` (incl. `terminal`), `penalty_awarded` and `match_ended` are valid (`PLAY_SUSPENDED`
otherwise); `super_over_started` and every on-field event need `play_resumed` first.

### `InningsEndedPayload`

EXPLICIT innings end. Computed endings (all out, overs complete, target reached) are never events.
- `declared`: batting side closes its innings. `absentees` must be empty.
- `batters_unavailable`: a vacancy cannot be filled (side short of players / injured) — treated as ALL OUT
  for NRR and result text. `absentees` names the batting-side players who could not bat (yet to bat or
  retired hurt); the card shows them as "absent hurt" / "absent" (status `absent`) instead of "did not bat".

### `SuperOverStartedPayload`

Starts super-over round `round` (1-based) after a tied main match (or tied previous round).
Requires `rules.superOver.enabled`, round ≤ maxRounds, and the natural result being an undecided tie.
By ICC convention the side that batted second in the previous pair bats first (suggested by the pending
action; the validator accepts either order).

### `MatchEndOutcome`

How the scorer/organizer closes the match. See `MatchEndedPayload`.

- `type: 'natural'`: Accept the result the engine computed (win incl. par score, tie, super-over or boundary-count decided tie).
  Only valid when a natural result exists; valid while play is suspended (a rain-terminated chase is confirmed
  without a fake `play_resumed`).
- `type: 'tie_decided'`: Natural result is an undecided tie; decided another way (bowl-out, coin toss, organizer).
- `type: 'walkover'`: Only valid before any delivery has been recorded (may be the first and only event).

### `MatchEndedPayload`

TERMINAL event: closes scoring and fixes the result. Nothing may be appended after it; reopening a match is
`undo` of this event (audited + impact preview for tournament matches). Natural completion is NOT automatic:
when the engine computes a result it raises `confirm_result`, so a mistaken final ball can still be undone
before standings change (§66).

### `MatchEventPayload`

Union of every event payload — exactly what `scoring/commands.ts` produces.

### `MATCH_EVENT_KINDS_EXHAUSTIVE`

Compile-time guard: fails to type-check if a kind is missing from MATCH_EVENT_KINDS.

### `MatchEventInput`

Payload without envelope: what commands build and validators check before append.

### `EventEnvelope`

Envelope assigned by the application service at append time (ids and clock are injected; the domain never
generates them).
- `seq`: 1-based, contiguous, unique per match. Appends use `MatchState.lastSeq + 1`. History edits renumber
  1..n.
- `actionId`: shared by all events appended by one user action (e.g. wicket + incoming batter). Undo/redo
  operate on whole action groups. An actionId identifies exactly ONE contiguous run of events: history edits
  give every inserted op its own fresh actionId, so a group can never be split across the log.
- `id`: stable identity; preserved across renumbering/restamping so edits can be diffed.

### `MatchEvent`

A stored event: payload + envelope. Narrow on `kind` (and `call` for deliveries).

## `src/domain/types/state.ts`

DERIVED STATE — output of `scoring/replay.ts#replayMatch(setup, events)`. Never persisted as truth; the only
persisted copies are recomputable projections (`innings` rows, `matches.summary_json`).
Every screen renders these values; no screen computes cricket maths itself (CLAUDE.md, §2 Accuracy).

Rates are plain numbers rounded ONLY at the edge (`scoring/format.ts`); `null` means "undefined" (e.g. strike
rate with 0 balls faced) and renders as "–".

### `InningsCompletionReason`

Why an innings ended. COMPUTED: `all_out`, `overs_complete`, `target_reached`, `match_ended` (the match was
ended mid-innings: abandoned, no result, awarded), `terminated` (a chase closed by
`overs_revised { terminal: true }` — decided on the par score). EXPLICIT (event `innings_ended`): `declared`,
`batters_unavailable`. `all_out` and `batters_unavailable` both count as ALL OUT for NRR (`isAllOut`).

### `ExtrasBreakdown`

Extras for an innings (§17). `total` = wides + noBalls + byes + legByes + penalty.

- `wides`: All wide runs (penalty + run + boundary).
- `noBalls`: No-ball PENALTY runs only (bat runs off a no-ball belong to the batter).
- `byes`: Byes, including byes off no-balls.
- `legByes`: Leg-byes, including leg-byes off no-balls.
- `penalty`: Penalty runs awarded (Law 41).

### `BallToken`

Compact display token for the current-over strip (§13) and over summaries. Text grammar (see
`scoring/format.ts#ballToken`): `0`,`1`,`2`,`3`,`4`,`6`,`5`; `WD`, `WD+n`; `NB`, `NB+n` (bat), `NB+nB`,
`NB+nLB`; `Bn`, `LBn`; wicket `W`, or `<runs part>+W` (e.g. `1+W`, `WD+W`, `NB+1+W`).
`kind` drives restrained visual states (§13, §71) and is never conveyed by colour alone (§78):
`accessibilityLabel` is the spoken form ("Wide, plus one run", "Wicket, caught").

### `DismissalRecord`

A wicket (any `DismissalType`, incl. off-ball and retired out) as it appears on the card and FoW.
`creditedBowlerId` is the bowler for bowler-credited dismissals, else null. `bowlerId` is the bowler at the
time (null for off-ball dismissals when no over is in progress). `text` examples: `b Hassan`, `c Rizwan b
Hassan`, `c & b Hassan`, `lbw b Hassan`, `st Rizwan b Hassan`, `hit wicket b Hassan`, `run out (Smith/Jones)`,
`run out`, `obstructing the field`, `hit the ball twice`, `handled the ball`, `timed out`, `retired out`.

- `wicketNumber`: 1-based wicket number in the innings.
- `teamRuns`: Team score and legal balls when the wicket fell (FoW).
- `onDelivery`: true when it happened on a delivery (`delivery.wicket`), false for off-ball dismissals/retired out.

### `DeliveryRunsBreakdown`

Runs split of one delivery.

### `BallRecord`

One delivery as derived by replay (§14 BallEvent). Over/ball numbering follows scorecard convention:
`overIndex` 0-based; `ballInOver` = legal balls already bowled in this over + 1, so a wide bowled after two
legal balls is `6.3` and so is the next legal ball; `label` = `${overIndex}.${ballInOver}`.

- `deliveryInOver`: 1-based index among ALL deliveries of the over (wides/no-balls included) — §58 `delivery_number`.
- `isLegal`: Counts towards the over (fair; wide/no-ball only when the rule variant says they count). §14 isLegalDelivery.
- `isBallFaced`: Counts towards the striker's balls faced (fair + no-ball; never a wide).
- `runsTo`: `wide` for wides, else the delivery's `runsTo`.
- `shortRuns`: Short runs (not scored). Scored running runs = runsRun − shortRuns.
- `bowlerRuns`: Runs charged to the bowler: wides + no-ball penalty + bat runs.
- `endsOver`: This delivery was the over's last legal ball.

### `BatterStatus`

Batting card status (§11). `retired_out` batters have status `out`. `absent`: named in
`innings_ended { batters_unavailable }.absentees` (text "absent hurt" / "absent"). Substitute fielders never
have a batting row.

### `BattingCardRow`

- `position`: 1-based order of arrival at the crease; null while yet to bat (rows ordered by position, then squad order).
- `strikeRate`: runs × 100 / balls; null when balls = 0.
- `dismissalText`: `not out`, `retired hurt`, `retired not out`, `absent hurt`, `absent`, dismissal text, or '' for yet to bat.
- `returnedFromRetirement`: Batter resumed after a retirement (never re-prompted by the mandatory-retirement rule).

### `BowlingCardRow`

Bowling card row (§12). Economy = runsConceded / (legalBalls / ballsPerOver); null when 0 legal balls.

- `order`: 1-based order in which bowlers first bowled.
- `oversUsed`: Distinct overs in which the bowler delivered ≥ 1 ball (quota basis).
- `dots`: Legal deliveries with 0 runs charged to the bowler (a leg-bye/bye ball is a dot for the bowler).

### `Partnership`

A partnership between two batters. A new partnership starts whenever either batter changes (wicket or
retirement). `wicketNumber` = wickets fallen before it + 1 (a retirement therefore produces two partnerships
with the same wicket number). `balls` = legal deliveries during the partnership. `batterBId` is null for a
last-man-stands batter batting alone.

- `endedBy`: null while unbroken.

### `FallOfWicket`

- `overLabel`: e.g. `12.3` (over.ball of the wicket ball, or of the last legal ball for off-ball dismissals).

### `OverSummary`

One over (complete or in progress). Used for the current over (§13), over summaries (§83) and charts.

- `bowlerIds`: One bowler normally; two when a bowler was replaced mid-over.

### `PowerplayStatus`

- `active`: Phase containing the NEXT delivery, if any.

### `InningsLimits`

Effective limits after revisions. `maxWickets` is the all-out threshold of the BATTING team: regular innings
`playersInSide − 1` (`playersInSide` with last-man-stands), super over `min(superOver.maxWickets, that)`.
Bowler quota: `uniform` → every bowler ≤ `maxOversPerBowler` (null = unlimited), `extraOverBowlers` 0;
`icc_one_fifth` → `maxOversPerBowler` = ⌊O ÷ 5⌋ (min 1) and `extraOverBowlers` = O mod 5 bowlers may bowl one
more (O = ⌈maxBalls ÷ ballsPerOver⌉), recomputed after every revision.

### `TargetInfo`

- `runs`: Runs needed to WIN (first-innings total + penalties + 1, or the revised target).

### `OversRevisionRecord`

- `terminal`: Play terminated; the chase is decided on the par score (target − 1).

### `InningsState`

- `target`: Set for chase innings (index 1 and the second innings of each super-over pair).
- `strikerId`: Batter who will face the next delivery; null = vacancy.
- `bowlerId`: Bowler of the next delivery; null while awaiting `bowler_selected` at an over start.
- `previousOverBowlerIds`: Bowler(s) of the previous over (consecutive-overs rule).
- `removedBowlerIds`: Bowlers removed from the attack this innings (`bowler_selected { reason: 'suspended' }`).
- `currentOver`: Over in progress (≥ 1 delivery, not complete), else null.
- `runRate`: Runs per over for this innings; null when 0 legal balls.

### `ChaseState`

Present while a chase innings is in progress.

- `requiredRunRate`: runsRequired / (ballsRemaining / ballsPerOver); null when ballsRemaining = 0.

### `BowlerIneligibility`

Candidate ineligibility reasons for bowler selection (substitute fielders are never candidates at all).
`quota_reached` also covers `icc_one_fifth` once the extra-over allowance is used up. `removed_from_attack`:
replaced with `reason: 'suspended'` earlier this innings. `bowled_previous_super_over`: ICC super-over rule.

### `PendingAction`

What the UI must prompt for before a delivery can be recorded (§64 flow). Priority (first match wins):
`confirm_result` | `resolve_tie` > `resume_play` > `start_next_innings` > `select_next_batter` >
`select_next_bowler` > null (ready to score, or match over).
A natural result outranks `resume_play`: a rain-terminated chase is confirmed while play is suspended
(choosing a super over from `resolve_tie` still needs `play_resumed` first).
The task-level name "match_complete" is `confirm_result`: the engine computed a result and awaits the
explicit `match_ended { natural }` so a mistaken last ball can still be undone before standings change.
After `match_ended` the pending action is null and `lifecycle` is `completed`/`abandoned`.
Mandatory retirement is advisory (`MatchState.retirementsDue`), never a pending action.

- `type: 'start_next_innings' › suggestedBattingTeamId`: Toss/ICC-convention suggestion; null when the toss is unknown and it is the first innings.
- `type: 'select_next_batter' › candidates`: `eligibleIncomingBatters`: yet-to-bat first (squad order), then eligible retired batters; never
  substitutes or super-over-ineligible batters. May be empty (UI offers "add player").
- `type: 'select_next_batter' › canEndInnings`: true → UI offers "End innings (no batters available)".
- `type: 'resolve_tie' › options`: `super_over` only if rules allow another round. `decide_other` = bowl-out/coin toss/organizer.

### `MatchLifecycle`

Lifecycle derived from the log. `not_started` (empty log or only pre-play events) maps to the row's
`scheduled | postponed | cancelled` status, which the service overlays.

### `MatchState`

- `currentInningsIndex`: Innings in progress, else the last started innings; null before the first innings.
- `currentRunRate`: Current innings run rate (CRR); null when no legal balls.
- `canRecordDelivery`: `lifecycle === 'live' && pendingAction === null`, an innings is in progress and `!needsRepair`.
- `retirementsDue`: Advisory mandatory-retirement prompts (`MandatoryRetirementRule`): batters at the crease who should retire
  now. Never blocks scoring; empty when the rule is off or no yet-to-bat batter remains.
- `naturalResult`: Result computed from play (available before confirmation).
- `result`: Final result, set only by `match_ended`.
- `resultText`: Text of `result ?? naturalResult`, e.g. "Pakistan XI won by 3 runs".
- `plannedRevisions`: Accumulators that make `applyEvent` equivalent to a full replay (no hidden replay-only state):
  overs revisions recorded for innings not yet started (applied at `innings_started`), and penalty runs
  awarded to a not-yet-started innings of the current phase (`PenaltyAwardedPayload.inningsIndex`).
- `lastSeq`: Seq of the LAST EVENT READ (applied or skipped); 0 for an empty log. This is the stored log's tail, i.e. the
  `expectedLastSeq` for the next append (`lastSeq + 1`).
- `lastAppliedSeq`: Seq of the last event actually APPLIED; 0 when none. Equals `lastSeq` for a healthy log.
- `issues`: Integrity problems found while replaying. `error` issues = events skipped (never applied); `warning` issues =
  applied with a correction (e.g. a stale context stamp). Healthy logs: [].
- `needsRepair`: true when any `error`-severity issue exists. Services then refuse every write that would keep the log
  degraded (`FORBIDDEN_STATE`, "This match needs repair") and never persist projections built from it; the
  repair path is a history edit (or undo) whose RESULTING log replays without errors.

## `src/domain/types/validation.ts`

### `EVENT_VALIDATION_CODES`

Validation vocabulary for the scoring engine (`scoring/validate.ts`). Codes are stable identifiers: tests and
UI copy key off them; the `message` is organizer-friendly English (never a raw technical error, §86).

- `'MATCH_ALREADY_ENDED'`: lifecycle
- `'INNINGS_NOT_IN_PROGRESS'`: innings
- `'PLAYER_NOT_IN_SQUAD'`: players
- `'BOWLER_NOT_SELECTED'`: bowling
- `'CONTEXT_MISMATCH'`: stamps
- `'INVALID_RUNS'`: delivery facts
- `'INVALID_PENALTY'`: other events
- `'SEQ_OUT_OF_ORDER'`: log integrity

### `EVENT_WARNING_CODES`

Non-blocking notices returned with a successful validation (the UI may ask for confirmation).

### `ValidationMode`

`append`: gate before persisting a NEW event — every rule blocks, including stale context stamps
(`CONTEXT_MISMATCH`). `replay`: re-validation of a STORED event — stamp mismatches are downgraded to a
warning-severity `ReplayIssue` and the event is applied with the derived context; every other rule still
blocks (the event is skipped as an error-severity issue).

### `ValidationResult`

Result of validating one event against the state BEFORE it (used before every append AND by replay/history
for every event of a log). `ok: false` means the event must not be persisted/applied.

### `ReplayIssue`

A problem found while replaying a stored log.
- `error`: the event was SKIPPED (invalid, or its seq does not follow the previous event's seq); the match
  `needsRepair`.
- `warning`: the event was applied with a correction (`CONTEXT_MISMATCH` stamp in replay mode).

## `src/domain/types/summary.ts`

### `MatchSummary`

MATCH SUMMARY — the ONLY scoring data the tournament engine consumes (§41, §42, §52, §66).

Produced by the scoring engine (`scoring/summary.ts#buildMatchSummary`) from a replayed, TERMINAL match and
persisted as the recomputable projection `matches.summary_json`. Standings, NRR and tournament statistics
never re-derive scoring from events; any change to a match's log re-builds its summary in the same
transaction, which then triggers tournament recalculation (§16 steps 7–8).

Tournament context (tournament, fixture, stage, pool) is deliberately NOT copied into the summary: the
tournament engine reaches a summary through `Fixture.matchId`, so moving a fixture can never leave a stale copy.
Staleness after an engine fix is tracked by `matches.projection_version` vs `SCORING_PROJECTION_VERSION`
(scoring/summary.ts); `summaryVersion` only tracks this shape.

- `summaryVersion`: Shape version of this object.
- `winnerTeamId`: `resultWinner(result)` — includes a tie decider's winner (knockout advancement).
- `innings`: Regular innings only, in batting order (0, 1). Empty for walkovers / washouts.
- `superOvers`: Super-over innings in order (display + knockout only; NEVER used for NRR or player aggregates).
- `squads`: Playing squads (substitute fielders excluded) — `PlayerTournamentStats.matches` counts a player who neither
  batted nor bowled.

### `InningsSummary`

- `allottedBalls`: Allotted balls AFTER any overs revision (NRR "full quota" for all-out sides, §41).
- `allOut`: Completion counts as all out for NRR: reason `all_out` or `batters_unavailable`.
- `target`: Chase innings only. For a `terminated` chase, par = target − 1 (the same par `icc_par` NRR credits).
- `bestPartnership`: Highest partnership of the innings (tournament "highest partnership", §52); null if no balls.

### `PlayerBattingLine`

Per-player batting line (only players who batted).

- `out`: false for not out / retired hurt / retired not out — used for batting average (§52).

### `PlayerBowlingLine`

Per-player bowling line (only players who bowled).

## `src/domain/types/competition.ts`

COMPETITION RULES AS DATA (§40–§47, §97). Nothing here is hard-coded anywhere else: a tournament has default
rules (`TournamentRules`) and each stage may override points, tie-breakers and NRR (`StageConfig`).

**Points (§40)**

### `BonusPointRule`

Optional ODI-style bonus: the winner earns `points` extra when its run rate ≥ `ratio` × the loser's.

### `PointsSystem`

Points per result (e.g. 2/1/1/0 or 3/1/1/0). Integers; may be negative for exotic formats.
- `abandoned`: null → same as `noResult`.
- `walkoverWin` / `walkoverLoss`: null → same as `win` / `loss`.
- `superOverDecidedTie`: `win_loss` (ICC: a super-over / boundary-count / organizer-decided tie scores as a win
  and a loss, and appears in the W/L columns) or `tie` (both teams get tie points; decider only matters for
  knockout advancement).
- `awarded` results score as win/loss; `awarded` with no winner scores as `noResult`.
- `cancelled` matches score nothing and are not "played".

**Net Run Rate (§41)**

### `NrrMode`

- `icc`: ICC method — a side bowled out (`InningsSummary.allOut`) is deemed to have faced its FULL allotted
  balls (after revision); symmetric for the bowling side. A side that completes a chase early uses the actual
  balls faced.
- `actual_overs`: always actual legal balls (common in local leagues).

### `WalkoverNrrPolicy`

How walkovers affect NRR. ICC: excluded. `notional` credits fixed figures (custom competition rules).

### `NrrConfig`

NRR = (total runs scored ÷ total overs faced) − (total runs conceded ÷ total overs bowled), where overs =
balls ÷ ballsPerOver of each match (so mixed ball-per-over matches still work). Computed ONLY by
`tournament/nrr.ts` from `MatchSummary` (one engine, §41). Super-over runs never count.
- `includeNoResult` / `includeAbandoned` (ICC: false): when true, every innings with ≥ 1 legal ball counts
  (all-out rule still applies).
- `awarded`: `exclude` (default) or `use_played_innings` (innings that were completed are counted).
- `revisedTarget`: `icc_par` — when a chase target was revised, the side batting first is credited with
  (target − 1) runs off the chasing side's allotted balls; `actual` — raw figures.
- Ties count normally. Comparisons treat |a − b| < `NRR_EPSILON` (1e-9) as equal before the next tie-breaker.

**Tie-breakers (§43)**

### `TIE_BREAKER_KINDS`

Ordered comparator kinds. Ranking algorithm (`tournament/tiebreakers.ts`): sort the group by the first
criterion; each subgroup still level is split by the NEXT criterion, recomputed among that subgroup only
(head-to-head is a mini-league of matches between the subgroup's teams). No restart from the top.
- `points` (more), `nrr` (higher), `wins` (more W), `fewer_losses`, `runs_scored` (more, NRR-counted innings),
  `wickets_taken` (more, NRR-counted innings), `seed` (lower pre-tournament seed number first).
- Head-to-head mini-league among the level teams: `head_to_head` (more points), `head_to_head_wins` (more
  wins), `head_to_head_nrr` (higher NRR over the mini-league matches only). A no-result/unplayed mini-league
  leaves them level; with `StageConfig.headToHeadRequiresCompleteMiniLeague` the criterion is SKIPPED (teams
  stay level for the next criterion) unless every pair of the level teams has a counted result.
- `organizer_decision` / `draw_lots`: consume an active `tie_resolution` override for exactly that set of
  teams; if none exists the teams stay level (shared position). Whether that is reported as "decision
  required" is decided by `evaluate.ts` (`StandingsTable.unresolvedTies` vs `provisionalTies`).
  Draw lots is performed by the organizer in-app with a recorded seed — never hidden randomness.

**Qualification (§44, §45)**

### `UnevenPoolNormalization`

Comparing teams across pools of different sizes (§32):
- `raw`: compare the pools' raw figures (points, NRR…).
- `per_match_average`: points per match played, then the stage's tie-breakers.
- `drop_extra_results`: in larger pools, results against the lowest-placed team(s) are discarded until every
  compared team has the same number of matches (FIFA-style), then raw comparison.

### `SlotSource`

Where a stage slot's team comes from (§45). Later stages link to dynamic results.
- `pool_position`: "Pool A winner" (position 1-based, after tie-breakers and overrides).
- `best_of_position`: "best runner-up" = rank `rank` among all pools' teams at `position` in `stageId`.
- `overall_position`: rank in the combined table of all pools of `stageId` ("top 8 overall").
- `bracket_winner` / `bracket_loser`: winner/loser of the MAIN bracket fixture at (`round`, `position`) of
  knockout stage `stageId` (`BracketPosition`, kind `main`). Knockout progression inside a stage ("Winner SF1",
  third place ← SF losers) and `knockout_winners` entry slots of later stages use these, so references survive
  a re-draw that regenerates fixture ids and can be expanded before any fixture exists.
- `fixture_winner` / `fixture_loser`: winner/loser of one specific fixture — only for hand-built `custom`
  stages (IPL-style page playoff: "Loser Qualifier 1" → Qualifier 2).
- `manual`: organizer picks; `teamId` null until chosen. Also used for direct entries (`direct_entry` rule)
  with the team set.

### `QualificationRule`

Builder-level description of how teams ENTER a stage (§44). Stored on the TARGET stage
(`StageConfig.entryRules`) and expanded into concrete `StageSlot`s by `tournament/qualification.ts`
(`expandEntryRules`). Slots are then individually editable (§45); the rules remain as the human explanation
shown in §98 ("Top 2 from each pool").
Examples: top 2 per pool = `[{top_per_pool, count:2}]`; pool winners + best 4 runners-up =
`[{top_per_pool,1},{best_of_position, position:2, count:4}]`; top 8 overall = `[{top_overall, 8}]`;
organizer selects 4 = `[{manual, count:4}]`; Plate for 3rd–4th of each pool =
`[{top_per_pool, fromPosition:3, count:2}]`; last year's finalists skip the group stage =
`[{top_per_pool, count:2}, {direct_entry, teamIds:[…]}]`.
A stage's ENTRANTS are its expanded slots (direct entries included). The first stage's entrants are the
active tournament teams that are not directly entered into a later stage.

- `kind: 'top_per_pool'`: Positions `fromPosition` .. `fromPosition + count − 1` of every pool (default `fromPosition` 1).
- `kind: 'knockout_winners'`: Winners of the LAST PLAYED round of a knockout source stage (e.g. a QF stage with `KnockoutConfig.rounds: 1`
  → SF stage): one `bracket_winner` slot per main-bracket position of that round, computable from the source
  stage's entrant count before any fixture exists.
- `kind: 'direct_entry'`: Teams entering this stage directly (byes past earlier stages); expands to `manual` slots with the team set.

### `SeedingMethod`

Knockout seeding (§46). Every method produces a SEED ORDER (`knockout.ts#seedEntrants`); `knockoutBracket`
then always pairs by standard bracket order (1vN, 2vN−1 … so seeds 1 and 2 can only meet in the final) and
stores each entry slot's seed (`StageSlot.seed`):
- `fixed`: seed order derived from slot sources, cross-pool by pool index and finishing position
  (2 pools → A1 v B2, B1 v A2); entrants without a pool position (best-of, manual, direct entry) are seeded by
  slot index after the pool-positioned ones;
- `random`: seeded random draw (seed stored in `StageConfig.seedingSeed`);
- `ranking`: entrants ranked by their source-stage record (normalised with `StageConfig.seedingNormalization`
  across uneven pools; pre-tournament seed for first-stage knockouts). Generation is refused until every entry
  slot is `final` (`knockout.ts#knockoutGenerationGuard`), so pairings are never built on provisional ranks.
Also used for pool assignment when a stage has seeds (snake seeding for `ranking`).

### `KnockoutConfig`

Knockout options for `knockout` stages; `knockoutAdvancer` falls back to `DEFAULT_KNOCKOUT_CONFIG` for stages
without one (`custom` page playoffs).
- `rounds`: bracket rounds this stage plays; null = until one winner remains. A QF-only stage feeding a
  separate SF stage has `rounds: 1`.
- `tiedMatch`: tied knockout match. `super_over` → `startFixtureMatch` forces `rules.superOver.enabled` for
  the fixture; a tie still undecided after the super over(s) → `organizer_required`. `higher_seed` uses the
  entry slot's `StageSlot.seed` (else the pre-tournament seed).
- `noResult`: abandoned / no-result knockout match. `higher_seed` (ICC: the higher group finisher advances),
  `replay`/`organizer` → organizer action, `shared` → both are declared winners (only meaningful for a
  champion-deciding final: joint champions; elsewhere treated as `organizer`).

### `TournamentRules`

Tournament-wide defaults (`tournament_rules` row). Stages inherit unless they override.

**Manual overrides (§47, §54)**

### `OverrideBase`

- `reason`: Mandatory, shown next to the "Manual Override" badge and in the audit log.
- `revokedAt`: Overrides are never deleted: revoking keeps history (§53).

### `TournamentOverride`

Organizer decisions layered on top of automatic calculation. Always visible as "Manual Override" and audited.
- `qualification`: `qualify` (team takes `slotId` in `stageId`, displacing the automatic occupant), `eliminate`
  (team cannot occupy any automatic slot of `stageId`; the next eligible team moves up), `reassign` (move a
  team into `slotId` / `poolId` of `stageId`).
- `points_adjustment`: ± points in a stage/pool table (penalties, slow over-rate).
- `tie_resolution`: final order for a set of level teams (`organizer_decision` or `draw_lots` with seed).
- `slot_assignment`: fill a `manual` slot (or pin any slot) with a team.
- `expunge_results`: exclude every result involving `teamId` from `stageId` tables (withdrawn team).
- `champion`: the organizer declares the champion(s) — e.g. joint winners after a washed-out final, or a
  final with `noResult: 'organizer'`. Wins over the computed champion.
Ids of stages/pools/slots are kept in the stored payload for history; the indexed FK columns are set to NULL
when the referenced row is deleted, so a revoked override never blocks re-expanding slots.

## `src/domain/types/tournament.ts`

TOURNAMENT STRUCTURE (§24–§39, §45, §46, §62). Supports ≥ 128 teams: nothing is sized for a fixed count.

### `TOURNAMENT_STATUSES`

§62 state machine (guards in `tournament/stateMachine.ts`, doc STATE_MACHINES.md):
draft → registration → structure_configured → pools_configured → fixtures_generated → active → completed →
archived. Backward steps are allowed before any match starts; `completed → active` (reopen) is audited.

### `TournamentStructureKind`

§28 top-level structure chosen in the wizard (drives defaults; the stage list is authoritative).

### `Tournament`

Tournament information (§26).

### `TournamentTeam`

A team's membership of a tournament (§27, §33). `replaced` keeps the historical row when Team X is replaced
by Team Y (the replacement gets its own row); `withdrawn` teams keep past results unless expunged by override.
What happens to a replaced team's played results is chosen on `team_replace.priorResults`:
- `transfer_to_replacement`: Y's row has `inheritsFromTeamId = X`; Y's standings row aggregates X's results
  (opponents keep theirs);
- `keep_for_opponents`: X stays a (non-qualifying) row of the table so opponents keep what they earned; Y
  starts from zero;
- `expunge`: an `expunge_results` override removes every result involving X.

- `seed`: Optional pre-tournament seed (1 = strongest). Editable through `team_seeds_change` (audited).
- `inheritsFromTeamId`: Predecessor whose results this team inherits (`transfer_to_replacement`), else null.

### `StageType`

- `league`: one table, all teams (a single implicit pool).
- `group`: several pools, each a round robin table.
- `knockout`: bracket; fixtures carry `bracket` positions; no table.
- `custom`: manual fixtures; table computed if the stage has pools.

### `StageStatus`

`pending` = not started (entrants may be unresolved); `active` = fixtures confirmed / play under way.

### `FixtureGenerationConfig`

§35: single RR = `legs: 1`, double RR = `legs: 2`, custom encounters per opponent = `legs: n`. Default for the stage's pools (`Pool.legs` overrides).

### `StageConfig`

Per-stage configuration (§29). `null` overrides inherit from `TournamentRules`.
`entryRules` describe how teams enter this stage (§29 "teams entering"); they are expanded into entry
`StageSlot`s. A stage's entrants = its entry slots (incl. `direct_entry`). A stage with no entry rules takes
the active tournament teams that are not directly entered into another stage (normally only the first stage).

- `seedingSeed`: Seed used by the last random pool assignment / knockout draw (reproducible, shown to the organizer §31).
- `seedingNormalization`: Cross-pool normalisation used to rank entrants for `ranking` seeding (§32).
- `headToHeadRequiresCompleteMiniLeague`: See `TIE_BREAKER_KINDS`: skip head-to-head criteria unless every pair of the level teams has a counted result.
- `abandonedMatches`: Abandoned / no-result matches of this stage: counted as no result, or the fixture may be rescheduled for a
  replay (source of `canTransitionFixture` `replayAllowed`). Knockout stages use `knockout.noResult`.
- `decidesChampion`: This stage decides the tournament champion (exactly one stage per tournament; the wizard sets it on the
  last stage of the main chain, so a Plate stage ordered last never produces the champion). Knockout: winner of
  the stage's final (`Fixture.isFinal`); league/one-pool group: top of the table once complete; custom: the
  fixture marked `isFinal`.
- `formatId`: Default match format/rules for this stage's fixtures (e.g. final = 20 overs, groups = 10).

### `Stage`

- `orderIndex`: 0-based, unique per tournament: evaluation and display order. Parallel stages (Cup and Plate fed by the
  same group stage) simply get consecutive indexes and are independent — dependencies come only from slot
  sources, and every source stage must have a LOWER orderIndex than the stage it feeds.

### `Pool`

Pool / group (§30). `league` stages have exactly one pool. Names default to "Pool A", "Pool B"…

- `legs`: Round-robin legs for this pool; null = the stage's `fixtureGeneration.legs` (uneven 4/3/3 pools: 3-team pools double RR).

### `FixtureSide`

A fixture side or pool member: a concrete team, or a stage SLOT resolved dynamically from earlier results
(§45) — e.g. Super 8 groups built from "A1", "B2" before the group stage finishes.

### `PoolEntry`

Pool membership (§30, §33). A team (or slot) appears in at most one pool per stage (DB UNIQUE). Slot members
build later-stage pools from qualifiers (Super 8 Group 1 = A1, B2, C1, D2) before they are known; every pool
API (assignment, move, swap, replace, pools_replace) works on `FixtureSide`.

### `StageSlot`

A qualification slot of a stage (§45).
- `role: 'entry'`: how a team ENTERS the stage ("Semifinal slot 1 ← Pool A winner", direct entries). Entry
  slots define the stage's entrants; a team may occupy only ONE entry slot per stage.
- `role: 'progression'`: knockout progression INSIDE the stage ("Final side A ← Winner SF1"; source kind
  `bracket_winner`/`bracket_loser`/`fixture_winner`/`fixture_loser` of this same stage). A progression slot
  is naturally occupied by a team that also holds an entry slot; the one-slot rule never applies to it.
`index` is unique per stage: entry slots 0..n−1 in rule order, progression slots after the highest entry
index. `seed` is the bracket seed of an entry slot (set by `knockoutBracket`; drives `higher_seed`), else null.

- `label`: Short human label: "A1", "B2", "Best runner-up", "Winner SF1".

### `FIXTURE_STATUSES`

§38/§39 fixture lifecycle: scheduled → postponed → rescheduled → live → completed; scheduled → cancelled;
live → abandoned. `live | completed | abandoned` MIRROR the fixture's current match (updated by services in
the same transaction); `scheduled | postponed | rescheduled | cancelled` are owned by the fixture.
A paused match shows as `live` at fixture level. An abandoned fixture may be `rescheduled` for a replay (new
match) when the stage allows it (`StageConfig.abandonedMatches` / `KnockoutConfig.noResult: 'replay'`):
rescheduling sets `matchId = null` in the same transaction, so the abandoned result stops counting while the
replay is pending; the old match keeps its `fixtureId` for history.

### `BracketPosition`

Knockout placement: `round` 1 = first round; `position` 0-based within the round (bracket order) and kind.
- `main`: the championship bracket. The stage's final is the single `main` fixture of its last round.
- `third_place`: SF losers' play-off (same round number as the final, position 0); never a source of
  `knockout_winners` and never the champion.
- `placement`: other classification fixtures (5th–8th…), organizer-built.
(`kind`, `round`, `position`) is unique per stage.

- `roundName`: "Quarterfinal", "Semifinal", "Final", "Third place", "Round of 16"…

### `Fixture`

- `matchNumber`: 1-based running number across the tournament ("Match 12").
- `label`: Optional display label ("SF1", "Final", "Eliminator").
- `round`: Round-robin round (1-based) — null for manual fixtures.
- `leg`: Round-robin leg (1-based) — null unless generated with legs.
- `isFinal`: The winner of this fixture wins the stage (and the tournament when the stage `decidesChampion`). Set by
  `knockoutBracket` on the main final; set by the organizer for a custom stage's final. At most one per stage.
- `matchId`: CURRENT match for this fixture (the replay if an abandoned fixture was replayed). A replay sets it to null
  until the replay match starts; the superseded match is listed in `TournamentSnapshot.supersededMatches`.
- `matchSides`: FROZEN SIDES (read model, joined from the current match row — never stored twice). Once a fixture has a
  match, its sides are the match's teams (`startFixtureMatch` creates the match with teamA = side A's team at
  that moment) and are NEVER re-resolved from slots: a later correction that changes who "A1" is cannot
  rewrite a semifinal that was already played. null while the fixture has no match.
- `formatId`: Per-fixture overrides (§37, §38); null = inherit stage → tournament defaults.

### `FixtureDraft`

A generated or manually drafted fixture awaiting confirmation (§36 Generate → Preview → Edit → Confirm).
Ids are pre-assigned by the generator (injected `IdGenerator`) so a custom stage's slots can reference
`fixture_winner` sources inside the same preview (knockout progression references bracket positions and never
depends on fixture ids); nothing is persisted until the organizer confirms.

### `TournamentTeamView`

A tournament team joined with its library team record (display).

### `TournamentSnapshot`

Everything the tournament engine needs, loaded in one read by TournamentRepository. Pure data; every
tournament computation (standings, NRR, qualification, what-if, impact) is a function of a snapshot.
`summaries` holds `MatchSummary` for every TERMINAL current match of the tournament (fixtures.match_id),
keyed by matchId.
`version` = the tournament's revision counter (`tournaments.revision`), bumped in EVERY transaction that writes
the tournament aggregate, a fixture mirror or a summary of one of its matches. Mutations that were previewed
carry the previewed version and fail with `CONFLICT` if it moved (preview == apply).
`staleSummaryMatchIds`: matches whose projection was built by an older scoring engine
(`projection_version < SCORING_PROJECTION_VERSION`) and could not be rebuilt yet; the UI flags them.
`supersededMatches` (optional, additive, wave 3): every match that was played for a fixture and then replaced by a
replay of that fixture (`matches.fixture_id` = the fixture, `fixtures.match_id` ≠ the match), oldest first, as
`SupersededMatch { fixtureId, matchId }`. `TournamentRepository.getSnapshot` always fills it (possibly `[]`);
hand-built snapshots may omit it (= none). These matches keep their rows, events, summary and audit trail
(§59, §99), but their summaries are not in `summaries` and their results never count anywhere.

**Result counting rule (wave 3, binding for every tournament engine).** A fixture's result counts exactly when the
fixture is `completed` or `abandoned`, has a current `matchId`, and that match has a summary
(`countedFixtureSummary(snapshot, fixture)`). Standings, NRR, form, head-to-head, qualification, knockout
advancement, tournament statistics, the what-if engine (a fixture is "played" when its status is `completed` or
`abandoned`) and the impact summaries all use this one rule. Stage and tournament progress count `completed`,
`abandoned` and `cancelled` fixtures, so progress and the tables always agree: a fixture whose status left
`abandoned` (a replay) counts as unplayed everywhere, even in a hand-built snapshot that still carries its old
`matchId`.

### `SupersededMatch`

Additive (wave 3). `{ fixtureId, matchId }`: a match kept on record after its fixture was replayed. See
`TournamentSnapshot.supersededMatches`.

## `src/domain/types/standings.ts`

Outputs of the Tournament Statistics Engine (§41, §42, §43, §50, §51, §52, §98). All derived from a
`TournamentSnapshot`; never persisted as truth.

### `FormResult`

Result letter for the form guide (most recent LAST). `N` = no result / abandoned.

### `TieBreakNote`

Why this row sits above the next row (§98 "explain automation"). `null` separatedBy = not level on points
with the row below (points alone decided), or last row.

- `detail`: e.g. "Ahead of Lions on net run rate (+0.512 vs +0.231)".

### `QualificationTarget`

Status of one team with respect to ONE downstream stage (a stage with entry slots sourced from this stage).

- `slotIds`: Entry slots of `stageId` the team currently occupies.

### `TeamQualification`

Qualification status (§51) — never colour-only: `explanation` is always shown.
- `certainty: 'mathematical'` — true for EVERY possible outcome of the remaining fixtures (or the stage is
  complete); `provisional` — current table only; `manual` — decided by an override (badge "Manual Override").
- `targets`: one entry per downstream stage fed by this stage (Cup and Plate in parallel). The top-level
  `state / certainty / targetStageId / slotIds` summarise the PRIMARY target: the lowest-orderIndex target in
  which the team is qualified, else in contention, else the first target (eliminated from everything).
Examples: "Tigers have mathematically qualified for the Semifinal." / "Lions are still in contention." /
"Eagles are out of the Cup but have qualified for the Plate semifinal as Pool A 3rd."

- `targetStageId`: Primary target stage (see above) and the slot(s) the team currently occupies there.

### `StandingRow`

One standings row (§42, §50). NRR inputs are AFTER the all-out adjustment of the configured NRR mode.
`played` counts completed + no-result + abandoned + walkover + awarded matches; cancelled never counts.
Rows exist for every pool MEMBER (team or slot), so a Super 8 group shows all its rows before qualifiers are
known: an unresolved slot row has `teamId: null` and renders `slotLabel` ("A1"); a provisionally resolved slot
row renders "A1 · Tigers (provisional)". Replaced/withdrawn predecessors whose results are kept for opponents
appear with `membership` ≠ `active`, rank normally for display, but never occupy a qualification slot.

- `position`: 1-based; equal positions possible only when tie-breakers cannot separate (`sharedPosition`).
- `side`: The pool member this row stands for.
- `slotLabel`: Slot label for slot members ("A1"), else null.
- `teamId`: Resolved team; null while a slot member is unresolved.
- `provisional`: The slot member's team is only provisionally known.
- `noResult`: No result + abandoned (§50 "NR").
- `points`: Points from results + bonus + manual adjustments.
- `oversFaced`: Decimal overs (Σ balls ÷ ballsPerOver per match) used by NRR.
- `runRate`: Runs per over scored; null with 0 overs.
- `nrr`: null when no NRR-counted match yet.
- `form`: Last 5 results, most recent last.

### `StandingsTable`

- `poolId`: null for an overall (cross-pool) table.
- `tieBreakers`: Effective tie-breaker chain, for the §98 explanation "Points → NRR → Head-to-Head".
- `complete`: All fixtures of this pool are terminal or cancelled.
- `unresolvedTies`: Level groups that REQUIRE an organizer decision / draw of lots now: the table is complete (or the tie is
  mathematically final) and the group straddles a slot boundary of a downstream stage (e.g. 2nd/3rd with top 2
  qualifying). Set by `evaluate.ts`; `computeStandings` reports every level group in `provisionalTies`.
- `provisionalTies`: Level groups (shared positions) with no call to action (table incomplete, or no slot boundary at stake).

### `SlotResolution`

Resolution of one stage slot (§45).

- `status`: `final`: source decided (stage complete / fixture terminal / mathematical / manual); `provisional`: current table; `pending`: unknown.
- `explanation`: "Pool A winner: Tigers (8 pts)".

### `ChampionResult`

Tournament champion (§82), from the stage with `decidesChampion`. `teamIds` has one team, or several for
joint winners (`shared`: final washed out with `KnockoutConfig.noResult: 'shared'`, or a `champion` override
naming several teams). `manual` = `champion` override.

### `ComparisonTable`

A cross-pool comparison table (§32, §98): the overall table and, for every `best_of_position` source, the
table of all pools' teams at that position (e.g. runners-up), each under its own normalisation. Renders
"Lions are the best runner-up: 6 pts, NRR +0.41, ahead of Tigers".

- `key`: Stable key, e.g. `overall:raw`, `position:2:per_match_average`.
- `position`: Pool position compared (2 = runners-up); null for the overall table.

### `StageEvaluation`

Evaluation of one stage, in the order stages run.

- `tables`: One table per pool (a league stage has one); empty for knockout stages.
- `overall`: Combined raw table across pools (§50 overall view); null with ≤ 1 pool.
- `comparisonTables`: Every cross-pool table a downstream slot source needs (overall and best-of-position, per normalisation).
- `slots`: Resolution of THIS stage's slots (entry and knockout progression).
- `qualification`: Status of this stage's teams with respect to EVERY downstream stage fed by it (`TeamQualification.targets`);
  empty when no stage takes entrants from this one.
- `progress`: Fixtures terminal or cancelled / total fixtures of the stage.

### `TournamentEvaluation`

Whole-tournament evaluation (`tournament/evaluate.ts#evaluateTournament`) — what the dashboard renders (§49).

- `currentStageId`: First stage not complete (the "current stage"), else the last stage.
- `progress`: §49 "matches progress (24/48)".

**Tournament statistics (§52)**

### `PlayerTournamentStats`

- `matches`: Matches in which the player was in the playing squad (`MatchSummary.squads`), batted/bowled or not.
- `battingAverage`: runs ÷ dismissals; null when never dismissed.

## `src/domain/types/impact.ts`

WHAT WILL CHANGE (§34, §55, §99) and WHAT-IF (§48). Both are pure functions over a `TournamentSnapshot`
(`tournament/impact.ts`, `tournament/whatif.ts`) and never mutate the real tournament.

### `FixturePatch`

Editable fixture fields (§38). `undefined` = unchanged. `status` is limited to the organizer-owned scheduling
states; `live | completed | abandoned` mirror the match and are written only by MatchService.

- `isFinal`: Organizer-marked final of a custom stage (see `Fixture.isFinal`).

### `ProposedChange`

A change the organizer is about to make; `computeImpact` previews it and `planChange` turns it into the exact
row operations that are persisted. Every id a change creates is carried IN the change (prefilled by helpers),
so preview and apply are the same computation.

- `kind: 'pool_move'`: §33 Move: the member leaves its pool for `toPoolId`. Its UNPLAYED fixtures in the source pool are deleted
  (`removeFixtureIds`) and fixtures against the target pool's members are created (`addFixtures`, with the
  pool's legs); played fixtures keep their teams and pool. Prefill both lists with
  `tournament/fixtures.ts#fixturesForPoolMove`.
- `kind: 'pool_swap'`: §33 Swap: members exchange pools and take over each other's UNPLAYED fixtures; played fixtures are kept.
- `kind: 'team_replace'`: §33 Replace: Y takes X's pool entries and X's UNPLAYED fixtures; X's membership becomes `replaced`.
  `priorResults` decides X's PLAYED results (see `TournamentTeam`); recorded in the audit entry.
- `kind: 'team_withdraw'`: Withdrawal. `walkover`: every remaining fixture gets a real match with a `match_ended { walkover }` event for
  the opponent (created by the plan — the log stays the truth); `cancel`: remaining fixtures are cancelled.
- `kind: 'pools_replace'`: Replace a stage's pool arrangement (members may be teams or slots). `seed` of the random draw, if any (§31).
- `kind: 'team_seeds_change'`: §27 seeds (drives `seed` tie-breaker, snake seeding, ranking seeding of first-stage knockouts).
- `kind: 'stage_upsert'`: Add or edit a stage (with its pools and slots). Once play has started only FUTURE stages may change (§55).
  The plan re-expands the entry slots of every stage that sources this stage, keeping slot ids by
  (stage, slot index), in the same transaction.
- `kind: 'fixture_update'` (replay, wave 3): `patch.status: 'rescheduled'` on an `abandoned` fixture is the §39 REPLAY.
  It is previewable like any change: `computeImpact` is blocked only when `fixtureReplayGuard` refuses it (the stage
  keeps abandoned matches as no results, or the tournament status forbids schedule edits). The plan
  (`supersedeFixtureMatch`) sets the fixture to `rescheduled` with `matchId` and `matchSides` null and keeps the
  patch's date, time, venue, notes and label; `applyPlan` appends the detached match to
  `TournamentSnapshot.supersededMatches`. The impact lists the fixture (`status_changed`, `hasMatchData` true),
  adds "Match N · A v B will be replayed as a new match." and "The abandoned match stays on record, but its no
  result stops counting in the standings, net run rate and statistics.", shows the standings, NRR and
  qualification changes, and is `destructive` with `requiresReason` and `requiresConfirmation`. Any other schedule
  or status edit of a fixture with a match stays blocked ("…has already been played, so it can't be rescheduled.").
- Fixtures with match history (a current match, or a superseded match after a replay) are never deleted by a plan:
  `fixtures_replace`, `pools_replace` and `stage_upsert` keep them like played fixtures, `pool_move` drops their
  ids from `removeFixtureIds`, and an explicit deletion (`fixture_delete`, `stage_delete`, or a plan that still
  lists one) is blocked with "Match N keeps an abandoned match on record from before its replay, so it can't be
  deleted." (the DB foreign key from the kept match would otherwise fail). `TournamentGuardContext.matchesStarted`
  counts these fixtures too, so a replay never makes a tournament look unstarted.
- `kind: 'fixtures_replace'`: Replaces the fixtures without a match of a stage (or pool) and upserts `slots` (knockout progression). A
  knockout re-draw keeps bracket-position slot sources valid (`bracket_winner`), and the plan re-expands
  dependent stages' entry slots. `seed` = the draw's seed (persisted to `StageConfig.seedingSeed`).
- `kind: 'match_result_change'`: Historical edit / reopen / correction of a match: `summary` null = the match is no longer terminal.
- `kind: 'rules_change' › stageId`: null = tournament defaults.

### `FixtureImpact`

- `label`: "Match 12 · Lions v Tigers".
- `hasMatchData`: The fixture already has a started/terminal match (its data is at stake).

### `StandingChange`

Every table row (per stage, pool and team) whose line — position, points or NRR — differs between the
evaluation before and after the change. Rows that join a table are listed with `before: null` and rows that
leave it with `after: null`, even when the team has played nothing (a 0-point row entering Pool B after a
`pool_move` is a change to Pool B's table, §34). Used identically by `computeImpact` and `simulate`.

### `SlotChange`

A slot whose occupant changes. `playedFixtureIds`: fixtures the OLD occupant already started/played through
this slot. Their sides are frozen (`Fixture.matchSides`), so accepting the change NEVER rewrites them: the
played results stand as played (knockout progression keeps following the actual match result) and the slot
view shows the conflict. The organizer may instead keep the old occupant by pinning the slot
(`slot_assignment` override) — both choices are audited.

### `ImpactSummary`

The WHAT WILL CHANGE sheet (§34): "[Cancel] [Continue]". Stored verbatim in the audit entry when confirmed.
- `blocked`: the state machine forbids the change (e.g. deleting a fixture whose match is completed).
- `requiresConfirmation`: any completed data, standings, qualification or NRR affected (§55).
- `requiresReason`: historical change to completed match data or an override.

- `headline`: "This change affects 6 fixtures, 2 of them completed."
- `lines`: Bullet lines, most important first.

**Change plan (preview == apply)**

### `ChangePlan`

The exact row operations a `ProposedChange` performs (`tournament/impact.ts#planChange`, pure).
`computeImpact` evaluates `applyPlan(snapshot, plan)`; `TournamentService.applyChange` persists THE SAME plan
in one transaction (repositories only execute it — no second interpretation of the change). Apply order:
tournament teams → stages → pools → slots (two-phase index update) → pool entries → fixtures → overrides →
matches to create (each with its events, e.g. walkovers) → audit.
`summaryChanges` exist only for previews of `match_result_change` (MatchService writes the match itself).

- `poolEntries`: Full replacement of the pool entries of each listed stage.
- `matchesToCreate`: New matches with their opening/closing events (walkovers of a withdrawn team), linked to `fixtureId`.

**What-if (§48)**

### `HypotheticalOutcome`

Hypothetical result of an unplayed fixture. `tie` may carry `tieWinner` (super-over / other decider);
`abandoned` and walkovers score per `PointsSystem.abandoned` / `walkoverWin|Loss`.

### `HypotheticalScore`

Optional hypothetical score so NRR moves too; without it NRR is unchanged for that fixture.

### `HypotheticalResult`

- `tieWinner`: Only with `tie`: the side that won the super over / decider (null = the tie stands).
- `bonus`: Only with a win: the winner also earns the `PointsSystem.bonus` point(s).

### `WhatIfResult`

- `narrative`: "If Lions beat Tigers, Lions qualify for the Semifinal as Pool A winners."

## `src/domain/types/audit.ts`

### `AUDIT_ACTIONS`

Audit log (§53; §58 `tournament_events`, stored as table `audit_events`). Append-only: every structural or
historical change to a tournament — and every historical correction of any match, standalone or not, live or
completed — writes one entry in the SAME transaction as the change (§89). Live ball-by-ball scoring and plain
undo/redo during live play are NOT audited (the event log itself is the record).
`match_history_edited` / `result_corrected` always store `previousValue` = the removed/replaced `MatchEvent`s
and `newValue` = the inserted ones, so a mistaken edit can be reverted by hand.
Rules, toss and squad changes of a live/completed or tournament match (edit policy `confirm`) use
`match_rules_changed` / `match_toss_changed` / `match_squad_changed`.

- `'tournament_created'`: tournament lifecycle / info
- `'team_added'`: teams & pools (§33)
- `'stage_created'`: stages & slots
- `'fixtures_generated'`: fixtures (§38, §39)
- `'match_started'`: results (§16, §55)
- `'override_applied'`: overrides (§47)
- `'backup_imported'`: data

### `AuditEntityType`

`backup` for `backup_imported` (entity id = the envelope's `exportId`); `app` for app-level entries.

### `AuditEvent`

- `tournamentId`: null for corrections of standalone matches.
- `summary`: Human summary, e.g. "Moved Lions from Pool A to Pool C".
- `impact`: Snapshot of the WHAT WILL CHANGE preview the organizer confirmed (§34, §99), if any.

## `src/domain/types/template.ts`

Tournament templates (§56): reusable STRUCTURE without teams, ids or results (e.g. "8-Team T20: 2 pools × 4,
round robin, top 2 qualify, semifinal, final"). Built-ins live in `tournament/templates.ts`; user templates in
`tournament_templates`. Stages reference each other by local `key`, pools by index, so a template can be
instantiated any number of times (`instantiateTemplate`).

### `TemplateEntryRule`

- `kind: 'direct_entry'`: `count` teams enter this stage directly; chosen when the template is instantiated (manual slots).

### `TemplateStage`

- `key`: Local reference unique within the template ("groups", "sf", "final").
- `poolCount`: 1 for league, ≥ 1 for group stages, 0 for knockout.
- `poolSizes`: Explicit pool sizes (uneven allowed, §32) or null for an even split.
- `poolSlotIndexes`: For stages whose pools are built from qualifiers (Super 8 Group 1 = A1, B2, C1, D2): the ENTRY-SLOT indexes
  placed in each pool, in pool order. null = pools are filled by assignment (random/seeded/manual) instead.

### `TournamentTemplate`

- `teamCount`: Number of teams the template is designed for; null = any (league).

## `src/domain/types/backup.ts`

### `BACKUP_FORMAT`

JSON backup (§84, `tournament-backup.json` / `scorebook-backup.json`).

Contains AUTHORITATIVE data only. Projections (innings rows, partnerships rows, `matches.summary_json`,
match result/status for started matches) are recomputed on import by replaying each match — a corrupt or
hand-edited projection can therefore never be imported. Logos (`logoUri`) are not embedded (local file URIs
are device-specific) and are cleared on import unless the file exists.

Import pipeline (`export/backup` + BackupService): parse → envelope check (format, versions) → checksum →
structural validation → referential integrity (every id reference resolvable inside the file or already in
the database; the reference list comes from `export/backup/remap.ts#collectIdReferences`, the same list the
id remapper uses) → replay every match log (no error-severity `ReplayIssue`) → conflict detection per
AGGREGATE against existing data → preview (`ImportPreview`) → organizer chooses a policy → single
transaction → projections rebuilt by replay → audit `backup_imported`. Never silently overwrite.

### `BACKUP_FORMAT_VERSION`

Version of the envelope/data shape below (not the DB schema).

### `BackupData`

Row collections, parents first. Import inserts them in this order inside ONE transaction. The circular
cross-references (stage_slots ↔ fixtures, fixtures ↔ matches, pool_teams → stage_slots, teams → captain) are
`DEFERRABLE INITIALLY DEFERRED` foreign keys checked at COMMIT, so the order inside the transaction does not
matter for them and a dangling reference still aborts the whole import.

- `settings`: Only in `full` backups; never auto-applied on import (the organizer opts in).

### `BackupEnvelope`

- `exportId`: UUID of this export; recorded by `backup_imported` so a re-import is recognised ("already imported on …").
- `schemaVersion`: DB schema version (latest applied migration) of the exporting app. Newer than ours → reject.
  Schema versions start at 1 (`001_initial`): anything that is not an integer ≥ 1 is refused (`INVALID_VALUE`
  at `schemaVersion`, import impossible).
- `checksum`: SHA-256 (hex) of the canonical JSON of `data` (keys sorted); null only for hand-made files (warning).
  Absent/null → `CHECKSUM_MISSING` warning only; any other value that is not 64 hex characters, or that does not
  match the data → `CHECKSUM_MISMATCH` error only. The two codes are exclusive for one file. The canonical
  JSON writer never throws on deep nesting (it falls back to an iterative writer), so a hostile, deeply nested
  file becomes a `BackupIssue`, never an exception.
- Validation also refuses what the database would reject at COMMIT: e.g. the same venue twice in
  `Tournament.venueIds` (`tournament_venues` primary key) → `DUPLICATE_ID` at `data.tournaments[i].venueIds[k]`.

### `BackupIssue`

- `path`: JSON path of the offending value, e.g. `data.matches[3].teamAId`.

### `ImportAggregateKind`

Unit of conflict detection and policy: an AGGREGATE, never a single row.
- `tournament`: tournament + rules, teams entries, venues links, stages, pools, slots, pool entries, fixtures,
  its matches (squads, events), overrides, audit entries.
- `match`: a standalone match + squad + events.
- library rows (`team` incl. its players, `player`, `venue`, `template`, `preset`).

### `ImportConflictPolicy`

How to treat aggregates whose root id already exists locally. Chosen explicitly by the organizer.
- `skip_existing`: the whole aggregate is skipped (no rows of it are inserted — never a merged tournament).
- `import_as_copy`: every id of the file is remapped (`remapBackupIds`) and the data is inserted as new
  aggregates; nothing local changes.
- `replace_existing`: each conflicting tournament/match aggregate is DELETED explicitly (after the preview
  listed local-only matches/events that will be lost) and then inserted from the file. Library rows are updated
  in place with `INSERT … ON CONFLICT(id) DO UPDATE` (never delete + insert, which would cascade).
  `INSERT OR REPLACE` is forbidden in repositories.
Library rows (teams, players, venues, templates, presets) that exist locally are always reused under
`skip_existing`.

### `ImportConflict`

- `localOnly`: Local rows that `replace_existing` would destroy and the file does not contain (e.g. matches scored locally).

### `ImportPreview`

- `ok`: false when any `error` issue exists — import is impossible.
- `previouslyImportedAt`: Set when a backup with the same `exportId` was imported before (from the audit log).
- `source` (additive, wave 2, optional): the file's header as an `ImportSource`, for the import summary (W-X1,
  BACKUP_RESTORE §10). `validateBackup` fills it whenever the envelope parsed, also for a file with errors (so the
  organizer sees which backup failed); it is absent or null when the file could not be parsed.

### `ImportSource`

Additive (wave 2). `exportId`, `formatVersion` and `schemaVersion` as written in the file (before any upgrade),
`exportedAt`, `appVersion` and `platform` from `BackupEnvelope.app`, and optional `title`: the tournament name of a
tournament backup or the match title (`"Lions v Tigers"` when the match has no title) of a match backup; null for a
full backup or when the scoped row is missing.

## `src/domain/types/settings.ts`

### `ThemePreference`

Application settings (§5 Settings, §70, §76, §77, §78). Stored as key/value JSON in `app_settings`
(one row per top-level key) and cached in the settings store. Defaults live in `services/settings`.

### `ScoringPreferences`

- `confirmInningsEnd`: Ask for confirmation before ending an innings by declaration or "batters unavailable".
- `autoPromptBowler`: Open the bowler picker automatically at the end of an over.
- `dotStyle`: Show a dot ball as `0` (default) or `•` in the current-over strip.
- `keepAwake`: Keep the screen awake on the live scoring screen.
- `padHand` (additive, gap G-11, V1): the side of the screen the scoring pad's primary keys sit on (`PadHand`,
  `'right'` | `'left'`, ACCESSIBILITY §9). Optional: absent means `'right'`, so settings stored before the field
  existed stay valid. Backup validation accepts it absent or as one of the two values.

### `AppSettings`

- `reducedMotion`: `system` follows the OS reduced-motion setting (§78).

## `src/domain/types/readModels.ts`

READ MODELS for lists (home, history, tournaments). Pure data shapes produced by repositories from projections
(no replay needed) and consumed by services, stores and UI. They live in the domain types so the UI never
imports from `src/db` (CLAUDE.md layering).

### `InningsLine`

Innings score line from the `innings` projection.

### `MatchListItem`

Match card for home "Continue", recent matches and history (§23, §79, §81).

- `resumeDismissedAt`: §23 SAVE & EXIT: excluded from the startup resume prompt (still listed under Continue Match).

### `MatchListQuery`

- `search`: Case-insensitive substring match on the title, either team's name or either team's short name. The text is
  trimmed; a blank search applies no filter. Case folding is Unicode, not ASCII-only (NFR-S-17): both sides are
  NFKC-normalised and case-folded in TypeScript (`toUpperCase().toLowerCase()`, final sigma treated as sigma), so
  "élan" finds "Élan XI", "одесса" finds "Одесса" and "strasse" finds "Straße"; accents are significant ("elan"
  does not find "Élan"); scripts without case (Urdu, Hindi) match as typed. Every character is literal (`%`, `_`,
  quotes and backslashes are not wildcards). The other filters and the sort run in SQL; with a search the repository
  filters the sorted candidates in TypeScript and applies `offset`/`limit` to the matches, so paging stays exact.

### `TournamentListItem`

- `fixturesDone`: Counted in SQL from `fixtures.status` (terminal or cancelled / all).
- `championName`: Champion name(s) once decided (§82), joined from the `tournaments.champion_json` projection ("Lions" or
  "Lions & Tigers" for joint winners). The projection is written by services from `evaluateTournament`
  whenever the champion can change; repositories never compute it.

## `src/domain/types/index.ts`

Domain type contract — the shared language of every layer. Import from `@/domain/types`.

Ownership: this folder is the architecture contract (WP-0). Implementation packages may ADD optional fields or
new union members only through the change process in docs/CONTRACTS.md; they never rename or remove.

## `src/domain/index.ts`

Domain barrel. Prefer the narrower entry points (`@/domain/types`, `@/domain/scoring`, `@/domain/tournament`)
in feature code; this barrel exists for services that orchestrate both engines.

## `src/domain/scoring/index.ts`

Cricket rules engine public API (§60 "CricketRulesEngine"). Import from `@/domain/scoring`.
Owner: WP-scoring-engine.

## `src/domain/scoring/battingOrder.ts`

Additive (wave 3). Who bats first in innings 1, as one pure rule shared by the setup store, the setup wizard and
the tests. The team order (A/B) never decides it.

### `MatchSides`

`{ teamAId, teamBId }` of a match or a setup draft.

### `tossBattingTeam`

`tossBattingTeam(sides, toss)`: the toss winner when the decision is `bat`, the other side when it is `bowl`; null
when the winner is not one of `sides`.

### `openingBattingTeam`

`openingBattingTeam(sides, toss, chosen)`: with a recorded toss, `tossBattingTeam` (an explicit `chosen` is ignored,
so the opening innings can never contradict the toss and fail `TOSS_MISMATCH`); without a toss, `chosen` when it
is one of `sides`, otherwise null ("not decided", never a guess).

## `src/domain/scoring/replay.ts`

### `replayMatch`

CRICKET RULES ENGINE — event replay (§2 Accuracy, §14, §15, §16, §19, §20, §21, §23, §59).
Owner: WP-scoring-engine.

INVARIANTS (tested):
1. Pure & deterministic: same `(setup, events)` → deep-equal `MatchState`. No clock, no randomness, no I/O,
   inputs never mutated (internal mutable builders are fine if they never escape).
2. Total: never throws for ANY input. Every event is validated with `validateEvent(…, 'replay')` against the
   state before it. An invalid event is SKIPPED and recorded as an `error` issue (`needsRepair = true`); a
   stale context stamp is a `warning` issue and the event is APPLIED with the derived context. Replay always
   continues with the next event.
   Ordering: events must be sorted by `seq`; each seq must equal the PREVIOUS EVENT'S seq + 1 (the previous
   event read, applied or skipped — never "last applied + 1"), else that one event is an error issue
   `SEQ_OUT_OF_ORDER`. One bad event therefore never hides the rest of the log. `state.lastSeq` = seq of the
   last event read (the log tail, used as `expectedLastSeq`); `state.lastAppliedSeq` = last applied.
3. Incremental equivalence: `applyEvent(setup, replayMatch(setup, E), e)` deep-equals
   `replayMatch(setup, [...E, e])` for every E and e. The live store uses `applyEvent` (O(1) per ball);
   undo/edit/resume use `replayMatch` (a 50-over match ≈ 700 events must replay in < 50 ms on a mid phone).
4. Single rule implementation: validation is `validate.ts#validateEvent`, results `result.ts`, tokens and
   text `format.ts`, formulas `stats.ts`. Replay composes them; nothing re-derives them elsewhere.

TEAMS: each team's limits use `setup.teams[i].playersInSide` (per-team size, default `rules.playersPerSide`).
Substitute fielders (`isSubstitute`) are never batting rows, openers, incoming batters or bowlers.

APPLICATION ORDER FOR A `delivery` (after validation — which already rejected a wicket that falls after the
winning runs, Law 16.6 `WICKET_AFTER_RESULT`):
 1. Legality: fair → legal; wide/no-ball → `rules.wide|noBall.countsAsBall`. Ball faced: fair or no-ball.
 2. Numbering: overIndex = ⌊legalBefore / bpo⌋; ballInOver = legalBefore mod bpo + 1; deliveryInOver = n + 1.
 3. Runs (scored running runs r = runsRun − shortRuns): wide → wides = penalty + r + boundary; no-ball →
    noBalls = penalty, plus r + boundary to bat | byes | legByes; fair → r + boundary to bat | byes | legByes.
    bowlerRuns = wides + noBalls + batterRuns.
 4. Batter, bowler, innings, extras, partnership, powerplay-phase and over accumulators (conventions in
    types/events.ts). isFour/isSix only for bat runs with runsRun = 0.
 5. Strike: swap striker/non-striker when `runsRun` (crossings, short runs included) is odd (never for a lone
    last-man-stands batter).
 6. Wicket: striker-only dismissals leave the vacancy at `striker`. Run out / obstructing / handled: the
    position at `dismissalEnd` (striker_end → `striker`, non_striker_end → `non_striker`) becomes the vacancy
    and the not-out batter takes the other position (overrides step 5). Wicket count, FoW, dismissal record,
    bowler credit, partnership closed (`wicket`). With last-man-stands, when wickets reach the batting team's
    `playersInSide − 1`, the survivor becomes a lone striker (no vacancy, `nonStrikerId` null).
 7. Free hit next: no-ball with `rules.noBall.freeHit` → true; current free hit and call wide/no-ball → true
    (carries over); otherwise false.
 8. Over end (legal ball and legalBalls mod bpo = 0): close the OverSummary (maiden rule), swap positions
    (vacancies swap too), `previousOverBowlerIds` = this over's bowlers, `bowlerId` = null.
 9. Innings completion, first match wins: chase runs ≥ target → `target_reached`; wickets ≥ maxWickets →
    `all_out`; legalBalls ≥ maxBalls → `overs_complete`. Unbroken partnership closed (`innings_end`),
    bowler cleared.
10. Natural result (`result.ts#computeNaturalResult`) when the chase (or a super-over pair) is complete.
11. `retirementsDue` (advisory mandatory retirement, `MandatoryRetirementRule.timing`).
12. Recompute `pendingAction`, `canRecordDelivery`, `chase`, `currentRunRate`, `resultText`.

STEPS 9–12 ALSO RUN after `penalty_awarded` and `overs_revised` (both can complete a chase, change a target or
turn a completed tie into a win), after `innings_ended` and after `match_ended`.

OTHER EVENTS: `innings_started` builds the innings (limits per `InningsLimits`: regular = oversPerInnings × bpo
and the batting team's all-out threshold; super over = superOver.overs × bpo and min(superOver.maxWickets,
that threshold); applies `plannedRevisions` and the `carriedPenalties` for its index; batting rows = the
batting team's non-substitute squad as yet_to_bat except the openers; target for chase innings).
`bowler_selected` honours its `reason` (`suspended` → `removedBowlerIds`). `overs_revised` updates the current
innings (completing it immediately when maxBalls = legal balls; `terminal` → completion `terminated` and a
par-score natural result) or stores a planned revision. `penalty_awarded` adds the runs to
`inningsIndex` (or carries them) — placement rules on `PenaltyAwardedPayload`; it never reopens a completed
innings. `innings_ended` marks `absentees` as `absent`. `match_ended` closes an in-progress innings with
`match_ended`, sets `result` and lifecycle (`abandoned` for outcome abandoned, else `completed`) and clears
any suspension.

PENDING ACTION priority and meaning: see `PendingAction` in types/state.ts.

### `applyEvent`

Applies ONE stored event to a state produced by `replayMatch`/`applyEvent` for the same setup.
Invalid events leave every field unchanged except `issues` (appended). Satisfies invariant 3 above.

### `initialMatchState`

State of a match with an empty log. Equivalent to `replayMatch(setup, [])`.

### `currentInnings`

The innings in progress, else the last started innings, else null.

### `deriveMatchStatus`

The persisted `MatchStatus` for a match: the log decides once it has any effect (`live`, `paused`,
`completed`, `abandoned`); while `lifecycle === 'not_started'` the stored pre-play status
(`scheduled | postponed | cancelled`) is kept. Used by services when refreshing projections.

## `src/domain/scoring/validate.ts`

### `validateEvent`

EVENT VALIDATION (§16 step 1, §23 "validate event", §89). Owner: WP-scoring-engine.

`validateEvent` is THE rule gate. It is called:
- by services before every append (live scoring, §23), mode `append`: never persist an event that fails;
- by `replayMatch`/`applyEvent` for every stored event, mode `replay` (invalid → skipped + error
  `ReplayIssue`; a stale stamp → warning issue, applied with the derived context);
- by `history.ts` for every event of an edited log (historical edits, §16), mode `append` after re-stamping.

Pure; `state` must be the state immediately BEFORE the event. The first failing rule wins; checks run in this
order: lifecycle (MATCH_ALREADY_ENDED, PLAY_SUSPENDED…) → pending action compatibility
(PENDING_ACTION_REQUIRED: e.g. a delivery while a vacancy or new-over bowler is pending) → players/squads
(PLAYER_NOT_IN_SQUAD, SUBSTITUTE_NOT_ALLOWED for a substitute as batter/bowler/opener,
PLAYER_INELIGIBLE_SUPER_OVER) → stamps (CONTEXT_MISMATCH; `append` only) → event facts. Messages are
organizer-friendly (§86), e.g. "Hassan bowled the previous over and can't bowl two overs in a row."
Because the pending-action check runs first, a delivery recorded while ANY prompt is pending
(`select_next_bowler`, `select_next_batter`, `start_next_innings`, `confirm_result` after the innings or match
finished, …) or while no innings is in progress fails with PENDING_ACTION_REQUIRED (U-VAL-05, U-INN-18).
This is binding where SCORING_ENGINE §4.1/§4.2, BR-BW-01 and EC-C-12 name BOWLER_NOT_SELECTED,
VACANCY_MUST_BE_FILLED or INNINGS_NOT_IN_PROGRESS for those cases.
BOWLER_NOT_SELECTED remains the code of a history edit that leaves an over start without a bowler (BR-CR-06);
VACANCY_MUST_BE_FILLED remains the code of non-delivery events (bowler change, retirement, strike swap) made
while a vacancy is open; INNINGS_NOT_IN_PROGRESS remains the code of other in-innings events after the innings
ended (U-VAL-06).

Delivery fact rules (codes): runsRun integer 0..9 (INVALID_RUNS); shortRuns integer 0..runsRun
(INVALID_SHORT_RUNS); boundary ∈ {0,4,6} (INVALID_BOUNDARY); 6 only with runsTo 'bat' on fair/no-ball
(SIX_NOT_OFF_BAT); striker-only dismissals require runsRun = 0 and boundary = 0
(RUNS_NOT_ALLOWED_WITH_DISMISSAL); dismissal allowed for the call and free hit (`allowedDismissals`);
`playerOutId` at the crease and equal to the striker for striker-only dismissals
(DISMISSED_PLAYER_NOT_AT_CREASE); `dismissalEnd` required/forbidden per type; ≤ 2 fielders, all from the
fielding side incl. substitutes (the bowler may be the catcher); Law 16.6: in a chase innings (regular or
super over) no wicket when penalty + scored running runs (+ boundary) of the delivery already reach the
target (WICKET_AFTER_RESULT).
Other events: `bowler_selected.reason` vs over position (BOWLER_CHANGE_REASON_INVALID), removed bowler
(BOWLER_REMOVED_FROM_ATTACK); `penalty_awarded.inningsIndex` per the placement rules
(INVALID_PENALTY_INNINGS); `innings_ended.absentees` only with `batters_unavailable`, batting-side players who
are yet to bat or retired hurt (INVALID_ABSENTEE); `overs_revised.terminal` only for the chase in progress with
maxBalls = legal balls and a target (INVALID_OVERS_REVISION / INVALID_TARGET); `match_ended { natural }` and
`tie_decided` are valid while paused.
Warnings (ok: true): BOWLER_QUOTA_LAST_OVER when starting a bowler's final quota over, UNUSUAL_RUNS for
scored running runs ≥ 5 without a boundary, FIELDER_UNKNOWN for caught/stumped without a fielder,
CHASE_OVERS_NOT_REVISED when innings 0 is reduced and innings 1 has no planned revision.

### `validateLog`

Validates a whole stored log by replaying it. `ok` iff no ERROR-severity `ReplayIssue` (warnings are returned
in `state.issues`). Used before persisting a history edit, on import (§84) and by the integrity check (§93).

### `allowedDismissals`

Dismissals permitted on a delivery (Laws + free hit):
fair → all; wide → stumped, hit_wicket, run_out, obstructing_field, handled_ball; no_ball → run_out,
hit_ball_twice, obstructing_field, handled_ball; free hit (any call) intersected with
{run_out, hit_ball_twice, obstructing_field, handled_ball}. Used by the wicket sheet to hide impossible options.

### `bowlerEligibility`

Bowler eligibility for the next over (or a mid-over replacement) of the current innings: every NON-SUBSTITUTE
fielding-side squad player split into eligible / ineligible with a reason (`bowled_previous_over` unless
`allowBowlerConsecutiveOvers`; `quota_reached` per `InningsLimits` — under `icc_one_fifth` a bowler at the base
quota is eligible for one more over only while fewer than `extraOverBowlers` bowlers have used their extra
over; `replaced_this_over`; `removed_from_attack`; `bowled_previous_super_over` in super-over round ≥ 2 with
`restrictRepeatPlayers`). Same data as the `select_next_bowler` pending action.

### `eligibleIncomingBatters`

Batters who may fill a vacancy now, in prompt order: yet-to-bat (squad `battingOrder`, then name), then
`retired_hurt`, then `retired_not_out` only when no yet-to-bat batter remains (and, under mandatory
retirement, `mayReturn`). Never out / retired-out / absent players, never the batter already at the crease,
never a substitute fielder, and in super-over round ≥ 2 (with `restrictRepeatPlayers`) never a batter
dismissed in an earlier super over.

## `src/domain/scoring/commands.ts`

COMMANDS: UI intents → event payloads (§9 "one tap", §18 "wicket flow must remain fast").
Owner: WP-scoring-engine.

The UI dispatches serialisable `ScoringIntent`s built with the tiny constructors below (e.g. the "4" button
dispatches `scoreRuns(4)`); `buildEvents` turns an intent into ready-to-append payloads using the current
state (context stamps, positions, default choices). Services then validate each payload
(`validateEvent`) and append them atomically under ONE `actionId` (one undo step).

`buildEvents` is pure and pre-validates: it returns `{ ok: false }` with the same codes as `validateEvent`
rather than building an event that would be rejected. Multi-event intents: a wicket with `nextBatterId`
yields `[delivery, batter_in]`; retire / off-ball dismissal with `nextBatterId` yield `[…, batter_in]`;
`revise_overs` with `scope: 'both_innings'` yields two `overs_revised` (current innings + planned chase).
Defaults filled by `buildEvents`: `shortRuns` 0; a stumping without fielders → the fielding side's designated
wicket-keeper; `select_bowler.reason` → `over_start` at an over start, else required; `penalty.inningsIndex` →
the placement default of `PenaltyAwardedPayload` (batting side: its current / just-completed innings;
fielding side: its most recent innings of the phase, else its upcoming one); `revise_overs.terminal` false.

Every delivery intent separates runs RUN (`runsRun`, crossings) from the boundary allowance and from short
runs, exactly like the stored fact, so "1 + 4 overthrows" is `{runsRun: 1, boundary: 4}` — never an all-run 5.

### `ScoringIntent`

- `type: 'runs'`: Runs off the bat: `runsRun` run (0..9) plus an optional boundary (4 / 6 button = `{runsRun: 0, boundary: 4|6}`).
- `type: 'wide'`: Wide + extra runs run (`runsRun`) or wide to the boundary (`boundary: true` → +4).
- `type: 'no_ball'`: No-ball; runs to bat (default) or as byes/leg-byes. `boundary` 4 or 6 (6 only off the bat).
- `type: 'wicket'`: Wicket on a delivery. Defaults: `call` fair, `runsTo` bat, `runsRun` 0, `playerOutId` = striker,
  `dismissalEnd` required for run out / obstructing / handled.
- `type: 'wicket' › nextBatterId`: Incoming batter chosen in the same sheet; omitted/null = choose later (pending action).
- `type: 'batter_in'`: `position` defaults to the single vacancy.
- `type: 'start_innings'`: `battingTeamId` defaults to the pending action's suggestion.
- `type: 'revise_overs'`: Give `overs` (whole overs) or `balls` (exact legal balls, e.g. rain at 14.2 → 86).
  `scope: 'both_innings'` (only for inningsIndex 0) also plans the same limit for innings 1 (§7 "20 overs →
  rain → 12 overs a side"); a different chase limit/target is a separate revision of innings 1.
  `terminal: true` closes a rain-terminated chase on the par score (`target` = par + 1 required).

### `buildEvents`

Converts an intent into validated-shape payloads for the current state. Pure.

**Intent constructors (pure, state-free; keep the UI dumb)**

### `scoreRuns`

The scoring pad: `scoreRuns(0..6)`. 4 and 6 are boundaries (`{runsRun: 0, boundary: 4|6}`) unless
`{ allRun: true }` (all-run four → `{runsRun: 4}`); every other value is runs run. `shortRuns` for "2 (1 short)".

### `overthrowBoundary`

Runs run PLUS an overthrow boundary: `overthrowBoundary(1)` = 1 + 4 overthrows (5 to the batter, strike rotates,
not a "4"). `runsTo` bye/leg_bye for overthrows off byes; `call: 'no_ball'` for a no-ball.

### `wide`

`wide()` = WD; `wide(1)` = WD+1 (ran one); `wide(0, { boundary: true })` = 5 wides.

### `noBall`

`noBall()` = NB; `noBall({ boundary: 4 })` = NB + four off the bat; `noBall({ boundary: 6 })` = NB + six;
`noBall({ runsRun: 1 })` = NB + 1 run off the bat; `noBall({ runsTo: 'bye', runsRun: 2 })` = NB + 2 byes;
`noBall({ runsTo: 'leg_bye', runsRun: 1 })` = NB + 1 leg-bye; `noBall({ runsRun: 1, boundary: 4 })` = NB + 1 and
4 overthrows off the bat.

### `wicket`

Wicket intent; see the `wicket` member of `ScoringIntent` for defaults.

### `bye`

`bye(n)` = B n (runs run as byes); `bye(0, { boundary: true })` = 4 byes to the boundary; `shortRuns` as for
`scoreRuns`. Byes are never charged to the bowler.

### `legBye`

`legBye(n)` = LB n; `legBye(0, { boundary: true })` = 4 leg-byes; a leg-bye ball is a bowler dot.

### `swapStrike`

Manual swap of striker and non-striker between deliveries (§19) → `strike_swapped`.

### `selectBowler`

Bowler for the next over (`reason` defaults to `over_start` at an over start) or a mid-over replacement
(`reason` `injury` / `suspended` required) → `bowler_selected`.

### `batterIn`

Incoming batter for the vacancy (`position` defaults to the single vacancy) → `batter_in`.

### `ScoringIntentType`

The discriminant of `ScoringIntent` (`'runs' | 'wide' | …`), for code that switches on the intent kind (e.g. which
feedback a dispatched intent gets).

### `CommandResult`

Result of `buildEvents`: the payloads to append under one `actionId`, or the first `EventValidationCode` that
would reject them, with an organizer-friendly `message` (§86).

## `src/domain/scoring/history.ts`

UNDO / REDO / HISTORICAL EDIT (§15, §16). Owner: WP-scoring-engine.

Undo is never `score = score − 1` (§15): it removes events from the log and the state is recomputed by
replay. All functions are pure and return NEW arrays; services persist the result in ONE transaction
(append rows for redo, `MatchEventRepository.truncateFrom(undone[0].seq)` for undo, full log rewrite for
edits) and refresh projections.

**UNDO / REDO**
The unit is an ACTION GROUP: the trailing run of events sharing the last event's `actionId` (e.g. a wicket
delivery + its incoming batter). An actionId identifies exactly one contiguous run (history edits give each
inserted op a fresh actionId), so the domain group and the rows the service truncates are always the same.
Undo removes that group; redo re-appends the SAME events verbatim (same ids, seqs, timestamps) after
re-validating them — valid only if the log still ends where it did. The redo stack is SESSION-scoped (store
memory): cleared by open/close, a CONFLICT reload and any dispatch, and lost on restart. Unlimited depth
(§15). Undoing `match_ended` REOPENS the match: allowed, but for tournament matches services must preview
impact and audit (`match_reopened`); redoing a group that contains `match_ended` follows the same
confirmation/audit rules as `endMatch`.

**HISTORICAL EDIT**
Ops are applied to the log in order (seqs refer to the ORIGINAL log), then the log is NORMALISED:
 1. Re-anchoring: each over-start `bowler_selected` (one that was at an over start in the original log) stays
    attached to "the start of over k of innings i": it is moved to immediately before the first delivery of
    that over in the edited log (so turning a wide into a legal ball — which ends the over one delivery
    earlier — moves the next bowler's selection one delivery earlier, and vice versa). If an over start has no
    selection anymore the edit fails with BOWLER_NOT_SELECTED (the UI asks the organizer to pick one and
    resubmits with an extra op). Surplus selections beyond the innings' overs are dropped (reported).
    Mid-over replacements and all other events keep their relative position.
 2. Renumbering: seq = 1..n in order; event ids and `actionId`s preserved; inserted events get fresh ids from
    `ctx.ids`, `recordedAt = ctx.now`, and ONE FRESH actionId PER OP (`ctx.ids()`), so events inserted at
    different positions never share an action group.
 3. Re-stamping: every delivery's strikerId/nonStrikerId/bowlerId is rewritten to the replay-derived context
    (strike is derived, so 1 run → 2 runs re-attributes later balls).
 4. Validation: the normalised log must replay with zero issues; otherwise `{ ok: false }` with the first
    failing seq and code (e.g. removing a wicket leaves the next `batter_in` with NO_VACANCY — the guided UI
    removes it in the same edit).
The outcome carries before/after states so services can show WHAT WILL CHANGE (§16 steps 2–8, §99) and, for
tournament matches, feed `match_result_change` into `tournament/impact.ts`.

### `UndoResult`

- `undone`: The removed action group, in log order (push onto the redo stack).
- `tailId` (additive, optional; always set by `undoLastAction`): id of the last event left in the log after
  the undo, `null` when the undo emptied the log. Keep it with the group and pass it back to `redoAction` as
  `expectedTailId`.

### `lastActionGroup`

Trailing action group of a log (empty array for an empty log).

### `undoLastAction`

Removes the last action group; null when the log is empty.

### `redoAction`

Re-appends a previously undone group verbatim after validating it against the current log. Fails with code
`REDO_STALE` when the log no longer ends where it ended before the undo (a new action, a reload or another
writer diverged it), or with the `EventValidationCode` of the first event that no longer validates.
"Ends where it ended" is checked in two parts:
- always: the group is non-empty and its seqs continue the log contiguously (`group[0].seq = lastSeq + 1`);
- when the optional 4th parameter `expectedTailId` (additive; `EventId | null`, from `UndoResult.tailId`) is
  given: the id of the log's last event (`null` for an empty log) equals it. Only this catches a divergence
  that keeps the length, e.g. undo "3", undo "2", record "4" in the freed seq, then redo the older "3" group.
Without `expectedTailId` only contiguity is checked, so callers that do not keep the tail id must clear the
redo stack on every new action (as `LiveMatchStore` does), otherwise an older group can be re-applied after
a same-length divergence whenever its stamps still validate.

### `RedoStack`

Undone action groups, oldest first and most recent last (`LiveMatchStore.redoStack`). Session memory only.

### `HistoryEditOp`

- `op: 'replace'`: Replace one event with one or more events (e.g. a dot → wicket + incoming batter).
- `op: 'insert_before'`: Insert before the event at `seq` (e.g. a forgotten strike swap).
- `op: 'insert_after'`: Append after the event at `seq`.

### `EditContext`

- `ids`: Event ids AND per-op action ids of inserted events.

### `EditDiff`

- `reanchoredIds`: Over-start bowler selections moved by re-anchoring.
- `restampedIds`: Deliveries whose context stamps changed.

### `EditOutcome`

- `{ › affectedInnings`: Innings indexes whose totals, cards or completion changed.
- `{ › resultChanged`: `result`/`naturalResult` differs (type, winner or margin) — tournament recalculation needed.

### `applyHistoryEdits`

Applies ops then normalises and validates (see header). Pure.

### `editEvent`

Convenience: replace the event at `seq` with `replacement` (§16 "17.3 FOUR → 0/1/2/3/4/6/Wide/No Ball/Wicket").

### `normalizeLog`

Steps 1–3 of the header on an arbitrary log (idempotent: normalising a normalised log is a no-op). Also used
by backup import to repair stamps of hand-edited files before validation.

### `logFingerprint`

Deterministic fingerprint of a log (FNV-1a 32-bit over the canonical JSON of every event, in order, as 8 hex
chars). `previewHistoryEdit` returns it and `applyHistoryEdit` requires it back: ops address seqs of the
ORIGINAL log, so any change in between (undo + new ball keeps the same lastSeq) fails with `CONFLICT` instead
of editing different events than the organizer confirmed.

## `src/domain/scoring/result.ts`

RESULTS (§22, §63, §81 result line). Owner: WP-scoring-engine.

### `computeNaturalResult`

Natural result from play, or null while undetermined. Used by replay (never call from UI).
- Chase complete: runs ≥ target → chasing side wins by (chase innings `maxWickets` − wickets) wickets — the
  CHASING team's own threshold (`playersInSide`) — with (maxBalls − legalBalls) balls remaining;
  runs = target − 1 → tie; otherwise the side batting first wins by (target − 1 − runs) runs.
  `method: 'revised_target'` when the target was revised.
- Law 16.10: chase complete with completion `all_out` or `batters_unavailable` and runs ≥ target (only
  possible through a later `penalty_awarded` to that innings, because reaching the target ends the innings
  first) → chasing side wins with `method: 'penalty_runs'` and margin `{ kind: 'runs', runs: runs − (target − 1) }`,
  even when the target was revised. Runs = target − 1 after such a penalty is a tie.
- Chase `terminated` (terminal overs revision): par = target − 1; runs > par → chasing side wins by
  (runs − par) RUNS; runs = par → tie; runs < par → side batting first wins by (par − runs) runs; all with
  `method: 'par_score'` (a tie carries no method; its text says "(par score)").
- Re-evaluated after `penalty_awarded` and `overs_revised` too (replay.ts steps 9–12).
- Super overs: each completed pair compares runs; higher wins → `tie` with decider `super_over`. A tied pair
  under `ifTiedAgain: 'boundary_count'` → decider `boundary_count` (engine counts 4s + 6s over the match and
  super overs; still level → undecided). `repeat` / `tie_stands` → undecided tie (`resolve_tie` pending).
- Main match tied and no super over played → `{ type: 'tie', decider: null }`.

### `resultWinner`

Winner including a tie decider; null for no-result/abandoned/undecided tie/awarded-without-winner.

### `resultLoser`

Loser counterpart of `resultWinner` (needs both team ids for decided ties).

### `resultMethod`

Flat "how was it decided" (task contract field `method`): e.g. tie decided by super over → `super_over`.

### `formatResult`

Result line (§81): "Pakistan XI won by 3 runs", "Lions won by 5 wickets (12 balls left)",
"Lions won by 12 runs (revised target)", "Lions won by 21 runs (par score)", "Match tied (par score)",
"Match tied", "Match tied — Tigers won the Super Over",
"Match tied — Tigers won on boundary count", "No result", "Match abandoned", "Tigers won by walkover",
"Match awarded to Tigers", "Tigers won by penalty runs" (Law 16.10; no margin and no balls left, whatever the
stored margin). Singular forms: "1 run", "1 wicket", "1 ball left".

### `matchStatusLabel`

The §22 label for a match card: Scheduled, Live, Paused, Postponed, Cancelled, Completed, Tied, No Result,
Walkover, Abandoned (see the table in types/match.ts).

### `suggestRevisedTarget`

Suggested revised target for a reduced chase (the organizer may type any target instead; DLS itself is out
of scope). `average_run_rate`: ⌊firstInningsRuns × chaseBalls ÷ firstInningsBalls⌋ + 1 (common school/club
method). Returns null when `firstInningsBalls` is 0.

## `src/domain/scoring/summary.ts`

MATCH → TOURNAMENT BOUNDARY (§66). Owner: WP-scoring-engine.

### `SCORING_PROJECTION_VERSION`

Version of everything replay writes as projections (innings rows, partnerships, result, status, summary).
WP-scoring-engine BUMPS it whenever replay, result or summary semantics change. Services store it in
`matches.projection_version`; `AppServices.bootstrap` rebuilds every match whose stored version is lower
(one transaction per match; matches whose log needs repair are left untouched and reported).

### `buildMatchSummary`

Builds the `MatchSummary` for a TERMINAL match (lifecycle `completed` or `abandoned`); returns null otherwise.
- `innings`: regular innings in order, with `allottedBalls` after revision and `allOut` per
  `InningsCompletionReason`; player lines exclude super overs.
- `superOvers`: super-over innings (never used by NRR).
- `squads`: each team's non-substitute squad.
- Deterministic: identical inputs → identical summary (safe to compare for "result changed").
Services store it as `matches.summary_json` whenever a match's log changes (append, undo, edit, import).

### `summariesAffectStandingsEqually`

Standings-relevant equality of two summaries: result type, winner, margin, method, tie decider, match and
per-innings `ballsPerOver`, per-innings runs/balls/wickets/allotted/allOut/completion, target and
`targetRevised` (all of which move points, NRR — `icc_par`, overs conversion — or knockout advancement).
Used to decide whether a history edit needs tournament recalculation and a `result_corrected` audit.

## `src/domain/scoring/stats.ts`

STATISTICS FORMULAS & MATCH ANALYTICS (§12, §52, §90). Owner: WP-scoring-engine.

Batting/bowling cards, partnerships, fall of wickets and over summaries are produced INSIDE replay (they need
the event context) and exposed on `InningsState`. This module holds (a) the single implementation of every
rate formula — used by replay, tournament statistics and NRR display — and (b) analytics derived from a
replayed `MatchState` for the scorecard/analytics screens (§64 "Analytics", §83 over summary).
All functions are pure. Rates are unrounded; round only in `format.ts`.

### `ballsToOvers`

Decimal overs: `ballsToOvers(100, 6) === 16.666…` (NOT the display value 16.4).

### `strikeRate`

runs × 100 ÷ balls faced; null when balls = 0.

### `economyRate`

Runs conceded per over; null when 0 legal balls.

### `runRate`

Runs per over (CRR, team run rate); null when 0 legal balls.

### `requiredRunRate`

Required run rate; null when ballsRemaining ≤ 0.

### `battingAverage`

runs ÷ dismissals; null when never dismissed.

### `WormPoint`

- `legalBalls`: 0 = start of innings; k = end of over k (last point may be a partial over).

### `worm`

Cumulative runs per over for each REGULAR innings (worm chart).

### `manhattan`

Runs and wickets per over of one innings (Manhattan chart).

### `boundaryCounts`

4s + 6s per team over the main innings and super overs (used by the `boundary_count` tie rule).

### `playerMatchStats`

A player's contribution in the regular innings of one match (player sheet, player-of-the-match picker).

## `src/domain/scoring/format.ts`

FORMATTING AT THE EDGE (CLAUDE.md: overs are ball counts until displayed). Owner: WP-scoring-engine.
Pure, locale-independent (ASCII digits, `.` decimal separator, `–` for undefined values). UI and PDF use
these exclusively so the scorecard, live header and export always agree.

### `formatOvers`

Legal balls → over notation: `formatOvers(100, 6) === '16.4'`, `formatOvers(120, 6) === '20'`,
`formatOvers(0, 6) === '0'`; with `{ alwaysShowBalls: true }` → `'20.0'` (live header §10).
Works for any balls-per-over (8-ball overs: `formatOvers(10, 8) === '1.2'`).

### `formatScore`

`142/4` (§10).

### `formatRate`

Rate to 2 dp (`8.52`), `–` for null. Used for CRR, RRR, economy, strike rate.

### `formatNrr`

NRR to 3 dp with explicit sign: `+1.234`, `-0.567`, `0.000`; `–` for null.

### `formatBowlingFigures`

Bowling figures `3.4-0-28-2` (overs-maidens-runs-wickets, §12).

### `ballToken`

Display token for one delivery (grammar in `BallToken` docs): `0` (or `•` when dotStyle is 'dot'), `1`,
`4`, `6`, `WD`, `WD+1`, `NB`, `NB+4`, `NB+2B`, `NB+1LB`, `B1`, `LB2`, `W`, `1+W`, `WD+W`, `NB+1+W`.
Runs in a token are always SCORED runs; a delivery with short runs appends `s` (`1s` = ran 2, one short).
`accessibilityLabel` spells it out ("No ball, plus two byes", "One run, one short").

### `dismissalText`

Scorecard dismissal text (§83): `b Hassan`, `c Rizwan b Hassan`, `c & b Hassan`, `c ? b Hassan` (catcher not
recorded), `c sub (Ali) b Hassan` (substitute fielder), `lbw b Hassan`, `st Rizwan b Hassan`,
`hit wicket b Hassan`, `run out (Smith/Jones)`, `run out (sub (Ali))`, `run out`, `obstructing the field`,
`hit the ball twice`, `handled the ball`, `timed out`, `retired out`. Names come from `players`
(unknown ids render as "Unknown"). Absent batters are not dismissals: the card shows "absent hurt"/"absent".

### `formatRequirement`

"Need 23 from 14 balls" / "Need 1 run from 1 ball" (§10).

## `src/domain/scoring/presets.ts`

FORMAT PRESETS (§7, §8). Owner: WP-scoring-engine.
Presets are DATA that only pre-fill `MatchRules`; every value stays editable in match setup, and a match stores
its full rules (never a reference to a preset), so editing presets never changes past matches.
Bowler quota: `uniform` mode with the one-fifth convention ⌈overs ÷ 5⌉ (every bowler); organizers of formal
matches can switch to `icc_one_fifth` (⌊overs ÷ 5⌋ each + (overs mod 5) extra-over bowlers) — identical for
multiples of 5 (all built-ins).

### `BASE_MATCH_RULES`

Laws-default rules shared by every preset (11-a-side, 6-ball overs, 1-run wides/no-balls, free hit, super over).

### `BUILTIN_FORMAT_PRESETS`

The read-only built-ins T5, T10, T20, T30, T40, T50 (`builtin: true`), each `BASE_MATCH_RULES` with its overs,
a `uniform` quota of ⌈overs ÷ 5⌉ (1, 2, 4, 6, 8, 10) and scaled powerplays (T50: three phases 1–10, 11–40,
41–50). "Custom" in match setup is not a preset: it is `rulesForOvers(n, base)`.

### `DEFAULT_FORMAT_ID`

Default preset for a new match when settings have none.

### `OVERS_QUICK_PICKS`

Quick-pick overs offered by match setup besides a typed custom number (§7).

### `getBuiltinPreset`

Built-in preset by id, or null (user presets are loaded from the database).

### `defaultMaxOversPerBowler`

`uniform` quota: ⌈overs ÷ 5⌉, minimum 1. (`icc_one_fifth` limits are derived per innings, see `InningsLimits`.)

### `rulesForOvers`

Rules for a custom overs count (§7 "custom typed number, e.g. 17"): `base` with `oversPerInnings` replaced,
`maxOversPerBowler` rescaled with `defaultMaxOversPerBowler` when the base used the one-fifth convention, and
powerplays scaled proportionally (rounded, clamped to the new limit, empty phases dropped).

### `validateRules`

Validates a rule set (invariants in types/rules.ts). Errors block match creation; warnings are shown
(e.g. BOWLER_QUOTA_TOO_LOW when the fielding side's non-substitute bowlers cannot bowl `oversPerInnings`
under the quota, so the innings cannot be completed).

### `RulesIssueCode`

One code per rule field, checked against the invariants listed under `MatchRules` and the rule types above:
`OVERS_INVALID` (`oversPerInnings`), `BALLS_PER_OVER_INVALID` (`ballsPerOver` 1–12), `PLAYERS_PER_SIDE_INVALID`
(`playersPerSide` 2–15), `BOWLER_QUOTA_INVALID` (`maxOversPerBowler`), `BOWLER_QUOTA_TOO_LOW` (the warning
above), `PENALTY_INVALID` (wide / no-ball `penaltyRuns` ≥ 0), `POWERPLAY_INVALID` (a phase outside the innings or
with `fromOver` > `toOver`), `POWERPLAY_OVERLAP` (two phases share an over), `SUPER_OVER_INVALID`
(`SuperOverRule` values), `RETIREMENT_INVALID` (`MandatoryRetirementRule` values).

### `RulesIssue`

One finding of `validateRules`: `severity: 'error'` blocks match creation and preset saving; `'warning'` is shown
and can be accepted. `message` is organizer-friendly English (§86).

## `src/domain/tournament/index.ts`

Tournament rules engine public API (§60 "TournamentRulesEngine" + "StandingCalculator").
Import from `@/domain/tournament`.

## `src/domain/tournament/fixtureReplay.ts`

Additive (wave 3). The §39 replay of an abandoned fixture, and the one result-counting rule (see
`TournamentSnapshot`). Pure.

- `stageAllowsReplay(stage)`: `StageConfig.abandonedMatches === 'replay'` or `KnockoutConfig.noResult === 'replay'`.
  `services/tournament/status.ts#replayAllowed` delegates to it.
- `isFixtureReplay(fixture, patch)`: the fixture is `abandoned` and `patch.status` is `rescheduled`.
- `fixtureReplayGuard(snapshot, fixture)`: `canTransitionFixture('abandoned', 'rescheduled', { hasMatch, replayAllowed })`
  for the fixture's stage.
- `supersedeFixtureMatch(fixture, now)`: the replayed fixture: `rescheduled`, `matchId` and `matchSides` null.
- `supersededAfterUpdate(snapshot, updatedFixtures)`: `snapshot.supersededMatches` plus every updated fixture that
  lost its `matchId` (used by `applyPlan`).
- `fixtureSupersededMatchIds(snapshot, fixtureId)`, `fixtureHasMatchHistory(snapshot, fixture)`: the matches kept
  on record for a fixture; a fixture has match history when it has a current match or a superseded one.
- `countedFixtureSummary(snapshot, fixture)`: the summary that counts for the fixture, or null (the counting rule).

## `src/domain/tournament/rng.ts`

DETERMINISTIC RANDOMNESS (§30, §31, §46). Owner: WP-tournament-structure.
The domain never calls `Math.random()`. "Normal random" in the UI = a fresh seed generated by the service
(expo-crypto) and passed in; "seeded random" = an organizer-typed seed (e.g. 847291). Either way the seed is
stored with the result (`StageConfig.seedingSeed`, audit entry), so every draw is reproducible and explainable.

### `Rng`

Uniform float in [0, 1).

### `mulberry32`

mulberry32 PRNG. Same seed → same sequence on every platform (32-bit integer math only).

### `normalizeSeed`

Normalises organizer input to a uint32 seed: integer strings/numbers → value mod 2^32 ("847291" → 847291);
any other text → FNV-1a 32-bit hash of the trimmed string.

### `shuffle`

Fisher–Yates shuffle returning a NEW array (input untouched).

### `randomInt`

Integer in [0, maxExclusive).

## `src/domain/tournament/pools.ts`

POOL ASSIGNMENT (§30–§33). Owner: WP-tournament-structure.
Works on a pure `PoolAssignment` value (pools in order, members in pool order). Members are `FixtureSide`s:
concrete teams, or entry slots of the stage (Super 8 groups built from "A1", "B2" before they are known).
Nothing here persists or silently replaces anything: the service shows "Current pool arrangement will be
replaced." (§31) and an impact preview when fixtures exist (§34) before saving; the previous assignment is kept
for undo. Members are compared by value (`team` by teamId, `slot` by slotId).

### `PoolAssignment`

- `seed`: Seed of the random draw that produced it; null for manual/seeded arrangements.

### `PoolWarning`

- `message`: e.g. "Teams in different pools may play different numbers of matches." (§32)

### `poolName`

"Pool A", "Pool B", …, "Pool Z", "Pool AA", … for index 0, 1, …

### `distributePoolSizes`

Near-even split, larger pools first: (10, 3) → [4, 3, 3]; (16, 4) → [4, 4, 4, 4].

### `assignRandom`

Random assignment (§30 "16 teams → shuffle → Pools A–D"): shuffle `members` with `mulberry32(seed)`, then fill
pools in order up to `sizes` (explicit uneven sizes allowed, §32; must sum to the member count) or an even
split of `poolCount`. `poolIds` supplies ids for the pools in order (length = number of pools).

### `assignSeeded`

Seeded (snake) assignment, future-compatible (§30): teams ordered by seed (unseeded last, by name) are dealt
A, B, C, D, D, C, B, A, … so top seeds are spread across pools.

### `assignSlotsToPools`

Pools built from qualifiers: entry slots (in slot-index order) dealt to pools. `snake`: A, B, C, D, D, C, B, A…
(A1, B1, C1, D1 spread, then runners-up reversed — the usual Super 8 / Super 12 draw); `fixed_order`: exactly
`slotIndexesPerPool[i]` into pool i (templates' `poolSlotIndexes`).

### `moveMember`

Move a member to another pool (§33 Move). Appends to the target pool.

### `swapMembers`

Swap two members between (or within) pools, keeping their positions (§33 Swap).

### `replaceMember`

Replace a member by one not currently assigned, same position (§33 Replace).

### `poolWarnings`

Structural warnings for display (§32). `entrants` = the stage's entrants (its entry slots incl. direct
entries; for the first stage, the active teams not directly entered elsewhere) — detects unassigned ones.

## `src/domain/tournament/fixtures.ts`

FIXTURE GENERATION (§35–§37). Owner: WP-tournament-structure.
Generation is never irreversible (§36): these functions only produce `FixtureDraft`s for the preview; the
service persists them when the organizer confirms. Deterministic: same input → same drafts (ids come from
the injected generator in call order).

### `RoundRobinPairing`

- `round`: 1-based round across all legs (leg 2 continues numbering).

### `RoundRobinRound`

- `bye`: Entrant sitting out this round (odd number of entrants), else null.

### `roundRobin`

Circle-method round robin (§35). n entrants (teams or slots) → n−1 rounds per leg (n even) or n rounds with
one bye each (n odd); every pair meets exactly once per leg. `legs`: 1 = single RR, 2 = double RR,
n = custom encounters per opponent. Leg k+1 mirrors leg k with sides swapped. Balance: over a leg, each
entrant is listed first (sideA) ⌊(n−1)/2⌋ or ⌈(n−1)/2⌉ times. Input order is respected (entrant 0 fixed).
Throws on fewer than 2 entrants or legs < 1 (programmer error — the UI prevents it).

### `DraftDefaults`

- `startMatchNumber`: First `matchNumber` to use (continues the tournament's numbering).

### `draftsFromRoundRobin`

Converts round-robin rounds to drafts in round order (status `scheduled`, no dates, `bracket` null, `isFinal` false).

### `ManualFixtureInput`

Manual fixture (§37 "+ Add Match").

### `validateFixtureDrafts`

Checks drafts before confirmation: errors (same side twice, side not in pool/tournament) block; warnings
(duplicate encounter beyond the pool's legs — `legsByPool`, else `defaultLegs` — a team with two fixtures at
the same date+time, dates outside the tournament window) are shown in the preview.

### `scheduleSequential`

Optional convenience scheduler: assigns dates/times to drafts in round order — `matchesPerDay` per date
starting at `startDate`, cycling through `times`, never scheduling a side twice on one day (moves to the next
day), skipping `restDates`. Pure date arithmetic on `YYYY-MM-DD` strings (no Date.now()).

### `KnockoutBracketPlan`

- `fixtures`: All knockout fixtures, first round first, `bracket` set on each (kind `main`, or `third_place`).
- `slots`: PROGRESSION slots (`role: 'progression'`) for later rounds, indexed from `opts.firstSlotIndex`, with
  `bracket_winner` / `bracket_loser` sources referencing (round, position) of THIS stage — never fixture ids,
  so a re-draw keeps them valid.
- `entrySlotSeeds`: Seed of each ENTRY slot entrant (entrant side is a slot), for `StageSlot.seed` (drives `higher_seed`).
- `byes`: Entrants that skip round 1 (byes), in seed order.

### `knockoutBracket`

Knockout bracket (§46). `entrants` are in SEED order (index 0 = seed 1) — use `knockout.ts#seedEntrants` to
produce that order. Bracket size P = next power of two ≥ n; the top P−n seeds receive byes (no fixture; they
appear directly as a side in round 2). Round-1 positions follow the standard bracket order
(`knockout.ts#standardBracketOrder`) so seeds 1 and 2 can only meet in the final. Later-round sides are
`slot` sides whose progression slots have `bracket_winner` sources; `rounds` (from `KnockoutConfig.rounds`)
stops the bracket early (a QF-only stage) — otherwise the last round's single `main` fixture is the final
(`isFinal: true`). `thirdPlacePlayoff` (only when the bracket reaches a final) adds a `third_place` fixture
between the semifinal losers (`bracket_loser`), round = final round, position 0. Progression slot indexes
start at `firstSlotIndex` (= the stage's highest entry-slot index + 1) so they never collide with entry
slots. Round names: Final, Semifinal, Quarterfinal, Round of 16, Round of 32, else "Round k"; third place =
"Third place". Requires n ≥ 2.

### `roundName`

Human round name for a round with `teamsInRound` teams (2 → "Final", 4 → "Semifinal", 8 → "Quarterfinal").

### `fixturesForPoolMove`

§33 Move prefill for `ProposedChange.pool_move`: `removeFixtureIds` = the member's fixtures in `fromPoolId`
without a match; `addFixtures` = new drafts pairing the member with every member of `toPoolId`, `legs` times,
numbered from `defaults.startMatchNumber`. Played fixtures are never touched.
Sides alternate per pairing AND per leg (TOURNAMENT_RULES_ENGINE §4.4): target members keep their given order
(the member itself excluded); in odd legs the member is `sideA` against opponents 0, 2, 4… and `sideB` against
1, 3, 5…; even legs mirror that. Example: Lions into {Kings, Royals, Titans}, single leg → Lions v Kings,
Royals v Lions, Lions v Titans. Only the pairs, legs and match numbers of UNIT_TEST_PLAN U-FIX-19 are normative;
its "HAW v X, HAW v Y" side order is not.

## `src/domain/tournament/knockout.ts`

KNOCKOUT SEEDING & ADVANCEMENT (§46). Owner: WP-tournament-structure.
Bracket construction lives in `fixtures.ts#knockoutBracket`; slot resolution (who currently occupies a
`bracket_winner` / `fixture_winner` slot) in `qualification.ts#resolveStageSlots`, which delegates the
per-fixture decision to `knockoutAdvancer` below.

### `standardBracketOrder`

Standard bracket order of seeds for a power-of-two `size`: 2 → [1,2]; 4 → [1,4,2,3]; 8 → [1,8,4,5,2,7,3,6].
Adjacent pairs meet in round 1; seeds 1 and 2 are in opposite halves.

### `bracketShape`

Bracket geometry for `entrants` teams playing `rounds` rounds (null = to a single winner): size P (next power of
two), total rounds log2 P, rounds actually played, and the number of main-bracket winners of the last played
round. Used by `slots.ts` to expand `knockout_winners` before any fixture exists.

### `SeededEntrant`

An entrant with the information seeding methods need.

- `rank`: Rank for `ranking` seeding (1 = best): source-stage record normalised with `StageConfig.seedingNormalization`,
  or the pre-tournament seed for a first-stage knockout. Only available once the entrant's slot is `final`.
- `poolIndex`: Source pool index and finishing position for `fixed` cross-pool seeding (A1, B2…).

### `seedEntrants`

Orders entrants into SEED order for `knockoutBracket` (which always pairs 1vN in standard bracket order):
- `fixed`: seeds chosen so that standard pairing yields cross-pool round 1 — A1 v B2, B1 v A2 (2 pools; seed
  order A1, B1, A2, B2); for 4 pools × 2: A1 v B2, C1 v D2, B1 v A2, D1 v C2 — winners of the same pool land in
  opposite halves. That couple construction (TOURNAMENT_RULES_ENGINE §6.1.1) applies only when every source pool
  contributes exactly two entrants and the pool count is even; 4 pools × 2 → seed order A1, B1, D1, C1, D2, C2,
  A2, B2. Otherwise pool-positioned entrants are ordered by (position, pool index), entrants without a pool
  position follow by slot index, and a REPAIR pass (§6.1.2) walks round-1 pairs in position order: when both
  sides come from the same pool, it swaps the second side with the second side of the next pair (wrapping)
  if that makes both pairs cross-pool. Example 3 pools × 2: byes to A1 and B1, round 1 = A2 v C2 and C1 v B2.
  This supersedes the unrepaired "C1 v C2" outcome described in EDGE_CASES EC-T-19; a same-pool round-1 pairing
  survives only when no swap works, and the preview then warns ("Two Pool C teams meet in the first round").
- `random`: seeded shuffle (`rng.ts`), `seed` required.
- `ranking`: by `rank` ascending (1 v N, 2 v N−1 …); every rank must be known (see `knockoutGenerationGuard`).

### `knockoutGenerationGuard`

Knockout generation guard: `ranking` seeding requires every entry slot resolution to be `final` (pairings are
never built on provisional ranks — "Seeding by ranking is possible once all 8 qualifiers are known.");
`fixed` and `random` may be generated from unresolved slots.

### `knockoutAdvancer`

Who advances from a knockout fixture (`config` = the stage's `KnockoutConfig`, else `DEFAULT_KNOCKOUT_CONFIG`
for custom stages; `sideTeams` = the fixture's FROZEN sides when it has a match):
- win / walkover / awarded with winner → that team (`result`/`walkover`/`awarded`);
- tie with decider (super over, boundary count, …) → decider winner (`tie_decider`);
- undecided tie → `config.tiedMatch` (`higher_seed` → better `seedOf`; `organizer`, or `super_over` when the
  super over(s) still left it undecided → `organizer_required`);
- no result / abandoned → `config.noResult` (`higher_seed`; `shared` → `shared` with no single winner — only
  the champion logic uses it; `replay` / `organizer` → `organizer_required`);
- no terminal match → `not_played`.
`seedOf(teamId)` = `StageSlot.seed` of the entry slot the team occupies in this stage, else its pre-tournament
seed, else null (unknown seeds never win `higher_seed` → `organizer_required`).
A `slot_assignment` override on the winner slot always wins (handled by `resolveStageSlots`).

## `src/domain/tournament/slots.ts`

### `SourceBracketShape`

Shape of a knockout source stage's LAST PLAYED round (see `knockout.ts#bracketShape`).

- `lastRound`: Round number (1-based) whose main-bracket winners leave the stage.
- `positions`: Main-bracket positions in that round (winners produced).
- `entrants` (optional, additive): the source stage's entrant count n. Only affects LABELS, never sources: when
  `lastRound` is 1 and n is below the bracket size, some positions are byes, so the `knockout_winners` slots are
  labelled like the fixtures they come from (§5.2 numbering of the round's existing fixtures) and bye positions
  are named after the bye seed. Omitted → positions are numbered 1..positions, which is only right without byes,
  so callers that know the entrant count (`instantiateTemplate`, re-expansion by services) pass it.

STAGE SLOT CONSTRUCTION (§44, §45). Owner: WP-tournament-structure.
Turns builder-level entry rules into concrete, individually editable slots. Resolution of slots to teams is
`qualification.ts#resolveStageSlots` (WP-tournament-standings).

### `expandEntryRules`

Expands a TARGET stage's entry rules into ordered ENTRY slots (`role: 'entry'`, `seed: null`), e.g.
`top_per_pool 2` over pools A, B → A1, B1, A2, B2 (by position, then pool order; `fromPosition 3` → A3, B3,
A4, B4); `pool_position` → one slot; `best_of_position` → "Best runner-up", "2nd best runner-up"… (`rank`
1..count); `top_overall` → "1st overall"…; `knockout_winners` → one `bracket_winner` slot per main-bracket
position of the source stage's last played round (`sourceBrackets`, known from its entrant count — no fixture
needs to exist); `manual` → `manual` slots (team null); `direct_entry` → `manual` slots with the team set.
Slot indexes are contiguous from 0 in rule order. Labels are short and human ("A1", "Best 3rd #2").
`best_of_position` labels deliberately use two styles by position (BR-QL-03, U-SLOT-05): position 1 →
"Best pool winner", "2nd best pool winner"…; position 2 → "Best runner-up", "2nd best runner-up"…; position
k ≥ 3 → "Best 3rd", "Best 3rd #2", "Best 4th #3"… (rank 1 carries no suffix). `defaultSlotLabel` returns the
same strings.
`knockout_winners` labels follow the source bracket's fixture labels: "Winner QF1" is the winner of the fixture
labelled QF1, i.e. the first EXISTING fixture of the round in position order (TOURNAMENT_RULES_ENGINE §5.2). With
`sourceBrackets.entrants` given and round-1 byes, a bye position is labelled with the seed that receives the bye
("QF seed 1"; round short names SF, QF, R16, R32, else "R1"), so every slot label is distinct. Example, a
quarterfinal-only stage with 6 entrants: positions 0..3 → "QF seed 1", "Winner QF1", "QF seed 2", "Winner QF2"
(the resolver's bye explanation then reads "QF seed 1 (bye): Tigers", QUALIFICATION_ENGINE §7.2).
Re-expansion (source stage pools changed, knockout re-drawn) passes the stage's current slots as `existing`:
slot ids are KEPT by index so pool entries, fixtures and overrides that reference them stay valid; surplus
existing slots are returned in `removed`.

### `explainEntryRules`

"Top 2 from each pool", "Pool winners + best 4 runners-up", "Top 8 overall", "Organizer selects 4", "3rd and 4th of each pool", "2 direct entries" (§98).

### `defaultSlotLabel`

Default short label for a slot source ("A1", "B2", "Best runner-up", "Winner SF1", "Loser SF2", "Winner QF3", "TBD").

- `names › bracketLabel`: "SF1" for (round, position) of a stage's main bracket.

## `src/domain/tournament/defaults.ts`

Competition defaults as DATA (§40, §41, §43, §97). Owner: WP-tournament-structure.
They only pre-fill the tournament wizard; every value is editable and stored with the tournament, so changing
these constants never alters existing tournaments.

### `DEFAULT_POINTS_SYSTEM`

2 / 1 / 1 / 0 (§40).

### `DEFAULT_NRR_CONFIG`

ICC method (§41).

### `DEFAULT_TIE_BREAKERS`

Points → NRR → Head-to-Head → Most wins → Organizer decision (§43).

### `DEFAULT_KNOCKOUT_CONFIG`

Also the fallback `knockoutAdvancer` uses for stages without a knockout config (custom page playoffs).

### `DEFAULT_STAGE_CONFIGS`

Stage config pre-fill per stage type (entry rules are added by the stage builder; the wizard sets
`decidesChampion` on the last stage of the main chain).

## `src/domain/tournament/templates.ts`

TOURNAMENT TEMPLATES (§56). Owner: WP-tournament-structure.

### `builtinTemplates`

Built-in templates (ids prefixed `builtin:`, `createdAt/updatedAt` = '2026-01-01T00:00:00.000Z', rules from
`defaults.ts` and the T20 preset unless stated):
1. `builtin:8-team-t20` — 8-Team T20: group stage 2 pools × 4, single round robin; one knockout stage
   "Knockouts" (`decidesChampion`) with entry `top_per_pool 2` (entry slots A1, B1, A2, B2, indexes 0–3),
   seeding `fixed` (A1 v B2, B1 v A2); the SF + Final bracket adds PROGRESSION slots "Winner SF1/SF2"
   (indexes 4–5, `bracket_winner`) — the §92 scenario.
2. `builtin:4-team-league` — single league (`decidesChampion`), double round robin, top of table is champion.
3. `builtin:8-team-knockout` — one knockout stage, 8 entrants seeded by `ranking` (pre-tournament seeds, set
   with the teams — `addTeams` takes seeds).
4. `builtin:16-team-groups` — 4 pools × 4 single RR; top 2 per pool → knockout (QF, SF, Final), `fixed`.
5. `builtin:20-team-pools` — 4 pools × 5 single RR; pool winners → knockout (SF, Final), `fixed`.
Every template has exactly one `decidesChampion` stage. Returned array is frozen data; same content on every
call.

### `InstantiatedStructure`

- `slots`: Entry slots of later stages (expanded from the template's entry rules).
- `poolEntries`: Slot members of pools built from qualifiers (`TemplateStage.poolSlotIndexes`).

### `instantiateTemplate`

Creates the structure of a new tournament from a template (no teams assigned, no fixtures): stages in order
with fresh ids, pools named via `pools.ts#poolName`, entry slots via `slots.ts#expandEntryRules`
(`knockout_winners` expands from the source stage's bracket shape — no fixtures needed; `direct_entry` →
manual slots to fill with teams), and pool entries of qualifier-built pools from `poolSlotIndexes`.

### `templateFromSnapshot`

Saves an existing tournament's structure as a user template (teams, fixtures, results stripped). Must always
produce an instantiable template: slot-built pools → `poolSlotIndexes`; knockout progression and
`bracket_winner` entry slots → `knockout_winners`; direct entries → `direct_entry { count }`.

### `templateFitsTeamCount`

Whether a template suits `teamCount` teams; message explains a mismatch ("Designed for 8 teams; you have 10.").

## `src/domain/tournament/stateMachine.ts`

STATE MACHINES & EDIT POLICIES (§39, §55, §61–§63). Owner: WP-tournament-structure.
The diagrams and full matrices live in docs/architecture/STATE_MACHINES.md; these guards are their single
executable form. Services call them before every status change or structural edit; UI uses the policies to
enable/disable actions and choose between silent / warning / confirmation flows.

### `EditPermission`

- `allowed`: apply directly (audited once the tournament is active);
- `warn`: show the impact preview, one tap to continue;
- `confirm`: impact preview + explicit confirmation + reason (historical data affected, §55);
- `forbidden`: not possible in this state (explain why and what to do instead).

### `TournamentGuardContext`

- `poolsComplete`: Every pool-based stage has all of its ENTRANTS (`evaluate.ts#stageEntrants`: entry slots incl. direct
  entries; for a stage without entry rules the active teams not directly entered elsewhere) assigned to pools.
  Teams entering a later stage directly never count as unassigned in stage 1.
- `firstStageFixturesConfirmed`: The first stage has confirmed fixtures.

### `canTransitionTournament`

§62: draft → registration → structure_configured → pools_configured → fixtures_generated → active →
completed → archived. Also: backward steps among the setup states while `matchesStarted === 0`;
`pools_configured → fixtures_generated` requires confirmed fixtures; knockout-only tournaments pass
`pools_configured` once seeding is done; `fixtures_generated → active` when the first match starts (automatic)
or the organizer starts the tournament; `active → completed` requires `championDecided || allStagesComplete`;
`completed → active` (reopen, audited); `completed ⇄ archived`.
Every other pair is refused with the status labels: "A tournament can't go from Draft to Active."; when the
target comes earlier in the lifecycle order above, the sentence says "back to" ("A tournament can't go from
Active back to Draft.", TOURNAMENT_RULES_ENGINE §12.1). Same status → "The tournament is already Active."

### `TournamentEditPolicy`

- `seeds`: Team seeds (`team_seeds_change`): reorders tables through the `seed` tie-breaker and seeding.
- `deleteTournament`: Deleting the whole tournament: `allowed` while no match has started; `confirm` afterwards (typed name +
  explicit opt-in to delete completed matches; service previews match/event counts; backup recommended);
  never silent (§55, §99).

### `tournamentEditPolicy`

§55 matrix: before any match starts → broad changes `allowed` (pools after fixtures exist → `warn`, fixtures are
regenerated); matches started but none completed → structural changes `warn`; completed matches exist →
`confirm` for anything touching pools, played fixtures, rules, qualification, NRR or results (team removal
becomes withdrawal); `completed` → only info `allowed`, results/overrides/rules `confirm`, structure
`forbidden` (reopen first); `archived` → everything `forbidden` except unarchive.

### `canTransitionStage`

pending → active → completed; completed → active when a result is corrected/reopened.

### `canTransitionFixture`

§39: scheduled → postponed → rescheduled → live → completed; scheduled|rescheduled → cancelled;
postponed → cancelled; live → abandoned; scheduled|rescheduled → completed (walkover/award without play);
scheduled|rescheduled → abandoned (washout); abandoned → rescheduled (replay: `replayAllowed` =
`StageConfig.abandonedMatches === 'replay'`, or `KnockoutConfig.noResult === 'replay'` for knockout stages;
the service clears `fixtures.match_id` in the same transaction); completed|abandoned → live (match reopened);
cancelled → scheduled (restore, audited); rescheduled → postponed (postponed again, an organizer state,
EDGE_CASES EC-T-13); postponed → completed (only through its match, e.g. the walkover match that `planChange`
creates for a withdrawn team's postponed fixture, EC-Q-13). These 19 edges are the whole guard. The last two
closed contract gap G-8 at integration; the change is additive, so nothing allowed before is refused now. Mirror
targets (`live`, `completed`, `abandoned`) still need `hasMatch`. A postponed fixture cannot go `live` or
`abandoned` directly: it is rescheduled first.

### `canTransitionMatch`

§63: scheduled → live ⇄ paused → completed; scheduled → postponed → scheduled; scheduled|postponed →
cancelled; scheduled|postponed → completed (walkover/awarded — only with no deliveries) or abandoned
(washout); live|paused → abandoned; live|paused → completed (incl. result types tie / no_result);
completed|abandoned → live|paused (reopen = undo of `match_ended`); cancelled → scheduled.

### `MatchEditPolicy`

- `details`: Title, venue, date/time.
- `teams`: Teams (only before play).
- `rules`: Rules other than overs revision (which is an event), incl. per-team side sizes (`teamAPlayers/teamBPlayers`).
  Live: `confirm` and the log must still replay cleanly.
- `squads`: Add players (incl. substitute fielders) any time; removing a player referenced by any event — delivery
  columns or payload — is always `forbidden` (enforced by FKs).
- `scoring`: Appending scoring events.
- `history`: Historical edits of recorded events (§16): live → `warn`; completed → `confirm` (+ tournament impact).

## `src/domain/tournament/nrr.ts`

NET RUN RATE ENGINE (§41) — the ONLY place NRR is computed. Owner: WP-tournament-standings.
Input is `MatchSummary` (never events). Rules per `NrrConfig` (types/competition.ts):
- ICC mode: an all-out innings counts the batting side's FULL allotted balls (after revision) as faced, and
  the same figure as bowled for the opponent. A chase won early counts the actual balls.
- Revised targets (`icc_par`): the side batting first is credited with (target − 1) runs off the chasing
  side's allotted balls; the chasing side is unaffected.
- Excluded by default: no result, abandoned, walkover, awarded; super overs ALWAYS excluded;
  cancelled matches never have summaries.
- Overs = balls ÷ ballsPerOver of each innings (mixed formats allowed); NRR = runsFor/oversFor −
  runsAgainst/oversAgainst; null when either overs total is 0.

### `NrrContribution`

One team's NRR contribution from one match.

- `ballsFor`: Balls faced after adjustment (for display "overs faced").

### `matchNrrContributions`

Contributions of both teams for one match, or null when the match is excluded under `config`
(e.g. no result with `includeNoResult: false`). `expungedTeamIds`: teams whose results are expunged
(override) — the match is then excluded for both teams.

### `TeamNrrAggregate`

- `nrr`: null when no counted overs.

### `aggregateNrr`

Aggregates contributions for `teamIds` over `summaries` (only matches between listed teams when `restrictToTeams`).

### `computeNrr`

(runsFor ÷ oversFor) − (runsAgainst ÷ oversAgainst); null when either overs value is 0.

### `compareNrr`

Compares NRR values treating |a − b| < NRR_EPSILON as equal; null sorts last. Returns <0 when `a` ranks higher.

## `src/domain/tournament/tiebreakers.ts`

TIE-BREAKER ENGINE (§43, §98). Owner: WP-tournament-standings.
Ranking is data-driven by the configured ordered chain; nothing assumes "Points → NRR".

### `TeamRecord`

Everything the comparators need for one team in one table.

- `seed`: Pre-tournament seed (lower = better) or null.
- `name`: Display name, used ONLY for explanation text (never for ordering).

### `HeadToHeadRecord`

One team's record in the mini-league of the level teams' mutual matches (table's points system and NRR config).

- `nrr`: NRR over the mini-league matches only; null when no NRR-counted mutual match.

### `RankContext`

- `headToHead`: Mini-league among exactly `teamIds` (their mutual matches with counted results). Teams with no mutual result
  get zeros; `complete` = every pair of `teamIds` has at least one counted result. Used by `head_to_head`
  (points), `head_to_head_wins` and `head_to_head_nrr`.
- `headToHeadRequiresCompleteMiniLeague`: Skip head-to-head criteria (teams stay level for the next criterion) unless the mini-league is `complete`.
- `resolutions`: Active `tie_resolution` overrides of this table (organizer decision / draw of lots).

### `RankedTeam`

- `position`: 1-based; level teams share the position of the first of them.
- `separatedBy`: Criterion that separated this team from the next team below; null if last or still level.
- `detail`: "Ahead of Lions on net run rate (+0.512 vs +0.231)" / "Level with Lions — organizer decision required".

### `rankTeams`

Ranks teams. Algorithm: stable-sort the whole group by the first criterion; every run of teams still level is
split by the NEXT criterion evaluated among that run only (head-to-head recomputed for the run); continue
until the chain is exhausted. `organizer_decision` / `draw_lots` apply a resolution whose `orderedTeamIds`
set equals the level run; otherwise the run stays level (shared position). Final fallback for display order
of still-level teams: input order (never alphabetical — it would look like a decision). NRR comparisons use
`compareNrr` (epsilon). Deterministic.

### `describeTieBreakerChain`

"Points → NRR → Head-to-Head" (§98).

### `tieBreakerLabel`

Short label per criterion: "Points", "NRR", "Head-to-Head", "Head-to-Head wins", "Head-to-Head NRR", "Most wins", "Fewest losses", "Runs scored", "Wickets taken", "Seeding", "Organizer decision", "Draw of lots".

## `src/domain/tournament/standings.ts`

STANDINGS ENGINE (§42, §50, §54). Owner: WP-tournament-standings.
"StandingCalculator" of §60. Pure; recomputed from summaries after every match completion/edit (§66).

### `EffectiveStageRules`

Effective rules for a stage: stage overrides, else tournament defaults.

### `StandingsMember`

One row-to-be of a table: a pool member (team or slot) with its current resolution, or a replaced/withdrawn
predecessor kept so opponents keep their results (`membership` ≠ `active`, never qualifies).
`inheritsFrom`: teams whose played results are aggregated INTO this row (`transfer_to_replacement`).

### `StandingsInput`

- `poolId`: null for an overall (cross-pool) table.
- `members`: Table members in pool order (see `StandingsMember`).
- `fixtures`: Fixtures in scope (pool fixtures, or all stage fixtures for an overall table).
- `fixtureTeams`: Teams of a fixture: its FROZEN sides (`Fixture.matchSides`) once it has a match, else the current resolution
  of its sides; null when unresolved.
- `overrides`: All overrides of the tournament; only active ones of matching kind/stage/pool are applied.
- `normalization`: Only for cross-pool tables across uneven pools (§32). Default `raw`.
- `poolOrder`: Required for `drop_extra_results`: every pool's members in FINAL order (ranked), so results against the
  lowest-placed teams of larger pools can be dropped.

### `computeStandings`

Builds one table:
- A fixture counts when its CURRENT match has a summary and both of its (frozen) teams are members of the
  table — active members, kept predecessors, or teams listed in a member's `inheritsFrom` (whose results then
  count for that member's row).
- Result mapping: win/awarded-with-winner → W/L; tie → T (or W/L when decided and
  `superOverDecidedTie: 'win_loss'`); no_result, abandoned, awarded-without-winner → NR; walkover → W/L with
  walkover points. Cancelled fixtures: nothing.
- Points per `PointsSystem` + bonus + active `points_adjustment` overrides; `expunge_results` overrides
  remove every result of that team (for all teams) from the table.
- NRR via `nrr.ts#aggregateNrr` over the counted summaries only.
- `matchesRemaining` = scope fixtures involving the member that are not terminal/cancelled.
- Ranking via `tiebreakers.ts#rankTeams` with head-to-head mini-league records computed from counted
  summaries among level teams. Unresolved slot members rank after resolved ones, by slot label.
- `per_match_average` / `drop_extra_results` normalisation applies before ranking when requested.
- Every level group is reported in `provisionalTies`; `unresolvedTies` is left empty — `evaluate.ts` moves the
  groups that need an organizer decision now (table complete or tie final, straddling a slot boundary).
Rows carry `qualification: null`; `evaluate.ts` attaches qualification.

## `src/domain/tournament/qualification.ts`

QUALIFICATION ENGINE (§44, §45, §47, §51, §98). Owner: WP-tournament-standings.
Never hard-codes "top 2 qualify": everything flows from `StageConfig.entryRules` → `StageSlot.source`
(slots are built by `slots.ts#expandEntryRules`; slots, not rules, are authoritative).

### `resolveStageSlots`

Resolves the slots of `stageId` from the evaluations of EARLIER stages (and knockout fixtures of this stage):
- `pool_position` / `overall_position` / `best_of_position` read the source stage tables (the matching
  `comparisonTables` entry for the source's normalisation); `final` when the source pool/stage is complete or
  the position is mathematically locked, `provisional` otherwise; `pending` when the table has no played
  matches. Rows with `membership` ≠ `active` never occupy a slot.
- `bracket_winner` / `bracket_loser`: the `main` fixture at (round, position) of the source stage;
  `fixture_winner` / `fixture_loser`: that fixture — both via `knockout.ts#knockoutAdvancer` with the
  fixture's FROZEN sides (`Fixture.matchSides`) once it has a match.
- `manual` with a team (incl. direct entries) → that team, `final`.
- Active overrides win: `slot_assignment` pins a slot; `qualification.qualify` places a team in `slotId`;
  `qualification.eliminate` removes the team from automatic resolution (the next team moves up).
- ENTRY slots only (`role: 'entry'`): a team may occupy one entry slot per stage — later entry slots skip teams
  already placed (explained in text). Progression slots ("Winner SF1") are never subject to this rule.

### `QualificationOptions`

- `enumerationLimit`: Max number of undecided fixtures for exact enumeration of remaining outcomes (default 8). The outcome set of
  each fixture is DERIVED from its effective `PointsSystem`: every distinct (pointsA, pointsB, W/L/T/NR deltas)
  produced by side A win, side B win, either win + bonus (`bonus`), tie, a decided tie under
  `superOverDecidedTie: 'win_loss'`, no result, abandoned (`abandoned` points) and either walkover
  (`walkoverWin/Loss`) — deduplicated. Above the limit, sound points-bound reasoning is used with each fixture's
  MAXIMUM available points (incl. bonus) — it never claims certainty wrongly and may say "in contention"
  instead.

### `computeQualification`

Qualification status of `stageId`'s teams (§51) with respect to EVERY downstream stage — each stage with an
entry slot whose source references `stageId` (Cup and Plate fed by the same groups are both targets):
- per target: `qualified` + `mathematical` when in every enumerated outcome the team occupies one of that
  stage's entry slots; level-on-points situations are treated pessimistically (NRR unknown → assume the team
  loses the tie-break); `eliminated` + `mathematical` when in no outcome can it occupy one even winning every
  tie-break; otherwise `in_contention`; after the stage completes every status is final;
- the top-level fields summarise the primary target (see `TeamQualification`);
- overrides → `certainty: 'manual'` with the override attached.
`explanation` follows §98: "Tigers have mathematically qualified for the Semifinal as Pool A winners (Top 2
from each pool; Points → NRR → Head-to-Head)." / "Eagles are out of the Cup but have qualified for the Plate
semifinal as Pool A 3rd."

### `resolveChampion`

Champion (§82) of the stage with `StageConfig.decidesChampion` (never "the last stage", so a Plate ordered
last cannot produce the champion):
- an active `champion` override wins (`manual`, or `shared` with several teams);
- knockout/custom: winner of the stage's `isFinal` fixture once terminal (`final`); a washed-out final with
  `noResult: 'shared'` → both teams (`shared`); `organizer_required` → null until a `champion` override exists;
- league / single-pool group: top of the table once complete (`league_table`).
Null while undecided.

## `src/domain/tournament/evaluate.ts`

### `evaluateTournament`

TOURNAMENT EVALUATION PIPELINE (§42–§51, §66). Owner: WP-tournament-standings.
One pure call that the dashboard, standings, qualification, bracket, what-if and impact screens all use:

```
  for each stage in `orderIndex` order (every slot source has a lower orderIndex):
    slots   = resolveStageSlots(snapshot, stage, earlier)            // entry + knockout progression
    members = pool entries resolved through slots (+ kept predecessors of replaced/withdrawn teams)
    tables  = computeStandings per pool; comparisonTables (overall + every best_of_position source, each with
              its normalisation; poolOrder for drop_extra_results)
    ties    = level groups needing a decision now → unresolvedTies (table complete or tie final AND the group
              straddles a slot boundary of a downstream stage); all others stay provisionalTies
    qualification = computeQualification(snapshot, stage, tables, earlier)   // per downstream target
  champion = resolveChampion(...)                                       // stage with decidesChampion
```

Fixture sides are FROZEN once a fixture has a match (`Fixture.matchSides`); slots are resolved only for
fixtures without a match.
Performance target: 128 teams / 16 pools / ~500 fixtures in < 100 ms without enumeration; enumeration is
bounded by `enumerationLimit`.

### `resolveSideTeam`

Team currently behind a pool member / fixture side (team side, or the slot's resolved team); null when unresolved.

### `resolveFixtureTeams`

Teams of a fixture: `fixture.matchSides` when it has a match (`frozen: true`), else both sides resolved via
`resolveSideTeam`. The ONLY way UI/services may name a fixture's teams.

### `stageEntrants`

A stage's entrants (§29 "teams entering"): its entry slots as `slot` sides (direct entries included); for a
stage without entry rules, the active tournament teams not directly entered into another stage. Used by pool
assignment, `poolWarnings` and the `poolsComplete` guard.

## `src/domain/tournament/whatif.ts`

WHAT-IF SIMULATION (§48). Owner: WP-tournament-standings.
"What if Team A wins the next match?" — current table → hypothetical results → simulated table →
qualification consequences. NEVER modifies the real tournament: works on a copied snapshot in memory; nothing
is persisted or audited.

### `hypotheticalSummary`

Synthetic `MatchSummary` for a hypothetical result on an unplayed fixture: win / tie (with optional
`tieWinner` as a super-over decider) / no result / abandoned / walkover, bonus point flag honoured by the
points system. Without `score`, innings are empty (points move, NRR does not). With `score`, innings use the
given runs/balls and all-out flags; allotted balls from the fixture's effective rules. `squads` empty.

### `simulate`

Evaluates the tournament before and after applying `hypotheticals` (only fixtures without a terminal match are
allowed; others are ignored and reported in `narrative`). Hypotheticals are applied STAGE BY STAGE in
`orderIndex` order, re-resolving slots between stages, so chained knockout what-ifs work (QF winner, then the
SF it feeds). Within a stage they are applied round by round (`bracket.round`), and slots are re-resolved
before every new stage or round that follows an applied hypothetical — also for fixtures whose sides already
resolve provisionally, so a group what-if that swaps A1 and A2 changes the semifinal sides the later
semifinal what-ifs use. A hypothetical whose fixture sides are still unresolved at its stage is skipped and reported.
Returns table diffs, qualification and slot changes, and plain-language consequences.

## `src/domain/tournament/impact.ts`

IMPACT PREVIEW — "WHAT WILL CHANGE" (§34, §55, §99). Owner: WP-tournament-standings.
Every service method that changes pools, fixtures, stages, rules, seeds, overrides or a completed match's
result in a tournament calls `computeImpact` first, shows the sheet ([Cancel] [Continue]), and stores the
confirmed `ImpactSummary` in the audit entry. Pure.

ONE interpretation of every change: `planChange` produces the row operations; `computeImpact` previews
`applyPlan(snapshot, planChange(…))`; `TournamentService.applyChange` persists the SAME plan (computed again
from the same snapshot version — the service refuses with CONFLICT if the version moved since the preview).
Ids for new rows come from the change itself (prefilled by helpers such as `fixturesForPoolMove`) or from
`ctx.ids`; everything shown in the preview is id-independent.

### `planChange`

Turns a change into typed row operations (no validation beyond structural consistency). Semantics:
- `pool_move`: move the member's pool entry; delete `removeFixtureIds`; insert `addFixtures`; played fixtures
  keep their teams and pool.
- `pool_swap`: exchange the two pool entries; rewrite the members in each other's UNPLAYED fixtures of those
  pools; played fixtures keep their teams.
- `team_replace`: Y takes X's pool entries and unplayed fixtures; X's membership → `replaced`
  (`replacedByTeamId` Y); per `priorResults`: `transfer_to_replacement` sets Y's `inheritsFromTeamId` = X,
  `keep_for_opponents` changes nothing else, `expunge` adds an `expunge_results` override for X.
- `team_withdraw`: membership → `withdrawn`; remaining fixtures → `matchesToCreate` with a
  `match_ended { walkover }` event for the opponent, or status `cancelled`; optional `expunge_results`.
- `pools_replace`: replace the stage's pool entries (members may be slots); fixtures with matches are kept;
  `seed` stored in `StageConfig.seedingSeed`.
- `team_seeds_change`: tournament team seeds.
- `stage_upsert` / `stage_delete`: the stage with its pools and slots (only stages without started matches),
  and RE-EXPANSION of the entry slots of every stage sourcing it (`slots.ts#expandEntryRules` with `existing`,
  slot ids kept by index; slots that disappear are deleted with their pool entries/fixture references
  rewritten to the new slots or removed when unplayed).
- `fixture_add` / `fixture_update` / `fixture_delete`; `fixtures_replace` swaps fixtures without a match,
  upserts `slots`, stores `seed` and re-expands dependent stages.
- `match_result_change`: `summaryChanges` only (preview; MatchService writes the match).
- `rules_change`: tournament `rules`, or the stage's config via `stages.upsert`.
- `slot_change`: slot source edit. Played fixtures through that slot keep their frozen teams (`SlotChange`).
- `override_apply` / `override_revoke`.

### `applyPlan`

Applies a plan to an in-memory copy of the snapshot (what the database will contain after
`TournamentService.applyChange` persists it; created walkover matches appear as summaries).

### `applyChange`

`applyPlan(snapshot, planChange(snapshot, change, ctx))` — convenience for what-if style previews and tests.

### `computeImpact`

Diffs `evaluateTournament(snapshot)` against `evaluateTournament(applyPlan(snapshot, planChange(…)))` and
inspects affected fixtures. Severity: `destructive` if started/completed match data would be detached, removed
or re-attributed; `warning` if standings, NRR, qualification or slots change; `info` for scheduling-only
changes; `none` otherwise. `blocked` when `stateMachine.ts#tournamentEditPolicy` forbids the change in the
current status (e.g. deleting a fixture with a completed match — its match must be handled explicitly first).
`headline`/`lines` are ready-to-render sentences: "3 fixtures will be regenerated (1 already played).",
"Lions move from 2nd to 3rd in Pool A.", "Tigers are no longer qualified for the Semifinal.",
"Net run rate changes for 4 teams.", "Tigers' 3 results transfer to Eagles."
Wave 3: the replay of an abandoned fixture is previewable (see `ProposedChange` `fixture_update` (replay)); the
preview shows the superseded no result leaving the tables, so the organizer sees WHAT WILL CHANGE before the
replay, and `TournamentService.updateFixture` audits the same impact.

## `src/domain/tournament/stats.ts`

### `computeTournamentStats`

TOURNAMENT STATISTICS (§52) — computed locally from `MatchSummary`s (regular innings only; super overs
excluded). Owner: WP-tournament-standings.
- Team: matches, wins, losses, points and NRR taken from the evaluation's tables (summed across stages for
  matches/wins/losses/runs; points/NRR from the team's LAST group/league table), runs scored/conceded.
- Player: matches (from `MatchSummary.squads`, so a player who neither batted nor bowled still played), runs,
  innings, not outs, average (runs ÷ dismissals), strike rate, 4s, 6s, highest score, balls bowled, runs
  conceded, wickets, economy, best bowling (most wickets, then fewest runs).
- Records: highest team score, highest individual score, best bowling, most sixes/fours (player totals),
  highest partnership. Ties in records → earliest match number.
No fake/sample statistics (§103): empty tournaments return zeros and nulls.

## `src/db/types.ts`

Minimal SQLite contract used by repositories and the migration runner (§57–§59, §89). Owner: WP-db.

It mirrors the subset of the expo-sqlite async API we use, so the same repositories run against:
- the app database: an adapter over expo-sqlite's `SQLiteDatabase` (`src/db/client.ts`);
- tests: an adapter over sql.js (`src/db/testing/sqljsDatabase.ts`, `/** @jest-environment node *\/`).
expo-sqlite's own types are NOT imported here, so this module stays runtime-agnostic.

Binding rules: only `string | number | null | Uint8Array` are bound. Mappers convert booleans to 0/1 and
objects to JSON text explicitly (tables are STRICT, so a wrong type fails loudly instead of being coerced).

Transactions: `withTransactionAsync(task)` runs `task(tx)` inside BEGIN … COMMIT (ROLLBACK and rethrow on
error) and resolves the task's value. Statements of the use case MUST go through the `tx` handle the task
receives (services build `createRepositories(tx)` inside the task). The adapter holds a MUTEX for the whole
transaction: statements issued through `tx` run directly; statements issued on the ROOT database (any other
async read/write, another transaction) wait until the transaction has committed or rolled back — so an
unrelated write can never join, commit or roll back with someone else's use case, and a task can never
deadlock on its own queue. (expo-sqlite's `withTransactionAsync` alone does not isolate interleaved
statements; the expo adapter may build on `withExclusiveTransactionAsync` or on the mutex above.) The sql.js
adapter passes itself as `tx` behind the same mutex. Nested transactions are not supported: cross-service
steps (e.g. MatchService completing a match and refreshing tournament status/champion) compose internal
tx-scoped functions that take `Repositories`, never public service methods.
Connection setup (client, not migrations):
`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;` — FULL makes every committed
ball durable across battery loss (§23; NORMAL in WAL may lose the last commits). `PRAGMA foreign_keys` cannot
change inside a transaction, so it is never part of a migration (see `Migration.foreignKeysOff`).

### `SqlValue`

The only bindable/returned column values: TEXT, INTEGER/REAL, NULL, BLOB.

### `SqlParams`

Positional (`?`) or named (`$name`) parameters.

### `SqlRunResult`

- `lastInsertRowId`: rowid of the last INSERT (unused by repositories: every table has a UUID `id`).
- `changes`: Rows changed by the statement (used by guarded deletes such as `truncateFrom`).

### `SqlDatabase`

The root database handle (`SqlExecutor` plus transactions and close).

- `withTransactionAsync`: Runs `task(tx)` in one transaction under the writer mutex described above; resolves the task's value,
  rolls back and rethrows on error. Not re-entrant.
- `closeAsync`: Closes the connection (tests, and before replacing the database file).

### `SqlExecutor`

Statement execution (available inside and outside transactions).

- `execAsync`: Executes one or more statements without parameters or results (DDL, migrations).
- `getFirstAsync<T>(source: string, params?: SqlParams): Promise<T | n…`: First row or null. Column names are the SELECT aliases (use snake_case rows + mappers).

### `Migration`

A forward-only schema migration. `up` is plain SQL (several statements, no BEGIN/COMMIT — the runner wraps
each migration and its `schema_migrations` row in one transaction). Migrations are frozen once released:
never edit a shipped migration, add a new one.
`foreignKeysOff`: the migration rebuilds tables (12-step procedure). The runner then sets
`PRAGMA foreign_keys = OFF` BEFORE BEGIN, runs the migration, runs `PRAGMA foreign_key_check` before COMMIT
(any row → ROLLBACK and abort startup), commits, and sets `PRAGMA foreign_keys = ON` again (also on failure).

## `src/db/migrations/index.ts`

### `SCHEMA_MIGRATIONS_TABLE_SQL`

Ordered, forward-only migrations (§59 "migration system", §89). Owner: WP-db.

Runner contract (implemented by WP-db in `src/db/migrate.ts`, type below):
1. `execAsync(SCHEMA_MIGRATIONS_TABLE_SQL)` (idempotent bootstrap).
2. Read applied versions; verify they are a prefix of `MIGRATIONS` (unknown/newer version → throw
   `SchemaTooNewError`: the app is older than the data — never touch it).
3. For each pending migration, in ONE transaction: `execAsync(m.up)` then insert its `schema_migrations` row.
   A failure rolls back that migration and aborts startup with a recoverable error screen (§86).
   `m.foreignKeysOff`: foreign keys are switched off around that transaction and `PRAGMA foreign_key_check`
   runs before its COMMIT (see `Migration`).
4. Only when at least one migration ran: `PRAGMA foreign_key_check` must return no rows (else abort, report
   diagnostics). It is NOT run on every launch (foreign keys are always on, and a full check scans every event
   row); it also runs after a backup import and from the Diagnostics screen.

### `MIGRATIONS`

The ordered list the runner applies (currently `[migration001Initial]`). Versions are 1-based and contiguous.

### `LATEST_SCHEMA_VERSION`

Schema version written into backups (`BackupEnvelope.schemaVersion`).

### `MigrationReport`

- `fromVersion`: Highest applied version before the run (0 for a fresh database).
- `toVersion`: Highest applied version after the run (= `LATEST_SCHEMA_VERSION` on success).
- `applied`: Versions applied by this run, in order; empty when nothing ran (then no `foreign_key_check` runs).
  `BootstrapReport.schemaVersion` = `toVersion`.

### `RunMigrations`

Signature of the runner WP-db implements in `src/db/migrate.ts`. `now` is injected (ISO-8601).

## `src/db/migrations/001_initial.ts`

### `migration001Initial`

Schema v1 (§57, §58, §59). Design notes: docs/architecture/DATABASE.md.

Conventions: STRICT tables; TEXT UUID keys; ISO-8601 TEXT timestamps; `YYYY-MM-DD` dates and `HH:MM` times
(GLOB-checked); booleans INTEGER 0/1; JSON as TEXT with json_valid() CHECKs (keys = domain camelCase).

AUTHORITATIVE vs PROJECTION:
- `match_events` is the single, ordered, authoritative scoring log (§14, §59). Deliveries (≈95% of rows) use
  typed columns (§14/§58 "balls"); every other kind stores its payload in `payload_json`.
- `innings`, `partnerships`, `matches.result_json|winner_team_id|summary_json` (and `matches.status` once the
  log is non-empty) are PROJECTIONS rewritten from replay in the same transaction as every log change.

FK policy: RESTRICT for references to the shared library (teams, players, venues) so history can never lose
its referents; CASCADE from an aggregate root to its children (tournament → stages → pools…, match → events);
RESTRICT from matches to their tournament (a tournament delete must delete its matches explicitly, after
confirmation); NO ACTION for cross-references inside an aggregate, so a confirmed whole-aggregate delete
cascades cleanly while deleting a single referenced row (a fixture feeding a slot, a squad player used by
events) is still refused. The circular cross-references (stage_slots ↔ fixtures, fixtures ↔ matches,
pool_teams → stage_slots, memberships) are DEFERRABLE INITIALLY DEFERRED: checked at COMMIT, so backup import
and bracket generation can insert in any order inside one transaction and a dangling reference still aborts it.

### Schema notes (SQL of migration 1)

**Settings**

**Library: venues, teams, players**

**Tournaments**

- `tournament_rules`: §58 tournament_rules: points as columns; NRR options, tie-breaker chain and default match rules as JSON.
- `tournament_stages`: Stage config (fixture generation, seeding, overrides, entryRules = §58 qualification_rules) lives in config_json.
- `stage_slots`: §45 qualification slots. Source references are exposed as generated columns so they get real FKs. role 'entry' = how teams enter the stage (one entry slot per team per stage, enforced by the engine); role 'progression' = knockout progression inside the stage (Winner SF1). Progression indexes follow the highest entry index; seed = bracket seed of an entry slot.
- `pool_teams`: §58 pool_teams: a member is a concrete team XOR a slot (later-stage pools built from qualifiers). A team member must be a member of the same tournament (composite FK to tournament_teams).
- `fixtures`: §58 fixtures. A side is a team (a member of the same tournament) XOR a slot of the same stage. match_id = CURRENT match (replays allowed; cleared when an abandoned fixture is rescheduled for a replay); the composite FK guarantees that match belongs to this fixture. bracket_kind main|third_place|placement; is_final marks the fixture whose winner wins the stage (at most one per stage).

**Matches**

- `matches`: §58 matches. result_json / winner_team_id / summary_json are projections of match_events; projection_version = SCORING_PROJECTION_VERSION of the engine that wrote them (stale ones are rebuilt at bootstrap). A tournament match's fixture must belong to the same tournament (composite FK), its teams must be tournament members, and the tournament cannot be deleted while it has matches (RESTRICT).
- `match_players`: Squad per match: the FK anchor for every player id used by that match's events. is_substitute = substitute fielder (fields only; never bats or bowls). team_id must be one of the match's teams (triggers).
  The rule holds from both sides: `trg_match_players_team_*` and `trg_innings_teams_*` guard the child rows, and
  `trg_matches_teams_update` refuses a change of `matches.team_a_id`/`team_b_id` while any squad row, innings row or
  event team (`match_events.p_team_id`: `battingTeamId`, `teamId`, `outcome.winnerTeamId`) of that match names a team
  outside the new pair. A swap of the two teams, or a change on a match whose rows do not name the old team, is allowed.
  Repositories never change a match's teams (`MatchRepository.update` has no team columns).
- `match_events`: THE AUTHORITATIVE SCORING LOG (§14, §59). One ordered log per match: seq 1..n, contiguous. kind = 'delivery' → typed columns (§58 balls: striker/non-striker/bowler stamps, call, runs, short runs, boundary, wicket), payload_json NULL. Every other kind → payload_json (domain payload minus 'kind'). Player ids inside payloads are exposed as VIRTUAL generated columns (p_*) so they get the same composite FKs as the delivery columns: an event can only name squad members, and a squad member used by ANY event cannot be removed (array fields beyond the two fielders — innings_ended absentees — are checked by MatchRepository.removeSquadPlayer). Derived facts (over/ball numbers, legality, totals) are never stored.

**Projections (recomputable; rewritten from replay after every log change)**

- `innings`: §58 innings: score summary per innings for lists, resume prompt and history cards without replay.
- `partnerships`: §58 partnerships (projection): per-innings partnerships for scorecards/PDF and tournament records.

**Organizer control & history**

- `tournament_overrides`: §47/§54 manual overrides (never deleted; revoked_at keeps history). The stage/pool/slot columns are indexed references that become NULL when the row is deleted (e.g. slots re-expanded); payload_json keeps the ids.
- `audit_events`: §53 audit log (§58 tournament_events). tournament_id NULL = correction of a standalone match. action is validated by the domain (AUDIT_ACTIONS) so new actions need no table rebuild.

**Reusable configuration**

- `tournament_templates`: §56 user templates (built-ins live in code).
- `match_format_presets`: §8 user format presets (built-ins live in code).

## `src/db/repositories/contracts.ts`

REPOSITORY CONTRACTS (§60 "Repositories → SQLite"). Owner: WP-0 (contract); implemented by WP-db in
`src/db/repositories/*.ts` with row⇄domain mappers in `src/db/mappers/*.ts`.

Rules: repositories are the ONLY code that writes SQL; they return domain types; they never open transactions
(services call `db.withTransactionAsync(async (tx) => { const repos = createRepositories(tx); … })` and use
ONLY those repositories inside the task); they never compute cricket or tournament logic (projections are
handed to them already computed). Constraint violations surface as thrown errors; services translate them
into `ServiceError`s.
Writes: `INSERT OR REPLACE` is forbidden (it deletes the old row and cascades to children). Upserts use
`INSERT … ON CONFLICT(id) DO UPDATE`. Batch upserts that rewrite a UNIQUE ordering column
(`upsertStages` order_index, `upsertPools` order_index, `upsertSlots` slot_index) run TWO PHASES in the same
transaction — first every affected row's index += 1_000_000, then the final values — because SQLite checks
UNIQUE row by row and a swap would otherwise collide.

Read models (list items) are domain types so the UI never imports from src/db; re-exported for convenience.

### `MatchProjection`

Everything a service writes after replaying a match (all recomputable, §59). Never written from a replay with
error-severity issues (`MatchState.needsRepair`).

- `projectionVersion`: `SCORING_PROJECTION_VERSION` of the engine that produced it (`matches.projection_version`).

**Repositories**

### `TeamRepository`

- `list`: Alphabetical; archived teams only with `includeArchived`. `search` matches the name or short name with the same
  trimmed, literal, Unicode case-insensitive rule as `MatchListQuery.search`.
- `delete`: Hard delete; throws (FK) when referenced by matches/tournaments — callers archive instead.

### `PlayerRepository`

- `listByTeam`: Players whose home team is `teamId`, archived ones only with `includeArchived`.
- `getMany`: Players by id in any order (guests and squads across teams); missing ids are simply absent.
- `delete`: Hard delete; throws (FK RESTRICT) once the player is in any squad — callers archive instead.

### `VenueRepository`

- `archive`: Soft delete for venues in use (matches/fixtures/tournaments reference venues with RESTRICT).
- `delete`: Hard delete; throws (FK RESTRICT) when referenced — callers archive instead.

### `MatchRepository`

- `getSetup`: Match + teams (with resolved `playersInSide` = team_x_players ?? rules.playersPerSide) + squad (names joined
  from players, `isSubstitute`) — replay input.
- `isSuperseded` (additive, wave 3): true when the match was played for a fixture whose `match_id` no longer points at it
  (the fixture was replayed). `assertMatchTournamentWritable` uses it: every write to such a match (scoring,
  undo/redo, end, history edit, details, rules, toss, squads, pre-play status) is `FORBIDDEN_STATE` "This match was
  replaced by a replay. It stays on record as it was and can no longer be changed." Reading, the scorecard, PDF
  export and backups are unaffected.
- `update`: Updates configuration columns (title, venue, schedule, format, rules, team sizes, toss, pre-play status,
  fixture link, resume dismissal).
- `removeSquadPlayer`: Throws when the player is referenced by any event of the match: delivery columns and fixed payload fields are
  FK-enforced; the repository additionally checks payload arrays (`innings_ended` absentees) with `json_each`
  before deleting.
- `findResumable`: Matches with status live or paused, most recently updated first. `forPrompt: true` (the §23 startup prompt)
  excludes matches with `resume_dismissed_at` set (SAVE & EXIT); Home's "Continue Match" lists all.
- `setResumeDismissed`: SAVE & EXIT (`at`) / cleared (`null`) — services clear it on the next append.
- `listStaleProjections`: Ids of matches with a non-empty log whose `projection_version` is below `version` (bootstrap rebuild).
- `writeProjection`: Rewrites status/result/winner/summary/projection_version columns and the innings + partnerships rows.
- `delete`: Cascades to events, squad and projections. A fixture still pointing at it must be detached first.

### `MatchEventRepository`

The authoritative log (`match_events`).

- `listByMatch`: Ordered by seq.
- `lastSeq`: 0 for an empty log.
- `append`: Inserts in order; UNIQUE(match_id, seq) rejects a stale writer.
- `truncateFrom`: Undo: `DELETE … WHERE match_id = ? AND seq >= fromSeq` (the service passes `undone[0].seq`). Throws — and the
  transaction rolls back — when the log's MAX(seq) before the delete is not `expectedLastSeq` or the deleted
  row count is not `expectedLastSeq − fromSeq + 1`. Returns rows deleted.
- `replaceAll`: History edit: replaces the whole log (delete + insert) — caller is inside a transaction.

### `TournamentRepository`

- `list`: Fixture counts computed in SQL; `championName` joined from the `champion_json` projection (never computed
  here). Most recently updated first. `search` matches the tournament name with the same trimmed, literal, Unicode
  case-insensitive rule as `MatchListQuery.search`; `statuses: []` lists nothing.
- `getSnapshot`: Everything for the engines in one read: `version` (= revision), fixtures with `matchSides` joined from their
  current match row, `summaries` of current terminal matches whose projection is up to date, and
  `staleSummaryMatchIds` for those whose `projection_version` is older (their summaries are excluded), and
  `supersededMatches` (wave 3): matches whose `fixture_id` points at a fixture of this tournament whose `match_id` is
  another match or null, ordered by `created_at`.
- `bumpRevision`: Increments `tournaments.revision` and returns the new value. Services call it in EVERY transaction that
  writes the tournament aggregate, a fixture mirror or a summary of one of its matches.
- `writeChampion`: Champion projection (`champion_json`), written from `evaluateTournament` whenever it can change.
- `deletionFootprint`: What deleting the tournament would destroy (the §99 preview).
- `listMatchIds`: Match ids of the tournament (explicit deletion before `delete`, since matches → tournament is RESTRICT).
- `delete`: Deletes the tournament aggregate; throws (RESTRICT) while any of its matches still exists.
- `applyPlanRows`: Executes a domain `ChangePlan`'s row operations in the documented order (tournament teams → stages → pools →
  slots → pool entries → fixtures → overrides). `matchesToCreate` and `summaryChanges` are NOT handled here
  (MatchRepository / MatchService).
- `replacePoolEntries`: Replaces all pool entries of a stage (team or slot members; `tournament_id` taken from the stage).
- `insertFixtures`: `matchSides` is a read model and is ignored on write.

### `AuditRepository`

- `append`: Append-only; there is no update or delete (§53).
- `before`: Keyset paging: entries strictly older than this timestamp.

### `SettingsRepository`

`app_settings` key → JSON value, one row per top-level `AppSettings` key.

- `getAll`: Stored keys only; `SettingsService.load` fills missing keys with defaults (so a new setting needs no migration).
- `set`: Upserts one key (`ON CONFLICT(key) DO UPDATE`) with its update time.

### `TemplateRepository`

User templates (`tournament_templates`); built-ins come from `tournament/templates.ts#builtinTemplates` and are
never stored.

### `FormatPresetRepository`

User format presets (`match_format_presets`); built-ins come from `BUILTIN_FORMAT_PRESETS` and are never stored.
Deleting a preset never changes a match (matches store full rules).

### `Repositories`

The bundle `createRepositories` returns — one repository per concern, all bound to the same executor (the root
database or one transaction's `tx`).

### `BackupRepository`

Raw authoritative data in/out for JSON backup (§84); validation happens in export/backup + services.

- `importData`: Inserts rows in `BackupData` order (circular FKs are deferred to COMMIT). The caller has already applied the
  policy per aggregate: skipped aggregates removed from `data`, copies remapped (`remapBackupIds`), replaced
  aggregates deleted with `deleteAggregate`. Library rows that exist locally are left as they are
  (`keep_local`) or updated in place with `ON CONFLICT(id) DO UPDATE` (`update_local`). Never
  `INSERT OR REPLACE`.
- `deleteAggregate`: Explicit deletion of a local aggregate before `replace_existing` (a tournament's matches first).
- `aggregateFootprint`: Rows of a local aggregate, to report what `replace_existing` would destroy.

### `CreateRepositories`

Implemented by WP-db in `src/db/repositories/index.ts`. Inside a use case pass the transaction handle
(`withTransactionAsync(async (tx) => createRepositories(tx)…)`); outside transactions (plain reads) pass the
root database.

## `src/services/contracts.ts`

APPLICATION SERVICE CONTRACTS (§60 "Application Services"). Owner: WP-0 (contract); implemented by
WP-services-stores in `src/services/*.ts`.

Every mutating method = one use case = ONE SQLite transaction (§89): validate with the domain → write the
authoritative rows → refresh projections → append audit entries (tournament / historical changes) → commit.
Inside the transaction ONLY the `tx`-scoped repositories are used; steps shared between services (a match of a
tournament completing → fixture mirror, stage/tournament status, champion projection, revision bump) are
internal tx-scoped functions taking `Repositories`, never calls to another public service method.
Any transaction that writes a tournament's aggregate, a fixture mirror or a tournament match's summary bumps
`tournaments.revision` (→ `TournamentSnapshot.version`) and, when the champion can change, rewrites the
champion projection from `evaluateTournament`.
Methods never throw for expected failures; they return `ServiceResult` with a user-facing message (§86) and
technical diagnostics kept separately. Ids, clock and random seeds are injected (`ServiceDeps`).

### `Clock`

Injected time source: `now()` returns ISO-8601 UTC. The app uses the device clock; tests use a fixed or stepping
clock. The domain never calls it — services pass the value in.

### `ServiceResult`

`{ ok: true, value }` or `{ ok: false, error: ServiceError }`. Stores surface `error` and resolve `false`.

### `ServiceErrorCode`

- `'VALIDATION'`: The domain rejected the input (`domainCode` = the `EventValidationCode`, `RulesIssueCode`, fixture or pool code).
- `'NOT_FOUND'`: The match, tournament, fixture or file no longer exists.
- `'STORAGE'`: SQLite or file-system failure (constraint, disk full, I/O); the transaction was rolled back.
- `'IMPORT_INVALID'`: The backup failed validation (`ImportPreview.issues` has the details).
- `'EXPORT_FAILED'`: PDF generation, file write or share failed; no data changed.
- `'CONFLICT'`: The log / tournament changed underneath (stale `expectedLastSeq`, fingerprint or version) — reload and retry.
- `'FORBIDDEN_STATE'`: State machine / edit policy forbids it — incl. writes to a match whose log `needsRepair`.
- `'CONFIRMATION_REQUIRED'`: Change needs an impact confirmation / reason that was not supplied.

### `ServiceError`

- `message`: Organizer-friendly (§86): "Couldn't save this delivery. Your previous match data is still safe."
- `domainCode`: Domain validation code when `VALIDATION`.
- `detail`: Technical diagnostics (settings → diagnostics), never shown raw.

### `LiveMatch`

A match loaded for scoring/scorecard. `state` = replayMatch(setup, events). When `state.needsRepair` the UI
shows "This match needs repair" (issues listed in diagnostics) and offers only history edit / undo.

### `HistoryEditPreview`

- `baseFingerprint`: `logFingerprint` of the log the ops were computed against; `applyHistoryEdit` requires it back.
- `impact`: Tournament impact when the match belongs to a tournament and standings-relevant data changes.
- `requiresReason`: Completed match or tournament impact → a reason is required to apply.

### `MatchService`

WRITE GUARD for every log-changing method (record, undo, redo, applyHistoryEdit, endMatch, updateRules,
rebuildProjections): the RESULTING log must replay with no error-severity issue; appending to a log that
`needsRepair` is refused (`FORBIDDEN_STATE`, "This match needs repair"), and projections are never written from
a degraded replay. The repair path is `applyHistoryEdit` (or `undo`) whose result replays cleanly.

ARCHIVED LOCK (BR-CC-02, EC-T-23): while a match's tournament is `archived`, every write of that match is refused
with `FORBIDDEN_STATE` ("This tournament is archived. Unarchive it before making changes.") before anything else is
checked, whether or not its summary would change: record, undo, redo, endMatch, previewHistoryEdit,
applyHistoryEdit, updateDetails, updateRules, setToss, setPrePlayStatus, addSquadPlayer and removeSquadPlayer.

REOPEN OF A COMPLETED TOURNAMENT (EC-Q-32, BR-TS-01): any write that takes a tournament match from `completed` or
`abandoned` back to an unfinished status (undo of `match_ended`, or a history edit that removes it) moves a
`completed` tournament to `active` in the same transaction. It is audited as `tournament_status_changed` with
the reopen reason. Re-closing the match leaves the tournament `active` until the organizer completes it again.
A correction that keeps the match finished leaves the tournament `completed` (FR-10g).

- `createMatch`: Creates the match, its squads and (optionally) its opening events — e.g. `innings_started` from the setup
  wizard — in ONE transaction, so a crash can never leave a created-but-unstarted match behind.
- `record`: §23 pipeline: validate each payload (mode `append`) against the evolving state → insert events (one
  `actionId`) → refresh projections (+ fixture mirror, stage/tournament status, revision bump, champion
  projection, `result_recorded` audit when a `match_ended` is included) → clear the SAVE & EXIT dismissal →
  commit → return the new state. `expectedLastSeq` (= `state.lastSeq`, the log tail) guards against stale
  writers. When the group ends a tournament match (the scoring screen's `end_match` intent), the outcome's own
  `reason` is the audit reason (§53) and the impact is computed as in `endMatch`. An outcome that carries a
  reason (`no_result`, `abandoned`, `walkover`, `awarded`) needs a non-blank one (`CONFIRMATION_REQUIRED`).
  `natural` and `tie_decided` need none.
- `undo`: Removes the last action group (`truncateFrom(undone[0].seq, expectedLastSeq)`). Undoing `match_ended` of a
  tournament match requires `reason` (audited `match_reopened` with impact).
- `redo`: Re-appends a previously undone group (session-scoped redo stack). A group containing `match_ended` follows
  `endMatch`'s rules: tournament matches need `reason`, audited `result_recorded` with impact.
- `applyHistoryEdit`: Applies ops computed against the previewed log: `CONFLICT` unless `expectedFingerprint` equals the current
  `logFingerprint`. ALWAYS audited (live or completed): `match_history_edited` or `result_corrected`, previous
  value = removed/replaced events, new value = inserted events, impact = the one previewed.
- `updateRules`: Rule edits other than overs revision, incl. per-team side sizes; must keep the log valid (replayed before
  commit). Audited `match_rules_changed` when the policy says `confirm`.
- `setToss`: Audited `match_toss_changed` when the policy says `confirm`.
- `addSquadPlayer`: Adds an existing player or creates a new one (gully "add player on the fly"); `isSubstitute` for a substitute
  fielder / 12th man. Audited `match_squad_changed` for completed/tournament matches.
- `removeSquadPlayer`: Only players referenced by no event (FK-enforced); otherwise `FORBIDDEN_STATE`.
- `endMatch`: Ends a match without play or mid-play (walkover, abandon, no result, award) — appends `match_ended`.
- `discard`: §23 DISCARD: deletes an unfinished STANDALONE match. Tournament matches cannot be discarded.
- `dismissResume`: §23 SAVE & EXIT: the match stays live but is skipped by the startup prompt until the next append.
- `load`: Match + setup + events + `replayMatch` state (RESUME, scorecard, edit). Read-only; never writes projections.
- `updateDetails`: Title, venue, date and time; `allowed` in every status (edit policy `details`), not audited.
- `setPrePlayStatus`: §39/§63 pre-play states for a match with an EMPTY log: postpone, cancel, restore to scheduled
  (guarded by `canTransitionMatch`; `FORBIDDEN_STATE` once any event exists). For a tournament match the fixture
  status follows in the same transaction; restore from `cancelled` is audited.
- `delete`: History "Delete" (§81): standalone matches only, after confirmation; a match linked to a fixture is
  `FORBIDDEN_STATE` (tournament data is removed only through tournament actions). DISCARD is the §23 variant for
  unfinished matches.
- `list`: History / Home lists (`MatchListQuery`: search, filters, sort, paging) from projections, no replay.
- `findResumable`: Live/paused matches; `forPrompt` excludes SAVE & EXIT-dismissed ones (startup prompt).
- `rebuildProjections`: §59 recovery: replay and rewrite projections with the current `SCORING_PROJECTION_VERSION` (also used after
  import and by bootstrap for stale projections). Refused for a log that `needsRepair`.
- `auditLog` (additive, gap G-10, V1): the audit entries of one match, standalone or tournament, newest first,
  keyset-paged by `createdAt` (`AuditRepository.list({ matchId, limit, before })`). Read-only. Standalone matches
  write their entries with `tournamentId` null, so this is the only way to read them (FR-C-07).

### `AuditPage`

Additive. One page of an audit trail: at most `limit` entries created strictly before `before` (omitted = newest).
`TournamentService.auditLog` takes the same shape inline.

### `MatchDetailsPatch` / `MatchRulesPatch` / `PrePlayStatus`

Additive names for the inline parameter types of `MatchService.updateDetails`, `updateRules` and
`setPrePlayStatus` (derived with `Parameters<…>`, so they can never drift). The store contract uses them.

### `TeamService`

The global team, player and venue library (§27).

- `create`: Team plus its initial players in one transaction (`NewTeamInput`, `captainIndex`).
- `archive`: Hides a team from pickers; its matches, tournaments and players keep their history.
- `archivePlayer`: Same for a player; squads that used the player are untouched.
- `archiveVenue`: Venues in use are archived (never deleted: completed scorecards keep their venue).

### `NewTournamentInput`

§26 tournament information saved by the first wizard step: name, season, description, organizer, date window
(`YYYY-MM-DD`, start ≤ end), venues, structure kind and the template it was created from (null = custom).

### `FixturePlan`

Generated fixtures plus any progression slots they need (knockout `bracket_winner` / `bracket_loser`), the
entry-slot seeds of a knockout, and the seed of a random draw (shown and reproducible, §31; persisted to
`StageConfig.seedingSeed` and the audit entry on confirm).

### `PoolAssignmentMethod`

Pool assignment (§30). Members are `FixtureSide`s. `from_slots`: pools of a later stage built from its entry
slots (Super 8: `snake`, or the template's `fixed_order`).

### `ChangePreview`

A previewed change and the snapshot version it was computed on (preview == apply).

### `TournamentService`

- `create`: Creates the tournament row (status `draft`) and its default rules (`defaults.ts`) — wizard step 1.
- `list`: Tournaments list read model (§82), incl. SQL fixture counts and the champion projection.
- `snapshot`: The versioned `TournamentSnapshot` (engine input) without evaluating it.
- `updateInfo`: §26 information edits (edit policy `info`; forbidden while archived).
- `revokeOverride`: Sets `revokedAt` + reason on an override (never deleted, §47), previewed like `applyOverride`.
- `setStatus`: Status change guarded by `canTransitionTournament` (incl. reopen `completed → active` with a reason,
  archive and unarchive); audited `tournament_status_changed`.
- `whatIf`: §48 simulation via `whatif.simulate` on the current snapshot. Never persisted, never audited.
- `stats`: §52 statistics from the snapshot's summaries (`computeTournamentStats`).
- `auditLog`: §53 audit entries of the tournament, newest first, keyset-paged by `createdAt`.
- `listTemplates`: Built-in plus user templates (§56).
- `saveAsTemplate`: `templateFromSnapshot` of this tournament's structure stored as a user template.
- `evaluate`: Pure evaluation of the current snapshot (standings, NRR, slots, qualification, champion). Not persisted.
- `addTeams`: Adds teams with their optional pre-tournament seeds (§27). Later seed edits: `team_seeds_change`.
- `removeTeams`: Setup states only (no fixture references the team); after play a team is withdrawn (`team_withdraw`).
- `saveStructure`: Replaces stage/pool/slot/pool-entry structure (setup states only; later use `applyChange`). `poolEntries`
  may contain slot members (pools built from qualifiers).
- `previewPoolAssignment`: Preview only (§31: never silently replace).
- `generateFixtures`: Pure plan for the §36 preview (no persistence): round robin per pool (each pool's `legs`), or a knockout
  bracket with its progression slots (seed order via `seedEntrants`; `ranking` refused until every entry slot
  is final — `knockoutGenerationGuard`). `seed` reproduces a random draw; omitted → a fresh seed is generated
  and returned in the plan.
- `confirmFixtures`: Confirms a (possibly edited) plan: replaces the stage's — or pool's — fixtures that have NO match with the
  plan's fixtures, upserts its slots and entry-slot seeds, stores the draw seed, and re-expands the entry slots
  of dependent stages (slot ids kept by index); fixtures with matches are kept. After play has started this
  goes through the impact preview (`fixtures_replace`).
- `addFixture`: §37 "+ Add Match" (manual fixture).
- `previewChange`: WHAT WILL CHANGE (§34, §99) for any structural/result/rules/seed change, with the snapshot version it used.
- `applyChange`: Applies after confirmation: `CONFLICT` unless the snapshot version still equals `confirmation.version`; then
  persists `planChange(snapshot, change)` (the same plan the preview evaluated) in one transaction; `reason`
  required when the preview said so. Audited with `confirmation.impact` — the impact the organizer saw.
- `updateFixture`: Scheduling edits (`FixturePatch.status` is limited to organizer states). Rescheduling an abandoned fixture
  for a replay (`isFixtureReplay`) goes through the same path as `applyChange` (wave 3): `computeImpact` on the
  `fixture_update`, `FORBIDDEN_STATE` when it is blocked, `CONFIRMATION_REQUIRED` without a reason (the impact
  always requires one, because a no result leaves the standings), then `planChange` persists the replayed fixture
  (`fixtures.match_id` cleared; the old match keeps its `fixture_id`, events and summary) in one transaction. The
  audit entry is `fixture_status_changed` with `matchId` = the superseded match, `previousValue` = the old status,
  match and schedule, `newValue` = the change, and `impact` = the computed impact. The replay patch may carry the
  new date, time, venue, notes and label; `formatId`/`matchRules` in a replay patch are `FORBIDDEN_STATE`. Any other
  schedule edit of a played fixture stays FORBIDDEN_STATE. The same replay can be previewed with
  `previewChange({ kind: 'fixture_update', fixtureId, patch: { status: 'rescheduled', … } })` and applied with
  `applyChange`. Patches that affect standings go through `previewChange`/`applyChange` (`fixture_update`) instead.
- `startFixtureMatch`: §66: creates the match from the fixture and links it, in one transaction. Teams = the fixture's sides
  resolved NOW (team A = side A); from then on the fixture's sides are frozen (`Fixture.matchSides`). Team A is
  never "the side batting first": the opening `innings_started.battingTeamId` names it, with or without a toss
  (wave 3; validated against the toss, `TOSS_MISMATCH` rolls back). A replayed fixture starts a NEW match here. Rules =
  fixture → stage → tournament defaults; when the stage's `KnockoutConfig.tiedMatch` is `super_over`,
  `rules.superOver.enabled` is forced to true. `openingEvents` (additive, gap G-6) mirrors
  `MatchService.createMatch`: the events (normally the `innings_started` built by the setup wizard) are validated
  in `append` mode against the new match and inserted in the SAME transaction, so a fixture can never be left
  with a created match and an empty log. Omitted = no events (the match opens at the `start_next_innings`
  prompt). A validation failure rolls the whole start back (`VALIDATION`).
- `applyOverride`: Overrides are previewed like changes (`override_apply`); `expectedVersion` from that preview.
- `previewDelete`: §99 WHAT WILL BE LOST before deleting a tournament: its matches (completed ones) and their events.
- `delete`: Deletes the tournament. `typedName` must equal the tournament's name; when any match has started,
  `deleteCompletedMatches` must be true (`CONFIRMATION_REQUIRED` otherwise) and the UI offers a tournament
  backup first. Matches are deleted explicitly (matches → tournaments is RESTRICT), then the aggregate — one
  transaction.

### `TournamentInfoPatch` / `FixtureMatchSetup` / `GenerateFixturesOptions`

Additive names for the parameter types of `TournamentService.updateInfo`, `startFixtureMatch` (its `setup`) and
`generateFixtures` (its `opts`). The first two are derived with `Parameters<…>`; `GenerateFixturesOptions` is the
same shape as the inline `opts`.

### `TournamentDeletePreview` / `TournamentDeleteConfirmation`

Additive names for the result of `previewDelete` and the `confirm` argument of `delete` (same shapes as inline).

### `BackupService`

- `exportBackup`: Writes `scorebook-backup-<date>.json` to the cache directory and returns its URI (share via ExportService).
- `previewImport`: Reads and validates the picked file without writing anything (`ImportPreview`: issues, counts,
  `previouslyImportedAt`, per-aggregate conflicts with local-only counts). Pipeline: BACKUP_RESTORE.md §4–§5.
- `applyImport`: Re-validates, then applies the chosen `ImportConflictPolicy` in ONE transaction (skip / remapped
  copy / explicit delete then insert), rebuilds projections by replay, runs `foreign_key_check` and audits
  `backup_imported`. Any failure rolls everything back (`IMPORT_INVALID` / `STORAGE`). Calls run one at a time,
  and a successful import consumes the preview, so a second call for the same file needs a new preview.
  `replace_existing` never moves `tournaments.revision` backwards: the replaced tournament ends strictly above
  the local revision it replaced, so a `ChangePreview` taken before any restore gets `CONFLICT` (§34, §99).

### `ImportReport`

Rows imported and skipped per `BackupEntity`, and how many matches were replayed to rebuild projections.

### `ExportService`

- `scorecardPdf`: Offline PDF scorecard (§83) via expo-print; returns the file URI.
- `tournamentPdf`: Tournament standings/results PDF (§82).
- `share`: Opens the system share sheet (expo-sharing) for a file this app wrote (§95 sharing; no cloud). A
  cancelled share is a success; an unavailable share sheet is `EXPORT_FAILED`.

### `SettingsService`

- `load`: Stored settings merged over the defaults defined in `services/settings` (`defaultFormatId` falls back to
  `DEFAULT_FORMAT_ID`; sound stays off in V1, DESIGN_SYSTEM.md §9).
- `update`: Persists only the changed top-level keys in one transaction and returns the merged settings.

### `BootstrapReport`

- `resumable`: Matches to offer in the §23 "MATCH IN PROGRESS" prompt (live/paused, not dismissed by SAVE & EXIT).
- `projectionsRebuilt`: Projections rebuilt because an older scoring engine wrote them (`SCORING_PROJECTION_VERSION`).
- `integrityIssues`: Matches whose log failed to replay cleanly (§93) — shown in diagnostics, data untouched.
- `pragmas` (additive, wave 2, gap G-15, optional): the connection pragmas read after the database opened, as a
  `DatabasePragmas { foreignKeys; journalMode; synchronous }` (the shape of `db/client.ts` `ConnectionPragmas`, so
  `bootstrap()` can pass `readConnectionPragmas(db)` through). Diagnostics shows them as
  `foreign_keys=1 journal_mode=wal synchronous=2` (`diag-text-pragmas`, AC-E1-02, FR-02b) and "Not available"
  while they are absent. Since the wave-2 integration `bootstrap()` fills it with `readConnectionPragmas(db)`; a
  failed pragma read gives `null` and never fails the bootstrap.

### `AppServices`

- `bootstrap`: Called once by the root layout: open the DB (foreign_keys ON, WAL, synchronous FULL) → run migrations
  (`foreign_key_check` only when a migration ran) → rebuild stale projections (`listStaleProjections`, one
  transaction per match; logs that need repair are skipped and reported) → replay live/paused matches only
  (integrity) → load the resume prompt list.
- `newId`: UUID for drafts built in wizards (stages, pools, slots).
- `checkIntegrity` (additive, gap G-9): the Diagnostics screen's on-demand database check (FR-B-06, W-X3). Runs
  `PRAGMA foreign_key_check` and replays every match's log without writing anything, and returns an
  `IntegrityReport`. Read-only; never repairs.

### `IntegrityReport`

Additive. `checkedAt` (clock time of the check), `foreignKeyViolations` (rows reported by `foreign_key_check`,
0 on a healthy database) and `matchesNeedingRepair` (matches whose log replays with an error-severity issue).

### `ServiceDeps` / `CreateAppServices`

Additive (gap G-7). Everything the service layer needs from the platform, injected so services stay testable
over sql.js. `CreateAppServices = (deps: ServiceDeps) => AppServices` is the factory type. The app's factory and
the test harness `createTestApp(db, deps)` (INTEGRATION_TEST_PLAN §0.1) both satisfy it.

- `openDatabase`: opens the database. The app passes `openAppDatabase` (`db/client.ts`); tests return their sql.js
  adapter. `bootstrap()` calls it once, so a failure to open becomes a `ServiceResult` error on the bootstrap
  screen (§86). The gap register proposed an already-open `db: SqlDatabase`; an opener is used instead because
  `bootstrap` is documented as the step that opens the database.
- `clock`: the `Clock`; `newId`: the `IdGenerator` (UUIDs via expo-crypto in the app, sequential in tests);
  `newSeed`: a fresh draw seed for `generateFixtures` / `previewPoolAssignment` when none is given.
- `fileSystem` (`FileSystemAdapter`): cache directory, text write and read (backup JSON), move (rename a printed
  PDF) and remove. Backed by expo-file-system in the app and an in-memory map in tests.
- `printer` (`PrintAdapter`): `printToFile(html)` returns the URI of the PDF (expo-print).
- `sharer` (`ShareAdapter`): `isAvailable()` and `share(uri, { mimeType, dialogTitle })` (expo-sharing).
  `ShareMimeType` is the union `ExportService.share` accepts.

Haptics and sound are not service dependencies. No service method produces feedback; `useScoringFeedback`
(COMPONENT_ARCHITECTURE §5.4) triggers them from the UI after a committed dispatch and honours `useSettingsStore`.

## `src/stores/contracts.ts`

ZUSTAND STORE CONTRACTS (§60 "State Management", §88 "no single global state object"). Owner: WP-0
(contract); implemented by WP-services-stores as one file per store in `src/stores/`, each exporting a hook
`useXStore = create<XStore>()(…)`. Screens read with selectors (`useLiveMatchStore(s => s.live?.state.chase)`)
and call actions; they never call services or the database directly (§60, §103).
Actions resolve to `true` on success; on failure they set `error` (user-facing message) and resolve `false`.

### `AsyncStatus`

`idle` (nothing loaded) → `loading` (first load) → `ready`; `saving` while a mutation is in flight (the previous
data stays visible); `error` when a load failed (a failed mutation keeps `ready` and sets `error`).

### `TournamentWizardStep`

The seven wizard steps in order: `info → teams → structure → rules → pools → fixtures → review` (§25).

### `Toast`

A transient message: `kind` selects the icon and tokens (never colour alone), `action` is an optional single
action such as "Try Again" (§86) or "Undo".

### `AppStore`

`useAppStore` — app bootstrap (DB open, migrations, integrity check, settings load). The root layout calls
`bootstrap()` once and renders the app when `status === 'ready'` (recoverable error screen otherwise). The
§23 "MATCH IN PROGRESS" prompt is rendered by Home from `report.resumable` (via `useHomeStore`).

- `checkIntegrity` (additive, gap G-9): the Diagnostics screen's [Run database check]
  (`AppServices.checkIntegrity`); resolves the `IntegrityReport` or null (then `error` is set). It never changes
  `status` or `report`.

### `LiveMatchStore`

`useLiveMatchStore` — the scoring screen (§9–§19), plus the scorecard, ball log, edit-ball and manage-match screens
of the open match (COMPONENT_ARCHITECTURE §4.3).

- `redoStack`: Undone action groups, most recent last. SESSION-scoped (memory only): cleared by `open`, `close`, a CONFLICT
  reload, any `dispatch` and every other action below that changes the log (`applyHistoryEdit`, `updateRules`).
  Lost on app restart. Never persisted.
- `dispatch`: `buildEvents` → `MatchService.record(matchId, live.state.lastSeq, events)` → publish the committed state
  (§23 order). Serialised: one at a time. On CONFLICT: reload, clear redo, surface the error. The published
  `live.match` matches the stored row: `resumeDismissedAt` is cleared and `updatedAt` is the commit time.
- `redo`: `MatchService.redo(matchId, live.state.lastSeq, group, reason)`; `reason` needed for a group with `match_ended` of a tournament match.

Additive actions (gap G-1). Each goes through the store's serial queue like `dispatch`, calls the `MatchService`
method of the same name for the open match, publishes the returned `LiveMatch` (or reloads it when the service
returns only a `Match`) and, for a tournament match, calls `useTournamentStore.getState().refresh()` when that
tournament is open. On failure they set `error` and leave `live` unchanged.
- `previewHistoryEdit(ops)`: WHAT WILL CHANGE for a past-ball edit (§16). Resolves the `HistoryEditPreview` or null.
  Nothing is written. The edit screen keeps the preview.
- `applyHistoryEdit(ops, reason, preview)`: applies exactly what was previewed by passing
  `preview.baseFingerprint` as `expectedFingerprint`. `reason` is required when `preview.requiresReason`. On
  CONFLICT (the log changed since the preview) the store reloads and the screen previews again.
- `updateDetails(patch)`, `updateRules(patch, reason)`, `setToss(toss, reason)`, `setPrePlayStatus(status, reason)`,
  `removeSquadPlayer(playerId)`: the manage-match and squad actions. Ending a match stays `dispatch` of the
  `end_match` intent.
- `loadAudit(page)` (additive, gap G-10, V1): one page of this match's audit trail (`MatchService.auditLog`).
  Resolves the entries or null. Not kept in the store.

### `HomeStore`

`useHomeStore` — home screen (§5, §23, §79).

- `resumable`: "Continue Match": every live/paused match (SAVE & EXIT-dismissed ones included).
- `dismissResume`: §23 SAVE & EXIT on the startup prompt (`MatchService.dismissResume`).
- `discard` (additive, gap G-2): §23 DISCARD after the screen's confirmation (`MatchService.discard`). Standalone
  unfinished matches only; the prompt offers no DISCARD for a tournament match (`FORBIDDEN_STATE` otherwise).
  On success the store reloads, so the match leaves `resumable` and `recent`.

### `MatchHistoryStore`

`useMatchHistoryStore` — history list (§81).

- `remove`: History "Delete" (`MatchService.delete`), after the screen's confirmation; the list reloads the page.

### `MatchSetupDraft`

In-memory draft of the standalone match setup wizard (§64); nothing persists until `submit`.

- `teamAPlayers`: Side sizes when a team plays short/long by agreement; null = `rules.playersPerSide`.
- `battingFirstTeamId` (optional, additive, wave 3): the side that bats first when the toss is NOT recorded
  ("Toss not recorded" → "Who bats first?"). Ignored while `toss` is set (the toss decides). `undefined` = null.
- `substitutesA`: Substitute fielders named before play (more can be added during the match).
- `fixtureId`: Set when started from a tournament fixture (§66): teams/rules pre-filled and locked.

### `MatchSetupStore`

`useMatchSetupStore`.

- `startFromFixture`: Pre-fills from a fixture (teams, stage/fixture rules).
- `submit`: `MatchService.createMatch(input, [innings_started])` — match, squads and the opening event in ONE
  transaction; resolves the new match id or null. The opening event's `battingTeamId` is
  `openingBattingTeam({ teamAId, teamBId }, draft.toss, draft.battingFirstTeamId)` (wave 3): the toss when recorded,
  otherwise the explicit choice. Team A and Team B are submitted exactly as chosen; nothing is swapped. When all
  three openers are set but neither a toss nor a choice names the batting side, `submit` resolves null with a
  `VALIDATION` error ("Choose which team bats first, or record the toss.", `BATTING_FIRST_REQUIRED`) and saves
  nothing. Without openers no event is sent and the scoring screen asks who bats first. When `draft.fixtureId` is set (§66) it calls
  `TournamentService.startFixtureMatch(fixtureId, setup, [innings_started])` instead (teams frozen, super over
  forced for `tiedMatch: 'super_over'`). Since gap G-6 was closed this is also ONE transaction: match, squads,
  fixture link and opening event commit together. A call made while a submit is in flight (double tap, FR-11)
  is ignored: it resolves null at once and changes no state. Each squad entry's `isCaptain` comes from the team's
  `captainId`, and `isWicketKeeper` marks the first player in the XI whose library role is `wicket_keeper`
  (substitutes are never flagged). If the team cannot be read, the flags stay false and the match is still created.

### `TournamentListStore`

`useTournamentListStore` (§82).

### `TournamentStore`

`useTournamentStore` — the open tournament: snapshot + evaluation (standings, NRR, slots, qualification),
shared by dashboard, standings, fixtures, pools, stages, qualification, bracket, stats and audit screens.
Refreshed after every tournament mutation and whenever a match of this tournament changes (§66).

- `previewChange`: WHAT WILL CHANGE preview (impact + snapshot version); null on failure (see `error`).
- `applyChange`: Applies exactly what was previewed: pass the `ChangePreview` back (CONFLICT → refresh and re-preview).

Overrides (§47) go through `previewChange({ kind: 'override_apply' | 'override_revoke' … })` + `applyChange`.

Additive actions (gap G-5, COMPONENT_ARCHITECTURE §6.4), all for the open tournament (`tournamentId`). Mutations
call the `TournamentService` method of the same name, then `refresh()` and resolve `true`. Queries resolve their
value, or null with `error` set, and keep nothing in the store, like `previewChange`.
- `whatIf(hypotheticals)`: §48 simulation (`TournamentService.whatIf`). Never persisted, never audited, and never
  touches `snapshot` or `evaluation`. The what-if screen never calls `applyChange`.
- `loadStats()`: §52 statistics. `loadAudit(page)`: one page of the §53 audit log, newest first.
- `updateFixture(fixtureId, patch, reason)`: scheduling edits guarded by `canTransitionFixture`. Patches that
  affect standings go through `previewChange({ kind: 'fixture_update' })` + `applyChange` instead.
- `addFixture(draft)`: §37 manual fixture.
- `generateFixtures(stageId, opts)`: pure plan for the §36 preview (null on failure); `confirmFixtures(stageId, plan)`
  persists the (possibly edited) plan. These serve later stages after the wizard, for example knockout
  generation once the pools are complete.
- `setStatus(to, reason)`, `updateInfo(patch)`, `saveAsTemplate(meta)` (resolves the stored template),
  `listTemplates()`.
- `previewDelete()`: §99 WHAT WILL BE LOST. `delete(confirm)`: deletes and then clears the store (`tournamentId`,
  `snapshot` and `evaluation` become null). The tournaments list reloads separately.

### `TournamentWizardDraft`

Draft of the tournament creation wizard (§25, §65). The tournament row is created at the first `saveStep`
(status `draft`) and each later step persists progressively through the §62 states, so an interrupted wizard
resumes from the tournaments list. Pool assignment and fixture drafts stay previews until their step is saved.

- `teams`: Teams with optional pre-tournament seeds (§27).
- `poolAssignment`: Members are `FixtureSide`s (teams, or entry slots for pools built from qualifiers).

### `TournamentWizardStore`

`useTournamentWizardStore`.

- `resume`: Resume an unfinished wizard for a tournament in a setup state.
- `saveStep`: Persists the current step (and advances the tournament status per §62 guards).
- `commit`: Final confirmation (§25 "Confirm Tournament"); resolves the tournament id.
  `saveStep` and `commit` share one in-flight guard: a call made while either is running (double tap, FR-11) is
  ignored and resolves false (`saveStep`) or null (`commit`) without changing state.
- `listTemplates` (additive, found at integration): built-in plus user templates for the structure step's
  `TemplatePicker` (`TournamentService.listTemplates`). No tournament has to be open. Resolves the list or null.

### `SettingsStore`

`useSettingsStore` (§5, §70, §76–§78). Loaded once at bootstrap; theme provider subscribes to `settings.theme`.

### `ToastStore`

`useToastStore` — transient messages (§86 "[Try Again]").

### `TeamLibraryStore` / `TeamDetail`

Additive (gap G-3). `useTeamLibraryStore`: the global team, player and venue library (§27) over `TeamService`, used
by the teams screens, the match-setup team and venue pickers and the tournament wizard's team picker
(COMPONENT_ARCHITECTURE §4.4).
- `load(opts)`: `teams` (archived ones only with `includeArchived`, filtered by `search`) and `venues`.
- `loadTeam(teamId)`: `detail` = the team and its players (`TeamService.get`).
- `createTeam`, `addPlayer` and `createVenue` resolve the created row (null on failure), so a picker can select it
  at once. `updateTeam`, `updatePlayer` and the `archive…` actions resolve booleans. Every mutation reloads
  `teams`/`venues`, and reloads `detail` when it names that team.

### `ExportStore`

Additive (gap G-4). `useExportStore`: PDF and sharing (§82, §83, §95) over `ExportService`.
`scorecardPdf(matchId)` and `tournamentPdf(tournamentId)` resolve the written file URI (null on failure, with
`error`). `share(fileUri, mimeType)` opens the system share sheet; a cancelled share resolves `true`.

### `BackupStore`

Additive (gap G-4). `useBackupStore`: backup and import (§84, BACKUP_RESTORE §10) over `BackupService`.
- `exportBackup(scope)`: writes the file, sets `exportedFileUri`, resolves it (null on failure). The screen then
  shares it through `useExportStore.share(uri, 'application/json')`.
- `previewImport(fileUri)`: validates without writing; sets `importFileUri` and `preview` (the `ImportPreview`).
  A file that fails validation still sets `preview` (its `ok` is false and `issues` explain why), so the
  screen can show the reasons.
- `applyImport(fileUri, policy)`: applies the chosen policy to the previewed file; sets `report` (`ImportReport`).
  Refused unless `fileUri` equals `importFileUri` and `preview.ok`. After success, the app reloads the home,
  history and tournaments lists. A call made while an import is in flight (double tap) is ignored and resolves
  false without changing state.
- `reset()`: clears the file URIs, `preview`, `report` and `error`.

### `AppServicesRegistry`

Additive (gap G-7). How stores reach the services: WP-services-stores provides `src/stores/services.ts` exporting
`setAppServices(services)` and `getAppServices()` with the shape of this interface. In the app,
`useAppStore.bootstrap` registers `createAppServices(appDeps)` (the platform adapters live in `src/services`)
before it calls `AppServices.bootstrap()`, unless services are already registered. Tests register
`createTestApp(db, deps)` first. Stores call `getAppServices()` inside actions, never at module load, and screens
never call either function. `getAppServices()` throws when nothing is registered, which is a programming error and
not a `ServiceResult`.

## `src/export/backup/remap.ts`

BACKUP ID REFERENCES & REMAPPING (§84, §93 duplicate import). Owner: WP-export. Pure.

One exhaustive, typed visitor over EVERY id-bearing field of `BackupData` — row keys and foreign keys, and the
ids inside JSON-shaped values: match event payloads (player and team ids, fielder arrays, absentees, outcome
winners), stage `config.entryRules` (sourceStageId, poolId, teamIds), slot `source` (stageId, poolId,
fixtureId, teamId), pool entry and fixture sides, override payloads (stageId, poolId, slotId, teamId(s),
orderedTeamIds), `Tournament.venueIds`, `TournamentTeam.replacedByTeamId / inheritsFromTeamId`,
`Team.captainId`. Audit entries' `previousValue` / `newValue` / `impact` are historical TEXT and keep the
original ids.
`collectIdReferences` and `remapBackupIds` share that visitor, so import validation (`MISSING_REFERENCE`) and
`import_as_copy` can never disagree about what is a reference.

Two roles besides row keys: a REFERENCE must resolve (inside the file, or on the device for teams, players
and venues); a LINK (`IdRole` `'link'`) is remapped with its target collection but is history and never has to
resolve. Links are: `AuditEvent.entityId` (when `entityType` names a collection), `MatchEvent.actionId`, and
the stage / pool / slot ids inside override payloads (`stageId`, `poolId`, `slotId` of every override kind).
Those override ids are kept for history while the indexed `tournament_overrides.stage_id / pool_id / slot_id`
columns become NULL when the row is deleted (slots re-expanded, pool replaced, stage removed), so a backup of
such a device must stay importable; the importer writes NULL to the column when the target row is absent.
Team ids in override payloads (`teamId`, `teamIds[]`, `orderedTeamIds[]`) stay references (teams are
`RESTRICT`).

### `BackupEntity`

Collection an id belongs to (row key) or points at (reference).

### `IdReference`

- `path`: JSON path, e.g. `data.matchEvents[12].fielderIds[0]`.
- `entity`: Collection whose row the id must resolve to.

### `collectIdReferences`

Every id REFERENCE in the data (row keys and links excluded), in document order.

### `remapBackupIds`

Returns a copy of `data` with every row key, reference and link rewritten through `idFor(entity, oldId)` (called
once per distinct (entity, oldId); must be injective). Used by `import_as_copy`; after remapping, every match
must replay with zero error-severity issues (tested).

## `src/ui` (WP-design-system): resolved documentation conflicts

Decisions binding for `src/ui/**` and for every screen that renders these primitives. Each one picks the behaviour most faithful to SPEC.md where the design documents disagree.

### `ErrorState` › `details`

SPEC §86 ("Never expose raw technical errors … Technical diagnostics separately"), FR-A-06, AC-E1-08, ACCESSIBILITY §12, COMPONENT_ARCHITECTURE and DESIGN_SYSTEM §6.16 forbid showing `ServiceError.detail` on screen. WIREFRAMES (bootstrap frame), INFORMATION_ARCHITECTURE §3.8 and USER_FLOWS step 6 show an inline "Technical details ▾" disclosure, because Diagnostics cannot be reached when bootstrap fails. SPEC §86 wins:
- `ErrorState` never renders `details`, collapsed or expanded, and never puts it in an accessibility label or hint.
- When `details` is non-empty, `ErrorState` shows a tertiary `sm` button, "Share technical details" (`testID` `error-btn-details`, icon `share`, 44 pt target through hit slop). It hands `details` to the system share sheet (React Native `Share.share`, message = `details`, title "Scorebook technical details"), so the user can copy or send it for support without the app displaying it. This follows W-X3, where technical details live "only in the copied text"; `expo-clipboard` is not installed. A failed or unavailable share sheet is ignored and nothing is shown.
- `BootstrapGate` keeps passing `error.detail` as `details`, so the bootstrap screen still has a way to get the detail out while Diagnostics is unreachable. Every other screen passes no `details` and points to Diagnostics (W-X3) instead.

### `ButtonVariant` › `tertiaryInverse`

The toast action (DESIGN_SYSTEM §6.10, "a tertiary button in `inverseAccent`") on the light-theme `inverseSurface`. The label is `inverseAccent`. When pressed it does not change: §6.1 rules out an opacity flash, and the `tertiary` pressed swap to `surfaceSunken` would put `inverseAccent` below 3:1 on the inverse surface. Releasing the button runs the action and dismisses the toast, and that is the press feedback. In the dark theme the toast sits on `surfaceElevated`, where `inverseAccent` equals `accent`, so `Toast` uses the plain `tertiary` variant (pressed `surfaceSunken`). `IconButton` tone `inverse` follows the same rule. `destructiveConfirm` (88% opacity) is the only pressed state that changes opacity.

### Focus-visible ring

Every focusable control in `src/ui` draws `border.focus`: a 2 pt `focusRing` outline while it has keyboard or switch focus (DESIGN_SYSTEM §4.2, WCAG 2.4.7). Free-standing controls draw it outside with a 2 pt offset: `Button`, `IconButton` and `ScoreKey`. Full-bleed or adjacent controls draw it inside with a −2 pt offset, so a neighbouring row or a scroll container cannot cover or clip it: `ListRow`, `Tabs` tab, `SegmentedControl` option, `TabBar` item, pressable `StatLine`, pressable `BallChip` and tappable `Table` rows. A scrollable `Table` has one keyboard stop per row, on the fixed first column.

### `StatLine` › `compact`

The compact batter or bowler row is 40 pt visible (RESPONSIVE §3). When it is pressable it gets 2 pt of top and bottom hit slop, which brings the target to 44 (SPEC §72, RESPONSIVE §6).

### `Dialog` › destructive initial focus

`Button` forwards `ref` to its own accessible `Pressable`. A destructive `Dialog` sends initial screen-reader focus to that element, the Cancel button itself, not to a layout wrapper (DESIGN_SYSTEM §6.9, ACCESSIBILITY §4).

### Additive `src/ui` API (wave 1)

Owned by WP-design-system. Nothing in the `src/ui` barrels changed.
- `ButtonProps.ref?: Ref<View>`: forwarded to the button's own `Pressable` (React 19 ref-as-prop). This is what the destructive `Dialog` focuses.
- `buttonSurfaceStyle(theme, variant, pressed, disabled)` (exported from `primitives/Button.tsx`, not from the barrel): the pure surface style of a button state. Tests use it to check contrast and pressed feedback without rendering.
- `focusRingStyle(theme, focused, placement = 'outside')` and `FocusRingPlacement` (`'outside'` | `'inside'`, `primitives/internal/interaction.ts`): `'outside'` offsets the ring by +2 pt and `'inside'` by −2 pt (see "Focus-visible ring" above).

## `src/export/backup` (WP-export): additive internal API (wave 1)

Not contract files. These are recorded so the service layer knows what the barrel exposes.
- `RawBackup.checksumMalformed: boolean` (`parse.ts`, re-exported by `src/export/backup/index.ts`): true when the envelope's `checksum` is present but is not 64 hexadecimal characters. In that case `RawBackup.checksum` is null and validation reports `CHECKSUM_MISMATCH` (an error), never `CHECKSUM_MISSING` (see `BackupEnvelope`).
- `optionalLink(cursor, field, entity, id)` (`ids/cursor.ts`, internal, not in the barrel): visits a nullable LINK id (see `remap.ts`), which is remapped but never has to resolve.

## Wave-3 core fixes: additive contract (2026-10-05)

All additions are optional fields, new exports or new methods. Nothing was renamed or removed.

### `src/domain/scoring/editPlanning.ts` (bugs #1, #2)

- `planHistoryEdit(setup, events, ops, ctx): PlannedHistoryEdit` wraps `applyHistoryEdits`. It applies AUTOMATIC
  resolutions on its own: `reopen_match` (the recorded `match_ended` no longer stands, so it is deleted and the
  match goes back to live) and `confirm_new_result` (a super-over/decided tie is no longer a tie, so the
  `match_ended` outcome becomes `natural`). Any other failure returns `{ ok: false, failure, conflict }`.
- `EditConflict`: `{ code, message, reason, atSeq, eventId, inningsIndex, ballLabel, resolutions }`. `message` is the
  sentence for the scorer ("After this change Shan is on strike for ball 1.3 of the 2nd innings, but that ball
  records Rizwan out caught. Only the striker can be out caught."). `reason` is the raw engine message. `ballLabel` is
  the label of the later ball that no longer fits.
- `EditResolution`: `{ kind, automatic, label, description, ops }`. `kind` is `'reopen_match' | 'confirm_new_result' |
  'keep_strike' | 'dismiss_striker' | 'remove_later_play'`. `ops` is the complete op list for that choice: preview it
  with `previewHistoryEdit(resolution.ops)`, then apply `preview.ops`.
  - `keep_strike`: inserts a `strike_swapped` before the later ball, so every later ball keeps its recorded batters.
  - `dismiss_striker`: the later wicket is recorded against the batter on strike instead.
  - `remove_later_play`: the edit ends the innings or match earlier, so the balls recorded after that point are deleted.
- `EditConsequences`: `{ reopensMatch, resultBefore, resultAfter, targetChanges, removedDeliveries, lines }`.
  `targetChanges` is `{ inningsIndex, teamId, before, after }[]`. `lines` are ready-made sentences, for example "The target
  for Tigers changes from 28 to 32.", "“Tigers won by 9 wickets” no longer stands, so the match is reopened.", "Tigers are
  28/1 after 2.2 overs and need 4 runs from 4 balls.".
- `describeEditConsequences(setup, before, after, removedDeliveries?)`.
- `EditOutcome` failures carry an optional `eventId`.

### `src/domain/scoring/matchDates.ts` (bug #5)

`matchDisplayDate(source): { value, basis: 'played' | 'scheduled' | 'updated' }`. The order is
`startedAt ?? completedAt`, then `scheduledDate`, then `updatedAt`. It accepts a `MatchListItem` or a `Match`. A played
value is an ISO date-time, so format it in local time.

### `src/domain/scoring/squadSize.ts` (bug #7)

- `checkSquadSizes(rules, sides)` and `checkDraftSquadSizes(draft, teamName)` return `SquadSizeIssue[]`:
  `{ severity, code, teamId, teamName, selected, sideSize, message }`. `code` is `'SQUAD_TOO_LARGE'` (error),
  `'SQUAD_BELOW_MINIMUM'` (error, fewer than `MIN_SQUAD_PLAYERS` = 2) or `'SQUAD_TOO_SMALL'` (warning). The side size is
  the team's `teamXPlayers`, otherwise `rules.playersPerSide`. Substitutes are not counted.
- `blockingSquadIssue(issues)` returns the first error, or `null`.

### `src/domain/scoring/nextInnings.ts`

`nextInningsPreview(setup, state): NextInningsPreview | null`. It returns a value only while
`pendingAction.type === 'start_next_innings'`. The value is `{ inningsIndex, kind, battingTeamId, target,
targetRevised, maxBalls, startingRuns, runsRequired, text }`. It honours targets and overs revised during the break and
penalty runs carried into the innings. Example `text`: "Tigers need 28 runs to win from 3 overs (target 28).".

### `src/domain/types/readModels.ts` and `src/db` (bug #5)

- `MatchListItem.startedAt?` and `completedAt?` are filled by every list and resume query.
- The `recent` and `oldest` sorts order by `COALESCE(started_at, completed_at, created_at)`, so a fixture created early and
  played later sorts by when it was played.

### `src/domain/types/impact.ts` and `src/domain/tournament/change` (bugs #15, #16)

- `FixtureImpact.changeText?` is a plain label ("Result changes", "Result no longer counts", "Teams change"…).
  `FixtureImpact.note?` explains the effect on a played match, replacing "(has scores)".
- `StandingChange.teamName?`, `stageName?`, `poolName?`, `where?` ("Group Stage · Pool A") and `text?` (for example
  "Eagles move from 3rd to 2nd in Group stage · Pool A; points 2 → 4, net run rate -0.500 → +0.312.").
- `QualificationChange.teamName?`, `stageName?` and `text?`.
- `SlotShortfall`: `{ slotId, label, stageId, stageName, sourceStageId, poolId, poolName, needed, available,
  fixtureLabels, message }`. `ImpactSummary.slotShortfalls?` lists the knockout slots that a change makes impossible to
  fill. Such a slot is reported only when the change creates the shortfall. Any shortfall sets
  `requiresConfirmation` and raises the severity to at least `warning`. Each message also appears in `lines`, right after any blocked reason.
- `ImpactSummary.keyLines?` holds only the sentences that the structured sections do not already say (blocked reason,
  slot shortfalls, the result line, replay and result-transfer lines, champion). Render it instead of `lines` when the
  fixture, standings, qualification and slot sections are shown, to avoid saying the same thing six times.
- The result line of a `match_result_change` names the fixture: "The result of Match 6 · Tigers v Eagles changes." or
  "… no longer counts until the match is finished again.".

### `src/domain/tournament/whatif.ts` (review: what-if NRR)

- `HypotheticalResult.margin?: HypotheticalMargin` is `{ kind: 'runs', runs }` or `{ kind: 'wickets', wickets,
  ballsRemaining }`. With no `score`, a valid margin builds an estimated innings pair from a par score. The par is the
  run rate of the counted first innings (`parRunsPerBall(snapshot)`, 1 run a ball when there is none) times the allotted
  balls. A runs win means the winner batted first, with both innings using the full overs. A wickets win means the
  winner chased `par + 1` with `ballsRemaining` to spare. The result keeps the given margin. An explicit `score` takes
  precedence over a margin.
- `WhatIfResult.nrr?: WhatIfNrrStatus` is `{ simulated, unscoredFixtureIds, estimatedFixtureIds, parRunsPerOver,
  nrrUncertainTeamIds, notes }`. `simulated` is false when a win or tie has neither a score nor a margin.
  `nrrUncertainTeamIds` are the teams whose simulated place is separated by NRR from a team in such a fixture. `notes`
  are ready sentences for the outcome view.
- Narrative: qualification lines come first. An eliminated team that still sits in a qualifying place reads "Lions
  would sit 2nd in Pool A for now, but can no longer finish in the top 2". A manual elimination reads "… but are out of
  the Knockouts by the organizer's decision".

### `src/domain/tournament/stats.ts` (bug #8, review: records)

- `TournamentRecordLine.playerIds?` (both batters of a partnership), `valueText?` ("1 wicket", "2 fours", "52/3",
  "17*") and `tiedWith?` (every other holder of the same record, in the order they reached it: earlier match number
  first, then batting order). The lead holder is unchanged.
- `recordHolderText(line, names)` gives "Rizwan & Shan (TIG)". `recordHoldersText(line, names)` gives "Babar (LIO) +3
  others". `recordValueText(line)` is also available. `RecordNames` is `{ player(id), team(id) }`.
- A team-score detail prints whole overs as "(20 ov)", not "(20.0 ov)".

### `src/domain/tournament/progress.ts` (review: dashboard progress)

`tournamentProgress(snapshot, evaluation | null): TournamentProgressSummary` returns `{ overall, current, stages, label,
countText, ratio, detail }`. With several stages, `label`, `countText` and `ratio` describe the current stage ("Group
stage", "10 of 12"), and `detail` is "10 of 15 overall · Knockouts: 3 matches". A single-stage or finished tournament
reports the whole tournament ("Tournament", "15 of 15", "15 of 15 matches played").

### `src/domain/tournament/tiebreakers.ts`

When NRR separates a team from one that has no NRR yet, the detail reads "Ahead of SBS on net run rate (-1.554; SBS
have no net run rate yet)" instead of "(-1.554 vs –)".

### `src/services/contracts.ts`

- `HistoryEditPreview.ops?` holds the ops that will be applied, including automatic resolutions. Pass them to
  `applyHistoryEdit`. `resolutions?` lists the automatic resolutions applied. `consequences?: EditConsequences`.
- `MatchService.planHistoryEdit(matchId, ops)` returns `HistoryEditPlan`: `{ status: 'ready', preview }` or
  `{ status: 'conflict', conflict, baseFingerprint }`. `previewHistoryEdit` behaves like a ready plan. On a conflict it
  fails with `VALIDATION`, `message = conflict.message` and `domainCode = conflict.code`.
- `applyHistoryEdit` re-plans the given ops. It audits as `match_reopened` when the edit reopens a completed match.
- `createMatch` and `startFixtureMatch` refuse more non-substitute players than the side size with `VALIDATION`
  (`domainCode` `SQUAD_TOO_LARGE`). `addSquadPlayer` refuses a regular (non-substitute) player for a full side the same
  way.

### `src/stores`

- `LiveMatchStore.editConflict?: EditConflict | null` is set by `previewHistoryEdit` when the edit conflicts with a later
  ball. It is kept by `clearError` and cleared by the next successful preview, by `applyHistoryEdit` and by
  `clearEditConflict?()`. `applyHistoryEdit(ops, reason, preview)` applies `preview.ops ?? ops`.
- `selectSquadIssues(draft, teamName?)`, `selectBlockingSquadIssue(draft, teamName?)` and `SquadTeamName` are exported
  from `@/stores`. `MatchSetupStore.submit` refuses a blocking squad issue before anything is saved, with
  `error.domainCode` set to the issue code.

### `src/export/pdf`

The scorecard date is the played date (`matchDisplayDate`). The scheduled date is used only when the match has not
been played.

## Wave-4 core copy: additive contract (2026-10-05)

Applies `docs/ux/CLEANUP_BRIEF.md` and the CLAUDE.md "Microcopy" rules below the UI. Every addition is an optional
field or a new export. The long sentence fields (`message`, `explanation`, `lines`, `keyLines`, `narrative`, `notes`,
`text`, `TieBreakNote.detail`) still exist with the same meaning. They are kept for accessibility labels, audit
entries and older callers, and many of them are shorter now. A screen shows the `headline`. The reason (`detail`) goes
behind a "Why?" / "Details" disclosure and is never shown inline in lists or tables.

### `src/domain/types/copy.ts` and `src/domain/text`

- `Explained` is `{ headline: string; detail?: string }`. The `headline` has no trailing period. The `detail` is one or
  more full sentences.
- `@/domain/text` (also `text` in `@/domain`) exports the following:
  - `explain(headline, detail?)` builds an `Explained`. It strips the headline's period and drops an empty detail.
  - `splitExplained(sentence)` makes the first sentence the headline and the rest the detail.
  - `explainedText(value)` joins the parts back into sentences, for screen readers.
  - Also `stripPeriod`, `asSentence` and `isScannableHeadline(text, limit?)`.
  - `HEADLINE_LIMIT` is 40 and `SUPPORTING_LIMIT` is 80.

### `ServiceError` (services and stores)

- `ServiceError.headline?` and `supporting?: string | null` are set on every error from `serviceError` / `failure`
  (services) and `storeError` / `unexpected` (stores).
  - By default they are `splitExplained(message)`, for example "Couldn't save this delivery" plus "Your previous match
    data is still safe.".
  - Edit conflicts pass their own `EditConflict.headline` / `detail`.
- `message` is unchanged: the full sentence or sentences.
- `detail` is still technical diagnostics. It is never shown on screen (see `ErrorState › details`).

### Tournament outcomes (§98, kept as a headline plus a disclosed detail)

- `TeamQualification.headline?`, `note?: string | null` and `detail?`:
  - `headline` examples: "Knockouts as Pool A winners", "Through to the Knockouts", "Can still reach the Knockouts",
    "Beat Eagles and Hawks to qualify", "Level with Tigers: organizer decides", "Can't reach the Knockouts" and "Into
    the Knockouts by organizer decision".
  - `note` is the chip-free secondary line for a table row, or `null` when the state chip already says it ("As Pool A
    winners", "Beat Eagles to qualify").
  - `detail` gives the reason and the rule, for example "No remaining result can change this. Top 2 from each pool.
    Ranking: Points → NRR → …", or "Manual override: “reason”.".
- `TieBreakNote.headline?`: "2 pts ahead of Tigers", "Ahead of Cobras on NRR", "Level with Eagles: organizer decides"
  or "Above Eagles by draw of lots". The existing `detail` holds the figures.
- `SlotResolution.headline?` and `detail?` (new in this wave):
  - `headline` is "Pool A winner: Lions", "Winner SF1: Lions", "Wildcard: Eagles", "SF1: to be decided" or "Winner
    SF2: organizer decides".
  - `detail` is "6 pts, NRR +3.255.", "Won by 10 runs.", "Manual override: “Host team”.", "Higher seed. Final not
    played yet.", "The best runner-up: 4 pts, NRR +0.167, ahead of VIP. Results against the lowest-placed teams of
    larger pools don't count." or "Lions already qualified as Pool A winner.".
  - `detail` is absent when the headline says everything.
- Impact previews:
  - `ImpactSummary.headline` is now a short noun phrase with no period: "2 fixtures affected, 1 completed",
    "Standings change for 3 teams", "Qualification changes", "No effect on results or fixtures" or "Nothing changes".
  - `ImpactSummary.keyItems?: Explained[]` pairs one-to-one with `keyLines`. Examples: "Match 6 result changes" plus
    "Tigers v Eagles."; "Match 6 result no longer counts" plus "It counts again once Tigers v Eagles is finished.";
    "Match 6 will be replayed" plus "The abandoned match stays on record but no longer counts."; "New champion: Eagles"
    plus "Was Lions.".
  - `StandingChange.headline?` and `detail?`: "Tigers: 2nd → 3rd" plus "Group stage · Pool A. Points 4 → 2, NRR
    +1.333 → -0.129.".
  - `QualificationChange.headline?` and `detail?`: "Eagles qualify" or "Tigers no longer certain", plus "For the
    Knockouts.".
  - `SlotShortfall.headline?` and `detail?`: "B2 in Knockouts can't be filled" plus "Pool B would have 1 team; “Top 2
    from each pool” needs 2. SF1 could not be played.". `message` is the two parts joined.
- What-if:
  - `WhatIfResult.narrativeItems?: Explained[]`, for example "Eagles qualify" plus "For the Knockouts as Pool A
    runners-up.", "Tigers: 2nd → 3rd" plus "In Pool A.", or "No change to standings or qualification".
  - `WhatIfNrrStatus.noteItems?`: "NRR not simulated" plus "Match 6 has no score or margin, so NRR stays as it is.
    Places decided on NRR may change.", and "NRR estimated from margins" plus "Match 6: par score of 7.50 runs an
    over.".
- Built-in template descriptions are one line of 40 characters or fewer with no period ("2 pools of 4, top 2 to the
  semifinals").

### Scoring

- `EditConflict.headline?` and `detail?`: "Wrong batter out on ball 1.3", "Match now decided on ball 1.6" or "Ball 2.1 no
  longer fits", plus the reason.
- `EditConsequences.items?: Explained[]`: "Match reopens" plus "“Tigers won by 9 wickets” no longer stands.", "Tigers
  28/1 after 2.2 overs" plus "Need 4 runs from 4 balls", "Target for Tigers: 28 → 32", "New result: …" plus "Was
  “…”.", or "2 later balls removed".
- `EditResolution.description` is shorter: "Batters swap ends before ball 1.2. Later balls stay as recorded." and "Out
  caught on ball 1.3 instead of Rizwan.".
- `SquadSizeIssue.headline?` and `detail?`: "RSL: 3 players too many" plus "This match is 8 a side. Remove 3 or make
  them substitutes.", or "RSL: 6 of 8 players" plus "The innings ends when only one batter is left.".
- `NextInningsPreview.headline?` and `detail?: string | null`: "Target 28" or "Target 32 (revised)", plus "Tigers need
  28 runs from 3 overs.".
- `formatRequirementCompact(runs, balls)` in `@/domain/scoring/format` gives "Need 12 off 9".
- Validation, guard and service messages are at most two short sentences: the fact or consequence first, then what to
  do. Explanations of mechanisms were removed. See `.workflow/wave4/core-copy.md`.

## Contract additions register (wave-1 integration)

Every addition made to a frozen contract file or to the documented contract during wave 1, and where it is specified. All of them are additive: nothing was renamed or removed, and no existing meaning changed except where noted.

| Area | Addition | Source | Specified in |
|---|---|---|---|
| `domain/types/match.ts` | `MatchResult` `win.method` gains `'penalty_runs'` (Law 16.10) | fix: scoring engine | `MatchResult`, `scoring/result.ts` |
| `domain/scoring/history.ts` | `UndoResult.tailId?`; `redoAction(…, expectedTailId?)` → `REDO_STALE` on divergence | fix: scoring engine | `history.ts` |
| `domain/scoring` | `SCORING_PROJECTION_VERSION` 1 → 2 (result semantics changed) | fix: scoring engine | `SCORING_PROJECTION_VERSION` |
| `domain/types/settings.ts` | `PadHand`; optional `ScoringPreferences.padHand` | integrator (G-11) | `ScoringPreferences` |
| `domain/tournament/stateMachine.ts` | `canTransitionFixture` gains `rescheduled → postponed` and `postponed → completed` | integrator (G-8) | `canTransitionFixture`, STATE_MACHINES §5 |
| `db/migrations/001_initial.ts` | trigger `trg_matches_teams_update` (schema version unchanged; v1 has never shipped) | fix: db | `001_initial.ts`, DATABASE.md §1 |
| `db` (docs) | exact `MatchListQuery.search` semantics (literal, Unicode case folding) | fix: db | `MatchListQuery` |
| `domain/tournament` (docs) | `fixturesForPoolMove` side alternation, `seedEntrants` repair pass, `expandEntryRules` labels | fix: tournament structure | those entries |
| `domain/tournament` (docs) | `StandingChange` lists every differing row (joining and leaving rows too); `simulate` re-resolves slots per round | fix: tournament standings | `StandingChange`, `simulate` |
| `export/backup` | `RawBackup.checksumMalformed`; `optionalLink`; LINK id role; `BackupEnvelope` checksum and schema-version rules | fix: export | `remap.ts`, `BackupEnvelope`, section above |
| `export/backup` (code) | backup validation accepts `win.method: 'penalty_runs'` and `scoring.padHand` | integrator | `MatchResult`, `ScoringPreferences` |
| `src/ui` | `ButtonProps.ref`, `buttonSurfaceStyle`, `focusRingStyle` placement; `ErrorState` shares details instead of rendering them (behaviour change) | fix: design system | `src/ui` sections above |
| `services/contracts.ts` | `MatchService.auditLog`, `AuditPage`, `MatchDetailsPatch`, `MatchRulesPatch`, `PrePlayStatus` | integrator (G-1, G-10) | `MatchService` |
| `services/contracts.ts` | `startFixtureMatch(…, openingEvents?)`, `TournamentInfoPatch`, `FixtureMatchSetup`, `GenerateFixturesOptions`, `TournamentDeletePreview`, `TournamentDeleteConfirmation` | integrator (G-5, G-6) | `TournamentService` |
| `services/contracts.ts` | `AppServices.checkIntegrity`, `IntegrityReport` | integrator (G-9) | `AppServices` |
| `services/contracts.ts` | `ServiceDeps`, `CreateAppServices`, `FileSystemAdapter`, `PrintAdapter`, `ShareAdapter`, `ShareMimeType` | integrator (G-7) | `ServiceDeps` |
| `stores/contracts.ts` | `AppStore.checkIntegrity`; `LiveMatchStore` edit, manage and audit actions; `HomeStore.discard`; `TournamentStore` actions; `TournamentWizardStore.listTemplates` | integrator (G-1, G-2, G-5, G-9, G-10) | those stores |
| `stores/contracts.ts` | `TeamLibraryStore`, `TeamDetail`, `ExportStore`, `BackupStore`, `AppServicesRegistry` | integrator (G-3, G-4, G-7) | those entries |
| `domain/types/backup.ts` | `ImportSource` (with optional `title`); optional `ImportPreview.source`, filled by `export/backup/validation/validate.ts` | wave 2, WP-export (settings UI) | `ImportPreview`, `ImportSource` |
| `services/contracts.ts` | `DatabasePragmas`; optional `BootstrapReport.pragmas`, filled by `bootstrap()` since the wave-2 integration | wave 2, WP-export (settings UI), gap G-15 | `BootstrapReport` |
| `domain/types/tournament.ts` | `SupersededMatch`; optional `TournamentSnapshot.supersededMatches` | wave 3, gap G-17 (replay) | `TournamentSnapshot`, `SupersededMatch` |
| `domain/tournament` | `fixtureReplay.ts`: `stageAllowsReplay`, `isFixtureReplay`, `fixtureReplayGuard`, `supersedeFixtureMatch`, `supersededAfterUpdate`, `fixtureSupersededMatchIds`, `fixtureHasMatchHistory`, `countedFixtureSummary`. Behaviour: one result-counting rule for every engine; a `fixture_update` replay is previewable and detaches the match; fixtures with match history are never deleted by a plan | wave 3, gap G-17 | `fixtureReplay.ts`, `ProposedChange`, `computeImpact`, `TournamentSnapshot` |
| `db/repositories/contracts.ts` | `MatchRepository.isSuperseded`; `getSnapshot` fills `supersededMatches` | wave 3, gap G-17 | `MatchRepository`, `TournamentRepository` |
| `services` (behaviour) | `updateFixture` replays through `computeImpact` + `planChange` (reason required, impact audited, `matchId` = superseded match); superseded matches are read-only | wave 3, gap G-17 | `TournamentService.updateFixture`, `MatchRepository.isSuperseded` |
| `domain/scoring` | `battingOrder.ts`: `MatchSides`, `tossBattingTeam`, `openingBattingTeam` | wave 3, gap G-18 (toss not recorded) | `battingOrder.ts` |
| `stores/contracts.ts` | optional `MatchSetupDraft.battingFirstTeamId`; `submit` derives the opening side from the toss or that choice, never from team A, and refuses when neither is known | wave 3, gap G-18 | `MatchSetupDraft`, `MatchSetupStore` |
| `domain/scoring` | `editPlanning.ts` (`planHistoryEdit`, `EditConflict`, `EditResolution`, `EditConsequences`, `describeEditConsequences`); `EditOutcome` failure `eventId?` | wave 3, bugs #1/#2 | Wave-3 core fixes section |
| `domain/scoring` | `matchDates.ts` (`matchDisplayDate`), `squadSize.ts` (`checkSquadSizes`, `checkDraftSquadSizes`, `blockingSquadIssue`), `nextInnings.ts` (`nextInningsPreview`) | wave 3, bugs #5/#7, QA | Wave-3 core fixes section |
| `domain/types/readModels.ts`, `db` | `MatchListItem.startedAt?`, `completedAt?`; `recent`/`oldest` sort by played time | wave 3, bug #5 | `MatchListItem` |
| `domain/types/impact.ts` | `FixtureImpact.changeText?`/`note?`; `StandingChange` and `QualificationChange` names and `text?`; `SlotShortfall`; `ImpactSummary.slotShortfalls?`, `keyLines?`; `HypotheticalMargin`; `HypotheticalResult.margin?`; `WhatIfNrrStatus`; `WhatIfResult.nrr?` | wave 3, bugs #15/#16, review | Wave-3 core fixes section |
| `domain/types/standings.ts`, `domain/tournament` | `TournamentRecordLine.playerIds?`, `valueText?`, `tiedWith?`; `recordHolderText`, `recordHoldersText`, `recordValueText`; `tournamentProgress`; `parRunsPerBall` | wave 3, bug #8, review | Wave-3 core fixes section |
| `services/contracts.ts` | `HistoryEditPreview.ops?`, `resolutions?`, `consequences?`; `HistoryEditPlan`; `MatchService.planHistoryEdit`; `SQUAD_TOO_LARGE` refusals | wave 3, bugs #1/#2/#7 | Wave-3 core fixes section |
| `stores` | `LiveMatchStore.editConflict?`, `clearEditConflict?()`; `selectSquadIssues`, `selectBlockingSquadIssue`, `SquadTeamName` | wave 3, bugs #2/#7 | Wave-3 core fixes section |
| `db/repositories/contracts.ts`, `services/contracts.ts`, `stores/contracts.ts` | `PlayerRepository.countActiveByTeam()`; optional `TeamService.playerCounts?()`; optional `TeamLibraryStore.playerCounts?` (active players per team, loaded with the team list) | wave 3 verify, review (team rows show "8 players") | `TeamService`, `TeamLibraryStore` |
| `domain/types/readModels.ts`, `domain/scoring`, `db` | `ListChase`; optional `MatchListItem.chase` (runs and balls a live or paused chase still needs, from the innings projection's target and ball limit); `listChase()` in `domain/scoring/listChase.ts` | wave 3 verify, review (Continue card "Need 42 from 26") | `MatchListItem` |
| `ui` | `Screen.onScrolledChange?`, `scrollbarGutter`; `TextField.ref?`/`hideLabel?`; `Sheet.leading?`; `STICKY_GLASS_SCROLLER`/`stickyGlassScrollerStyle`; `SwitchColors.trackDisabledOn`/`thumbDisabledOn`; `wicketMarkText`; icon `calendar` | wave 3 verify (needs-other-area items) | `src/ui` |
| `domain/tournament` | optional `venueIds` on `scheduleSequential`/`SequentialScheduleOptions`: "Fill dates" shares the tournament's venues across each day (never two matches on one ground in one time slot) and keeps a venue already set; audit summary for regenerated fixtures reads "<stage> fixtures regenerated: n removed, m created." (`fixturesReplaceSummary`) | wave 3 verify, review (wizard step 6, audit log) | `scheduleSequential`, `ChangeAudit` |
| `domain/types/copy.ts`, `domain/text` | `Explained`; `explain`, `splitExplained`, `explainedText`, `stripPeriod`, `asSentence`, `isScannableHeadline`, `HEADLINE_LIMIT`, `SUPPORTING_LIMIT`; `text` namespace in `@/domain` | wave 4, core copy (CLEANUP_BRIEF) | Wave-4 core copy section |
| `services/contracts.ts`, `stores` | optional `ServiceError.headline` and `supporting`, filled for every service and store error | wave 4, core copy | Wave-4 core copy section |
| `domain/types/standings.ts` | optional `TieBreakNote.headline`; `TeamQualification.headline`, `note`, `detail`; `SlotResolution.headline`, `detail` | wave 4, core copy (§98) | Wave-4 core copy section |
| `domain/types/impact.ts` | optional `StandingChange.headline`/`detail`, `QualificationChange.headline`/`detail`, `SlotShortfall.headline`/`detail`, `ImpactSummary.keyItems`, `WhatIfNrrStatus.noteItems`, `WhatIfResult.narrativeItems`; `ImpactSummary.headline` is now a short phrase without a period (wording change) | wave 4, core copy (§98) | Wave-4 core copy section |
| `domain/scoring` | optional `EditConflict.headline`/`detail`, `EditConsequences.items`, `SquadSizeIssue.headline`/`detail`, `NextInningsPreview.headline`/`detail`; `formatRequirementCompact`; shorter `EditResolution.description` (wording change) | wave 4, core copy | Wave-4 core copy section |
