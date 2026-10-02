# Scorebook — Functional & Non-Functional Requirements

§102 product items 4 and 5, §4 phase 2. Each requirement traces to [SPEC.md](../SPEC.md) (§N) and to the contract symbol that implements it (see [CONTRACT_REFERENCE.md](../architecture/CONTRACT_REFERENCE.md)). Business rules are in [BUSINESS_RULES.md](BUSINESS_RULES.md), edge cases in [EDGE_CASES.md](EDGE_CASES.md), and stories in [USER_STORIES.md](USER_STORIES.md).

**Priority:** **M** = MVP release gate · **V** = V1 scope, not a gate · **L** = later.
**Keywords:** "must" is mandatory. "Should" is expected unless there is a documented reason.

---

## Part 1 — Functional requirements

### FR-R Recovery & home (§5, §23, §79)

| ID | Requirement | Trace | Contract | P |
|---|---|---|---|---|
| FR-R-01 | On launch, the app must list every `live` or `paused` match not dismissed by SAVE & EXIT and show MATCH IN PROGRESS (teams, score, overs) with RESUME, SAVE & EXIT and DISCARD. RESUME must rebuild the exact state from the event log. | §23 | `AppServices.bootstrap`, `MatchService.findResumable({forPrompt})`, `replayMatch` | M |
| FR-R-02 | SAVE & EXIT must keep the match live, keep it under Continue Match, and hide it from the startup prompt until the next event is appended. | §23 | `dismissResume`, `Match.resumeDismissedAt` | M |
| FR-R-03 | DISCARD must delete an unfinished standalone match after confirmation. It must not be offered for tournament matches. | §23 | `MatchService.discard` | M |
| FR-R-04 | Home must offer + NEW MATCH, TOURNAMENTS, Continue Match (team, score, overs) and Recent Matches. | §5, §79 | `useHomeStore` | M |
| FR-R-05 | Bootstrap must run migrations, rebuild projections written by an older engine version, and replay live and paused matches before showing Home. | §59, §93 | `SCORING_PROJECTION_VERSION`, `rebuildProjections` | M |

### FR-M Match setup (§6–§8, §64)

| ID | Requirement | Trace | Contract | P |
|---|---|---|---|---|
| FR-M-01 | Create a match with a title and two different teams. Venue, date and time are optional. | §6 | `NewMatchInput` | M |
| FR-M-02 | Offer presets T5, T10, T20, T30, T40, T50 and Custom. A preset only pre-fills `MatchRules`; every field stays editable, and the match stores the full rules, not a reference to the preset. | §8 | `BUILTIN_FORMAT_PRESETS`, `FormatPreset` | M |
| FR-M-03 | Overs per innings: quick picks 1, 2, 5, 6, 10, 20, 25, 30, 40, 50, or any typed integer ≥ 1. The bowler quota and powerplays are rescaled automatically. | §7 | `OVERS_QUICK_PICKS`, `rulesForOvers` | M |
| FR-M-04 | Players per side 2–15, balls per over 1–12, and an optional per-team side size (2–15) that overrides players per side for that team. | §6 | `MatchRules.playersPerSide`, `Match.teamAPlayers/teamBPlayers` | M |
| FR-M-05 | Configurable wide and no-ball penalty runs (≥ 0), `countsAsBall`, free hit, powerplays (1-based inclusive overs), `maxOversPerBowler` with `uniform` / `icc_one_fifth` modes, consecutive-overs rule, last man stands. | §6, §17, §20 | `MatchRules`, `WideRule`, `NoBallRule`, `PowerplayRule` | M |
| FR-M-06 | Squads come from the team library or new players. Guests from other teams are allowed. Players can be marked as captain, wicket-keeper or substitute fielder. | §6, §27 | `MatchSquadEntry`, `MatchPlayer.isSubstitute` | M |
| FR-M-07 | The toss (winner and decision) is optional. When recorded, the first innings must match it. | §6 | `Toss`, `TOSS_MISMATCH` | M |
| FR-M-08 | Select openers and the opening bowler. Creating the match, its squads and `innings_started` happen in one transaction. | §64 | `createMatch(input, openingEvents)` | M |
| FR-M-09 | Optional mandatory retirement (`atRuns`, `mayReturn`, `timing`), which is advisory only. | — | `MandatoryRetirementRule` | M |
| FR-M-10 | Configurable super over: enabled, overs, wickets, what happens if tied again (`repeat` / `boundary_count` / `tie_stands`), maximum rounds, repeat-player restriction. | §21 | `SuperOverRule` | M |
| FR-M-11 | Users can save, edit and delete their own format presets. Built-ins are read-only. | §8 | `match_format_presets` | V |
| FR-M-12 | Rules are validated before creation. Errors block creation; warnings are shown (e.g. `BOWLER_QUOTA_TOO_LOW`). | §103 | `validateRules`, `RulesIssueCode` | M |

### FR-S Live scoring (§9–§13, §17, §19, §20)

| ID | Requirement | Trace | Contract | P |
|---|---|---|---|---|
| FR-S-01 | Buttons `0 1 2 3 4 6 EXTRAS WICKET`. Each run button records one delivery with one tap. 4 and 6 are boundaries. An "all run" option records 4 run. | §9 | `scoreRuns`, `buildEvents` | M |
| FR-S-02 | The header shows team, score `r/w`, overs `o.b`, CRR and, during a chase, target, runs required, balls remaining and RRR ("Need 23 from 14 balls"). | §10 | `MatchState.chase`, `formatOvers`, `formatRequirement` | M |
| FR-S-03 | Both batters are shown as runs (balls), and the striker is marked by an icon plus an accessible label, not by colour or asterisk alone. | §11 | `InningsState.strikerId`, `BattingCardRow` | M |
| FR-S-04 | The bowler line shows overs-maidens-runs-wickets and economy, with dots and legal balls tracked. | §12 | `BowlingCardRow`, `formatBowlingFigures` | M |
| FR-S-05 | The current-over strip uses the token grammar (`0 1 4 W WD WD+1 NB NB+4 NB+2B B1 LB2 1+W 1s`), each with a text label and an accessibility label. | §13 | `BallToken`, `ballToken` | M |
| FR-S-06 | The extras sheet covers WD (+n run, to the boundary), NB (+ bat runs incl. 4/6, + byes, + leg-byes), B n, LB n, custom values and overthrow boundaries. | §17 | `wide`, `noBall`, `overthrowBoundary` | M |
| FR-S-07 | Overthrows (`runsRun` + boundary) and short runs (`shortRuns`) are recorded separately from the boundary allowance. | §17 | `DeliveryCommon` | M |
| FR-S-08 | Strike rotates on odd `runsRun` and at the end of each over. A manual Swap Strike is available between deliveries. | §19 | `strike_swapped` | M |
| FR-S-09 | At each over end, prompt for the bowler with eligible and ineligible lists and reasons. The picker opens automatically when `autoPromptBowler` is on. | §12 | `PendingAction.select_next_bowler`, `bowlerEligibility` | M |
| FR-S-10 | Free hit state is shown and carries over through wides and no-balls. Impossible dismissals are hidden. | §20 | `isFreeHitNext`, `allowedDismissals` | M |
| FR-S-11 | The active powerplay and per-phase totals are shown. | §20 | `PowerplayStatus` | V |
| FR-S-12 | Mid-over bowler change with reason `injury` or `suspended`. | — | `BowlerSelectionReason` | M |
| FR-S-13 | Add a player to either squad at any time (including a new player created on the spot), then use them in the same action. | — | `MatchService.addSquadPlayer` | M |
| FR-S-14 | Deliveries are processed one at a time. A second tap waits for the first commit. | §88 | `LiveMatchStore.dispatch` | M |

### FR-W Wickets & batters (§18, §19)

| ID | Requirement | Trace | Contract | P |
|---|---|---|---|---|
| FR-W-01 | Dismissals: bowled, caught, lbw, run out, stumped, hit wicket, hit the ball twice, obstructing the field, handled the ball, timed out, retired out. Retirements: retired hurt, retired not out. Only dismissals allowed for the call and free-hit state are offered. | §18 | `DELIVERY_DISMISSAL_TYPES`, `OFF_BALL_DISMISSAL_TYPES`, `RETIREMENT_KINDS` | M |
| FR-W-02 | Wicket, fielder and next batter are captured in one sheet and appended as one action. | §18 | `wicket({nextBatterId})` | M |
| FR-W-03 | Run out, obstructing and handled require the dismissed batter, `dismissalEnd` and the runs completed. | §18 | `DeliveryWicket.dismissalEnd` | M |
| FR-W-04 | Fielders are optional (0–2) and may be substitutes. A stumping defaults to the designated keeper. | §18 | `DeliveryWicket.fielderIds`, `FIELDER_UNKNOWN` | M |
| FR-W-05 | Retired-hurt and retired-not-out batters can resume under the eligibility rules. | §18 | `eligibleIncomingBatters` | M |
| FR-W-06 | Last man stands: a lone batter with no non-striker. | — | `MatchRules.lastManStands` | M |
| FR-W-07 | End the innings as batters unavailable, naming absentees (shown as "absent hurt" or "absent"). | — | `InningsEndedPayload` | M |
| FR-W-08 | A mandatory-retirement banner offers a one-tap retire and never blocks scoring. | — | `MatchState.retirementsDue` | M |
| FR-W-09 | Off-ball dismissals (backing-up run out, timed out, obstructing) don't count a ball. | §18 | `batter_dismissed` | V |

### FR-E Match events (§7, §21, §22, §63)

| ID | Requirement | Trace | Contract | P |
|---|---|---|---|---|
| FR-E-01 | Suspend play (rain, bad light, wet outfield, interval, injury, other, with a note) and resume it. While suspended, only resume, overs revision, penalty and match end are allowed. | §22, §63 | `play_suspended`, `PLAY_SUSPENDED` | M |
| FR-E-02 | Revise overs for the current or a future innings in whole overs or exact balls, optionally for both innings, optionally with a new bowler quota and powerplays. | §7 | `overs_revised`, `revise_overs {scope}` | M |
| FR-E-03 | Revised target: typed by the organizer, or suggested by average run rate. The result then carries "(revised target)". | §41 | `suggestRevisedTarget`, `method: 'revised_target'` | M |
| FR-E-04 | A terminal revision decides a stopped chase on the par score (target − 1), while paused. The result carries "(par score)". | §41 | `OversRevisedPayload.terminal`, `method: 'par_score'` | M |
| FR-E-05 | Penalty runs 1–99 to a named team and innings, following the placement rules. | — | `penalty_awarded` | M |
| FR-E-06 | When the engine detects a result, it asks for confirmation (`confirm_result`) before the match becomes terminal. | §66 | `match_ended {natural}` | M |
| FR-E-07 | A tie offers a super over (while rounds remain), accepting the tie, or deciding it another way (bowl-out, coin toss, organizer). | §21 | `resolve_tie`, `tie_decided` | M |
| FR-E-08 | End a match as abandoned, no result, walkover (only before any delivery) or awarded (with a reason, and optionally a winner and margin). | §22 | `MatchEndOutcome` | M |
| FR-E-09 | Declaration ends the innings. | — | `innings_ended {declared}` | V |
| FR-E-10 | Pre-play states: postpone, cancel and restore a match that has no events. | §39, §63 | `setPrePlayStatus` | M |

### FR-C Corrections (§15, §16)

| ID | Requirement | Trace | Contract | P |
|---|---|---|---|---|
| FR-C-01 | Unlimited undo by action group, recomputed by replay. Undoing a tournament match's `match_ended` needs a reason and is audited. | §15 | `undoLastAction`, `truncateFrom` | M |
| FR-C-02 | Redo within the session. It is invalidated by any new action, reload or restart. | §15 | `redoAction`, `REDO_STALE` | M |
| FR-C-03 | Historical edit (replace / insert before / insert after) of any event, followed by normalisation (re-anchor, renumber, re-stamp) and validation. | §16 | `applyHistoryEdits`, `normalizeLog` | M |
| FR-C-04 | Edits show a before/after preview. Completed or tournament matches also show tournament impact and need a reason. The edit applies only if the log fingerprint is unchanged. | §16, §99 | `previewHistoryEdit`, `logFingerprint`, `CONFLICT` | M |
| FR-C-05 | Reopen a completed or abandoned match by undoing `match_ended`. | §63 | STATE_MACHINES §1 | M |
| FR-C-06 | The guided edit flow removes dependent events (e.g. the incoming `batter_in`) when a wicket is removed, and asks for a bowler when an over start loses its bowler. | §16 | `NO_VACANCY`, `BOWLER_NOT_SELECTED` | V |
| FR-C-07 | Every history edit, live or completed, is audited with the removed and inserted events. | §53 | `match_history_edited`, `result_corrected` | M |
| FR-C-08 | Rules, toss and squad changes after play starts follow the match edit policy and are audited where it says `confirm`. | §38 | `MatchEditPolicy`, `match_rules_changed` | M |

### FR-SC Scorecard, history & export (§64, §81, §83)

| ID | Requirement | Trace | Contract | P |
|---|---|---|---|---|
| FR-SC-01 | Scorecard per innings: batting (runs, balls, 4s, 6s, strike rate, dismissal text, did not bat, absent), bowling (O-M-R-W, economy, dots, wides, no-balls), extras breakdown, fall of wickets, partnerships, over summary. Super overs are shown separately. | §83 | `InningsState`, `dismissalText` | M |
| FR-SC-02 | Worm, Manhattan and partnership charts. | §64 | `worm`, `manhattan` | V |
| FR-SC-03 | PDF scorecard generated offline, including standings for tournament matches. | §83 | `ExportService.scorecardPdf` | M |
| FR-SC-04 | Share PDF and JSON through the system share sheet. | §95 | `ExportService.share` | M |
| FR-SC-05 | History: search (title or team), filter (status, tournament, team), sort (recent, oldest, scheduled), paging, delete. | §81 | `MatchListQuery` | M |
| FR-SC-06 | Each card shows teams, innings score lines, result line, overs and date. | §81 | `MatchListItem`, `formatResult` | M |
| FR-SC-07 | Status labels follow §22 (Scheduled, Live, Paused, Completed, Postponed, Cancelled, Abandoned, No Result, Tied, Walkover). | §22 | `matchStatusLabel` | M |

### FR-T Tournament setup (§24–§32, §56)

| ID | Requirement | Trace | Contract | P |
|---|---|---|---|---|
| FR-T-01 | Wizard Info → Teams → Structure → Rules → Pools → Fixtures → Review. Each step is saved and moves the tournament state forward; the wizard can be resumed. | §25, §62 | `TournamentWizardStore`, `TOURNAMENT_STATUSES` | M |
| FR-T-02 | Tournament information per §26. | §26 | `Tournament` | M |
| FR-T-03 | At least 128 teams, with optional seeds (≥ 1). Teams come from the global library. | §27 | `TournamentTeam.seed` | M |
| FR-T-04 | Structures: league, groups, knockout, groups + knockout, custom. Five built-in templates. | §28, §56 | `builtinTemplates` | M |
| FR-T-05 | Stage builder: ordered stages, each with a type, entry rules, pools, legs, seeding, points, tie-breakers, NRR, knockout options, abandoned-match policy, format and rules. | §29 | `StageConfig` | M |
| FR-T-06 | Parallel stages (Cup and Plate) fed by the same source. Exactly one stage decides the champion. | §29 | `decidesChampion` | V |
| FR-T-07 | Direct entry to a later stage. | §29 | `QualificationRule.direct_entry` | V |
| FR-T-08 | Pool assignment: random with a displayed and reusable seed, seeded snake, manual. Slot members allowed. | §30, §31 | `assignRandom`, `assignSeeded`, `assignSlotsToPools` | M |
| FR-T-09 | Uneven pools with a warning. Normalisation (`raw`, `per_match_average`, `drop_extra_results`) chosen per cross-pool rule. | §32 | `UnevenPoolNormalization`, `poolWarnings` | M |
| FR-T-10 | Save a tournament structure as a template. Instantiate templates with a team-count check. | §56 | `templateFromSnapshot`, `templateFitsTeamCount` | V |
| FR-T-11 | Delete a tournament: free before any match starts; afterwards only with the typed name, the completed-matches opt-in and a backup offered. Forbidden while archived. | §55 | `previewDelete`, `delete` | M |
| FR-T-12 | Tournament lifecycle and status transitions follow STATE_MACHINES §3. Archive and unarchive are supported. | §62 | `canTransitionTournament` | M |

### FR-P Pools & team changes (§33, §34)

| ID | Requirement | Trace | Contract | P |
|---|---|---|---|---|
| FR-P-01 | Move a member between pools. The preview lists the exact unplayed fixtures removed and fixtures created. Played fixtures are untouched. | §33 | `pool_move`, `fixturesForPoolMove` | M |
| FR-P-02 | Swap two members. They exchange unplayed fixtures. | §33 | `pool_swap` | M |
| FR-P-03 | Replace a team, with a `priorResults` policy (transfer / keep for opponents / expunge). | §33 | `team_replace` | M |
| FR-P-04 | Withdraw a team (walkover or cancel remaining fixtures, optional expunge). | §24 | `team_withdraw` | M |
| FR-P-05 | Every change allowed by the edit policy with `warn` or `confirm` shows WHAT WILL CHANGE (fixtures, standings, qualification, slots, NRR, completed matches affected). It applies exactly the previewed plan, or fails with `CONFLICT`. | §34, §99 | `computeImpact`, `planChange`, `ChangePreview` | M |
| FR-P-06 | Edit team seeds. | §27 | `team_seeds_change` | V |

### FR-F Fixtures (§35–§39, §66)

| ID | Requirement | Trace | Contract | P |
|---|---|---|---|---|
| FR-F-01 | Round robin with 1, 2 or n legs, per-pool leg overrides, generate → preview → edit → confirm. Regeneration replaces only fixtures without a match. | §35, §36 | `roundRobin`, `validateFixtureDrafts`, `fixtures_replace` | M |
| FR-F-02 | Manual "+ Add Match". | §37 | `fixture_add` | M |
| FR-F-03 | Edit fixtures under the fixture edit policy (STATE_MACHINES §5). | §38 | `fixture_update`, `FixturePatch` | M |
| FR-F-04 | Postpone, reschedule, cancel and restore fixtures. `live`, `completed` and `abandoned` mirror the match. | §39 | `canTransitionFixture` | M |
| FR-F-05 | Start a fixture's match through the same setup and scoring flow. Sides freeze when the match starts. | §66 | `startFixtureMatch`, `Fixture.matchSides` | M |
| FR-F-06 | Knockout brackets for 2–128+ entrants with byes to top seeds, standard seed order, round names, an optional third-place play-off, and progression slots by bracket position. | §46 | `knockoutBracket`, `standardBracketOrder` | M |
| FR-F-07 | Replay an abandoned fixture when the stage allows it. The old match is kept for history. | §39 | `replayAllowed` | V |
| FR-F-08 | Sequential scheduler (matches per day, times, rest dates, no team twice on one day). | — | `scheduleSequential` | V |
| FR-F-09 | Fixture list by stage, round or date, with running match numbers and labels (SF1, Final). | §49 | `Fixture.matchNumber/label` | M |

### FR-ST Standings, points, NRR & tie-breakers (§40–§43, §50)

| ID | Requirement | Trace | Contract | P |
|---|---|---|---|---|
| FR-ST-01 | Configurable points per result, plus abandoned and walkover points and super-over-decided tie mode. Stage-level overrides allowed. | §40 | `PointsSystem` | M |
| FR-ST-02 | Optional run-rate-ratio bonus point. | §40 | `BonusPointRule` | V |
| FR-ST-03 | NRR config: `icc` / `actual_overs`, include NR, include abandoned, walkover (exclude / notional), awarded, revised target (`icc_par` / `actual`). One NRR engine. | §41 | `NrrConfig`, `tournament/nrr.ts` | M |
| FR-ST-04 | Ordered tie-breaker chain from 12 kinds, with stage override and a complete-mini-league option. | §43 | `TIE_BREAKER_KINDS`, `rankTeams` | M |
| FR-ST-05 | Standings update automatically after every match completion or correction. Columns Pos, Team, P, W, L, NR, Pts, NRR plus T, runs and overs for and against, RR, remaining, form. Pool tabs plus an overall table. | §42, §50 | `StandingsTable`, `StandingRow` | M |
| FR-ST-06 | A tie-break explanation for every adjacent pair level on points. | §98 | `TieBreakNote` | M |
| FR-ST-07 | Points adjustments by override, with a reason; revocable. | §47 | `points_adjustment` | M |
| FR-ST-08 | Level groups that need a decision are flagged; resolved by organizer decision or a seeded draw of lots. | §43 | `unresolvedTies`, `tie_resolution` | M |

### FR-Q Qualification, knockouts & overrides (§44–§47, §51)

| ID | Requirement | Trace | Contract | P |
|---|---|---|---|---|
| FR-Q-01 | Entry-rule builder with 7 rule kinds. | §44 | `QualificationRule` | M |
| FR-Q-02 | Rules expand into editable, labelled slots. Re-expansion keeps slot ids by index. | §45 | `expandEntryRules`, `StageSlot` | M |
| FR-Q-03 | Qualification per downstream stage with state, certainty (mathematical / provisional / manual) and a §98 explanation. | §51, §98 | `TeamQualification`, `computeQualification` | M |
| FR-Q-04 | Knockout seeding fixed, random or ranking. Ranking is blocked until the entry slots are final. | §46 | `seedEntrants`, `knockoutGenerationGuard` | M |
| FR-Q-05 | Knockout tie and no-result policies. | §46 | `KnockoutConfig`, `knockoutAdvancer` | M |
| FR-Q-06 | Overrides: qualify, eliminate, reassign, points adjustment, tie resolution, slot assignment, expunge, champion. Each has a mandatory reason, is revocable (never deleted), is labelled "Manual Override" and is audited. | §47, §54 | `TournamentOverride` | M |
| FR-Q-07 | Frozen sides and slot-conflict reporting. | — | `SlotChange.playedFixtureIds` | M |
| FR-Q-08 | Champion comes from the `decidesChampion` stage (final winner, league-table top, shared, or manual). It is projected to the tournaments list. | §82 | `resolveChampion`, `champion_json` | M |

### FR-D Dashboard, statistics, what-if, audit (§48, §49, §52, §53)

| ID | Requirement | Trace | Contract | P |
|---|---|---|---|---|
| FR-D-01 | Dashboard per §49 and §80: name, structure, current stage, progress done/total, next match, standings, recent results. | §49 | `TournamentEvaluation` | M |
| FR-D-02 | Team, player and tournament statistics per §52, computed locally. No sample data. | §52 | `computeTournamentStats` | M |
| FR-D-03 | What-if simulation that never persists or audits. | §48 | `simulate` | V |
| FR-D-04 | Append-only audit log, paged, with action, summary, previous and new value, reason, impact and time. | §53 | `AuditEvent` | M |
| FR-D-05 | Bracket view with byes and slot labels. | §46 | `BracketPosition` | M |
| FR-D-06 | Tournaments list (name, season, team count, status, fixtures done/total, champion). | §82 | `TournamentListItem` | M |
| FR-D-07 | Tournament PDF. | §82 | `ExportService.tournamentPdf` | V |

### FR-B Backup & data (§84, §85)

| ID | Requirement | Trace | Contract | P |
|---|---|---|---|---|
| FR-B-01 | Export JSON backups for three scopes: full, tournament, match. The envelope carries format and schema versions, `exportId`, counts, a SHA-256 checksum, and authoritative data only. | §84 | `BackupEnvelope` | M |
| FR-B-02 | Import preview: validation (JSON, format, versions, checksum, duplicate ids, references, event logs), counts, prior import date, per-aggregate conflicts with local-only counts. | §84 | `ImportPreview` | M |
| FR-B-03 | Import policies: skip existing, import as copy (full id remap), replace existing. One transaction. Projections are rebuilt by replay. Audited as `backup_imported`. | §84 | `ImportConflictPolicy`, `remapBackupIds` | M |
| FR-B-04 | After a tournament is completed, prompt for a backup. | — | — | V |
| FR-B-05 | Settings are imported only when the user opts in. Logos are not embedded. | §84 | `BackupData.settings` | M |
| FR-B-06 | Diagnostics: schema version, on-demand `foreign_key_check`, matches that need repair, stale projections, recent technical errors. | §86 | `BootstrapReport` | V |

### FR-A Settings & feedback (§5, §70, §75–§78, §86, §87)

| ID | Requirement | Trace | Contract | P |
|---|---|---|---|---|
| FR-A-01 | Theme Light, Dark or System, applied consistently to every surface, including charts and sheets. | §70 | `ThemePreference` | M |
| FR-A-02 | Haptics, sound and reduced motion (system / on / off) are all switchable. | §75–§78 | `AppSettings` | M |
| FR-A-03 | Scoring preferences: `confirmInningsEnd`, `autoPromptBowler`, `dotStyle`, `keepAwake`. | — | `ScoringPreferences` | M |
| FR-A-04 | Default format for new matches. | §8 | `AppSettings.defaultFormatId` | M |
| FR-A-05 | Purposeful empty states for Home, history, tournaments, standings, fixtures and statistics. | §87 | — | M |
| FR-A-06 | Errors shown in human language with a recovery action. Technical detail only in diagnostics. | §86 | `ServiceError.message/detail` | M |

---

## Part 2 — Non-functional requirements

**Reference devices.** *Reference Android:* a mid-range phone of about 2022 (for example Samsung Galaxy A23 or Redmi Note 11 class, 4 GB RAM, 8-core ARM) running Android 12 or later. *Low-end Android:* 3 GB RAM, 720p. *iOS:* iPhone 11 class. Budgets are p95 over 100 repetitions in release builds.

### NFR-P Performance (§88)

| ID | Requirement | Budget |
|---|---|---|
| NFR-P-01 | Tap on a run button → updated score, strip and cards on screen (validate, apply, commit, render) | ≤ 50 ms on reference Android (≤ 100 ms on low-end) |
| NFR-P-02 | Domain `validateEvent` + `applyEvent` per delivery | ≤ 2 ms |
| NFR-P-03 | Append one ball plus its projection write | < 10 ms on sql.js in node (CI gate); ≤ 20 ms on reference Android |
| NFR-P-04 | Full `replayMatch` of a 50-over match (~700 events) | < 50 ms (CI gate in node; target on reference Android, see note) |
| NFR-P-05 | Open the scoring screen of a 50-over match (load, replay, first render) | ≤ 400 ms |
| NFR-P-06 | Undo or redo of one action (truncate, replay, projection write, render) | ≤ 150 ms |
| NFR-P-07 | History edit preview of a 50-over match (normalise, validate, before/after) | ≤ 300 ms; with tournament impact ≤ 500 ms |
| NFR-P-08 | `evaluateTournament`, 128 teams / 16 pools / ~500 fixtures, without enumeration | < 100 ms (CI gate) |
| NFR-P-09 | Qualification certainty with enumeration (≤ 8 undecided fixtures per pool) | ≤ 300 ms per stage |
| NFR-P-10 | Impact preview (`computeImpact` = 2 evaluations plus diff) for a 128-team tournament | ≤ 400 ms |
| NFR-P-11 | Cold start to Home with the resume prompt (≤ 3 live matches, 1,000 stored matches) | ≤ 2.5 s reference Android; ≤ 4 s low-end |
| NFR-P-12 | Scrolling history (≥ 1,000 matches) and fixture lists (≥ 8,128 fixtures) | 60 fps sustained, no blank cells > 1 frame; paged or virtualised |
| NFR-P-13 | Scorecard PDF generation | ≤ 3 s; tournament PDF (128 teams) ≤ 10 s |
| NFR-P-14 | Full backup export of 1,000 matches | ≤ 15 s, with a progress indicator after 1 s |
| NFR-P-15 | Re-renders: a ball updates only the header, strip, batter, bowler and pad components (selector-based stores, no global store) | Verified by render-count tests |

> Note: CONTRACTS.md states the replay budget as "< 50 ms in node", while CONTRACT_REFERENCE (`replayMatch`) says "< 50 ms on a mid phone". The CI gate uses node. The device figure is a target measured in M4 hardening.

### NFR-S Scale & size limits

| ID | Dimension | Must support | Notes |
|---|---|---|---|
| NFR-S-01 | Teams per tournament | ≥ 128 (tested at 128), no hard-coded maximum | §27 |
| NFR-S-02 | Pools per stage | ≥ 32 | Pool names continue after Z: "Pool AA"… |
| NFR-S-03 | Teams per pool / league | 2–128 | 128-team single round robin = 8,128 fixtures |
| NFR-S-04 | Fixtures per tournament | ≥ 8,128 generated, listed and evaluated. Evaluation of that extreme ≤ 1 s. | Product target beyond the contract's 500-fixture gate |
| NFR-S-05 | Knockout entrants | 2–128 (brackets up to 128 with byes) | Round names up to "Round of 32", then "Round k" |
| NFR-S-06 | Stages per tournament | ≥ 8 | |
| NFR-S-07 | Overs per innings | any integer ≥ 1; tested at 1, 17, 50, 100 | §7 |
| NFR-S-08 | Deliveries per innings | ≥ 300 legal balls (50 overs) plus extras; tested with 600 legal balls (100 overs) plus 150 extras | |
| NFR-S-09 | Events per match | ≥ 2,000 (100-over innings plus super overs) | Replay stays linear |
| NFR-S-10 | Balls per over | 1–12 | DB CHECK |
| NFR-S-11 | Players per side | 2–15. Squad can include substitutes and players added mid-match (≥ 25 per team per match) | |
| NFR-S-12 | Super-over rounds | unlimited when `maxRounds` is null (tested to 5) | |
| NFR-S-13 | Stored matches on device | ≥ 5,000 with paged lists | |
| NFR-S-14 | Stored tournaments | ≥ 200 | |
| NFR-S-15 | Storage footprint | ≤ 0.5 MB per 50-over match including indexes and projections | Measured in hardening |
| NFR-S-16 | Backup file | A 1,000-match backup must import on the reference device without running out of memory | |
| NFR-S-17 | Text fields | Team name ≥ 60 chars and short name ≤ 5 chars (DB CHECK); player name ≥ 60 chars; reasons ≥ 500 chars. Unicode (Urdu, Hindi, Tamil…) renders in the UI and the PDF | |

### NFR-O Offline & privacy (§3, §85)

| ID | Requirement |
|---|---|
| NFR-O-01 | Every V1 feature works in airplane mode from first launch. Fonts (Inter, Barlow Condensed), icons and sounds are bundled. |
| NFR-O-02 | App code makes no network requests. No analytics, crash reporting to third parties, ads, account or login. |
| NFR-O-03 | Data leaves the device only through a user-initiated export or share. |
| NFR-O-04 | No permissions beyond what file sharing and document picking need. No location, contacts or camera in V1. |

### NFR-R Reliability & recovery (§23, §89, §93)

| ID | Requirement |
|---|---|
| NFR-R-01 | **Atomicity:** each use case (ball, undo, redo, edit, end match, tournament change, import, migration) is one SQLite transaction. Killing the process at any point leaves the state before or after it, never in between. |
| NFR-R-02 | **Durability:** a ball that has been reported as saved survives power loss (`journal_mode = WAL`, `synchronous = FULL`). |
| NFR-R-03 | **Determinism:** the same setup and log produce the same state on every device and version with the same `SCORING_PROJECTION_VERSION`. |
| NFR-R-04 | **Totality:** replay never throws. A corrupt event is skipped and reported (`needsRepair`), the rest of the log is still applied, and degrading writes are refused. |
| NFR-R-05 | **Self-healing projections:** projections from an older engine are rebuilt at startup. A projection can be rebuilt at any time from the log. |
| NFR-R-06 | **Stale writers:** a write based on an outdated log tail, fingerprint or tournament version fails with `CONFLICT` and never overwrites newer data. |
| NFR-R-07 | **Migrations:** forward-only and transactional. A failed migration rolls back and shows a recoverable error. A database newer than the app is never modified. |
| NFR-R-08 | **Error handling:** services never throw for expected failures (`ServiceResult`). The UI keeps the last good state and shows a retry. |
| NFR-R-09 | **Failure test suite:** §93 (app crash, battery loss, restart, invalid import, corrupt data, duplicate import, database failure, interrupted PDF, tournament edit after fixtures, correction after a standings update) is automated where possible and run before release. |

### NFR-I Data integrity (§57–§59, §89, §99)

| ID | Requirement |
|---|---|
| NFR-I-01 | The event log is the only scoring truth. Stored innings, partnerships, results and summaries are projections rewritten in the same transaction as the log change. |
| NFR-I-02 | Foreign keys are always on. Tables are STRICT. Payload player ids are FK-checked. Cross-aggregate membership is enforced. `PRAGMA foreign_key_check` is empty after migrations and imports. |
| NFR-I-03 | Nothing historical is destroyed silently. Teams, players and venues in use are archived, not deleted. Tournament delete needs explicit opt-in for completed matches. Overrides are revoked, never deleted. The audit log is append-only. |
| NFR-I-04 | Preview == apply: tournament changes persist exactly the previewed `ChangePlan`, guarded by `tournaments.revision`. |
| NFR-I-05 | A standings-relevant change to a tournament match (result, margin, balls per over, revised target, tie decider) is detected (`summariesAffectStandingsEqually`) and audited as `result_corrected`. |
| NFR-I-06 | Import never merges a conflicting aggregate row by row, never uses `INSERT OR REPLACE`, and validates every reference, including ids inside event payloads. |

### NFR-A Accessibility (§72, §78)

| ID | Requirement |
|---|---|
| NFR-A-01 | Contrast of text and essential graphics ≥ 4.5:1 (≥ 3:1 for score figures ≥ 24 pt) in both themes, checked by automated tests (WCAG 2.2 AA). |
| NFR-A-02 | Touch targets ≥ 44 × 44 pt everywhere. Scoring-pad buttons ≥ 56 dp high with ≥ 8 dp spacing. Primary scoring actions sit in the lower 60% of the screen in portrait. |
| NFR-A-03 | Every control has an accessibility role and label. Ball tokens use `BallToken.accessibilityLabel`. The score and overs are announced after each ball when a screen reader is on. |
| NFR-A-04 | Dynamic type up to 200%: the score, overs, striker and pad remain visible without horizontal scrolling. Tables reflow or scroll horizontally with a sticky team column. |
| NFR-A-05 | Information is never conveyed by colour alone: wickets show "W" and an icon, qualification shows text, the striker has an icon plus a label. |
| NFR-A-06 | Reduced motion (system or app setting) disables non-essential animation (§75). |
| NFR-A-07 | No critical information or action is available only through a gesture (§72). |

### NFR-U Usability & outdoor use (§2, §9, §72–§74)

| ID | Requirement |
|---|---|
| NFR-U-01 | A normal ball takes 1 tap. A bowled or caught wicket with the next batter takes ≤ 3 taps after WICKET. A standard extra (WD, NB, B1, LB1) takes ≤ 2 taps. |
| NFR-U-02 | Live scoring hierarchy §73: score > current over > batters > bowler > ball sequence > controls > secondary actions. |
| NFR-U-03 | Undo is visible on the scoring screen at all times without scrolling. |
| NFR-U-04 | The screen stays awake on the scoring screen when `keepAwake` is on, and nowhere else. |
| NFR-U-05 | Tablets (≥ 768 dp) use two panes (scorecard and live scoring; standings and fixtures). Landscape is optional. |
| NFR-U-06 | Validation messages are organizer-friendly English: they explain why and what to do, never show a code (§86). Codes are available to diagnostics and tests. |
| NFR-U-07 | Setting up a standalone match with default rules and two new teams takes ≤ 60 s for a first-time user (pilot measure). |

### NFR-C Compatibility

| ID | Requirement |
|---|---|
| NFR-C-01 | Android and iOS at the minimum OS versions supported by Expo SDK 57. Phones 320–430 dp wide and tablets. |
| NFR-C-02 | Backups made on Android import on iOS and the other way round (canonical JSON, ISO-8601 timestamps, `YYYY-MM-DD` dates). |
| NFR-C-03 | Formatting is locale-independent: ASCII digits, `.` decimal separator, `–` for undefined values. |
| NFR-C-04 | Dates are stored as local calendar dates (`YYYY-MM-DD`) and times as `HH:MM`. Ordering of events never depends on the device clock (it uses `seq`). |

### NFR-M Maintainability & quality

| ID | Requirement |
|---|---|
| NFR-M-01 | Strict layering (ARCHITECTURE §2). The domain is pure TypeScript: no I/O, clock or randomness. |
| NFR-M-02 | `npx tsc --noEmit` is clean. Unit tests cover every §90 item. Integration tests cover §91 on sql.js. E2E covers §92. |
| NFR-M-03 | No code comments in source (CLAUDE.md). Semantics live in CONTRACT_REFERENCE.md. |
| NFR-M-04 | No hex colour literals outside `src/ui/theme`. Semantic tokens only (§71). |
| NFR-M-05 | Schema changes are added as new migrations. A shipped migration is never edited. |
| NFR-M-06 | Rules are data: presets, defaults and templates only pre-fill stored values. Changing a default never changes an existing match or tournament. |
