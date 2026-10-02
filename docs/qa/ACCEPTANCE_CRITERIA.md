# Scorebook — Acceptance Criteria (§104 Definition of Done)

§104 says the product is done when:

| # | §104 clause |
|---|---|
| **D1** | a match can be scored reliably offline |
| **D2** | a complete tournament can be created, configured, played and completed |
| **D3** | scores, stats, standings, NRR and qualification are correct per the configured rules |
| **D4** | the organizer can customise pools, fixtures and stages |
| **D5** | crashes and restarts do not destroy data |
| **D6** | mistakes are safely correctable |
| **D7** | scoring is fast and usable outdoors |
| **D8** | light and dark are both professional |
| **D9** | the app is accessible |
| **D10** | the app can export and share without a cloud |

This document turns that into **checkable** criteria, grouped by the epics of the §94 sprint plan. Each criterion states how it is verified:
- **U-**, **IT-**, **E2E-** or **FR-**: a case in the unit, integration, E2E or failure plans of this folder;
- **CHK**: an automated static check;
- **MAN**: a manual check with a written result.

An epic is accepted when every criterion in it passes. The product is done when every epic is accepted **and** the global gates G-01…G-10 pass on the release commit.

Status legend for the sign-off column: ☐ open · ☑ passed (attach the CI run or the manual-check record).

## 0. Global gates (every epic, every merge to main)

| ID | Criterion | Verification |
|---|---|---|
| G-01 | `npx tsc --noEmit` exits 0 | CI |
| G-02 | `npx jest` passes: all domain, db, services, stores, UI (RNTL) and export suites | CI |
| G-03 | `npx expo export --platform android --output-dir .expo-export-check` succeeds; the directory is deleted afterwards | CI |
| G-04 | **No code comments** in `src/**/*.{ts,tsx}` and in SQL strings, except the `/** @jest-environment node */` pragma | CHK: `src/__tests__/codeRules.test.ts` scans every source file, tests included, with the TypeScript scanner (`ts.forEachLeadingCommentRange`/`forEachTrailingCommentRange`, so `//` inside strings and URLs is ignored), and scans the SQL in `src/db` for `--` and `/*` |
| G-05 | Domain purity: `src/domain` (tests included) imports nothing outside `src/domain` (so no `react`, `expo*`, SQLite, `@/db`, `@/services`, `@/stores`); no `Date.now(` or `Math.random(` there; no `new Date(` in production domain code (test builders may format fixed timestamps) | CHK: `src/__tests__/codeRules.test.ts` (import graph from the TypeScript AST) |
| G-06 | Layering (§60, §103): `src/features` and `src/app` never import `@/db` or service implementations; `src/ui` imports no `@/domain`, `@/stores` or `@/services` | CHK: `src/__tests__/codeRules.test.ts` checks every layer's allowed imports (CLAUDE.md layering), plus `src/ui/__tests__/codeRules.test.ts` |
| G-07 | Colours only from semantic tokens: no hex/rgb literals in production code outside `src/ui/theme`. The one exception is the PDF print palette in `src/export/pdf/styles.ts`, which holds named constants only (THEMES.md, print; docs/README.md C-12) | CHK: `src/__tests__/codeRules.test.ts` and `src/ui/__tests__/codeRules.test.ts` |
| G-08 | No network use: no `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, or remote `http(s)://` URLs in `src` (the only exceptions are strings rendered as text); no analytics or ads SDK in `package.json` | CHK: `src/__tests__/codeRules.test.ts` (production code), plus FR-17 (airplane mode) |
| G-09 | No dependency added beyond the list in CLAUDE.md | CHK: diff `package.json` dependencies against the baseline |
| G-10 | No fake or sample statistics in production code (§103): no seeded demo data outside `__tests__`/`testing` folders | CHK: a grep for demo fixtures imported from non-test code |

## E1 — Foundation (§94 sprint 1): Expo, TS, navigation, theme, tokens, SQLite, migrations

| ID | Criterion | Verification | §104 |
|---|---|---|---|
| AC-E1-01 | A fresh install creates schema v1 through the migration runner; a re-run is a no-op; a newer recorded schema is refused without writes | IT-DB-01, FR-05i | D5 |
| AC-E1-02 | The DB opens with `foreign_keys=1`, `journal_mode=wal`, `synchronous=2 (FULL)`; Diagnostics shows these | FR-02b, FR-02d | D5 |
| AC-E1-03 | Every use case runs in one transaction on the transaction handle; a root write during a transaction waits and is not rolled back with it | IT-DB-02, FR-07f | D5 |
| AC-E1-04 | All tables are STRICT; the DATABASE.md negative cases are rejected by the schema | IT-DB-05, FR-05g | D3, D5 |
| AC-E1-05 | Tabs Home · Tournaments · History · Settings exist; every route in ARCHITECTURE §9 renders its `screen-*` root | E2E smoke (open each route), RNTL | D1, D2 |
| AC-E1-06 | Every §71 token (`background`, `surface`, `surfaceElevated`, `textPrimary`, `textSecondary`, `textMuted`, `border`, `accent`, `success`, `warning`, `danger`, `score`) is defined for light and dark, each designed separately (the two palettes are not colour inversions of each other) | WP-design-system unit test, MAN review | D8 |
| AC-E1-07 | The spacing scale is exactly 4, 8, 12, 16, 20, 24, 32, 40, 48 (§67) | unit test on the theme | D8 |
| AC-E1-08 | Bootstrap failure (migration error, corrupt file) shows `error-screen` with a human message and Retry; the technical detail is only in Diagnostics | FR-05h, FR-07g | D5, D9 |

## E2 — Match setup (§6–§8, §64)

| ID | Criterion | Verification | §104 |
|---|---|---|---|
| AC-E2-01 | Overs quick picks 1, 2, 5, 6, 10, 20, 25, 30, 40, 50 plus any custom number (e.g. 17) produce valid rules; nothing assumes T10/T20/ODI | U-PRE-02…04, 08, U-INN-07 | D1 |
| AC-E2-02 | Presets T5–T50 pre-fill every rule and every value stays editable; editing a preset never changes past matches | U-PRE-01, 07; RNTL | D1 |
| AC-E2-03 | Setup captures title, teams, venue, date, time, format, overs, players (with substitutes), toss winner and decision, bowler quota, wide, no-ball, powerplay and super-over rules (§6) | RNTL on the wizard; E2E-01 | D1 |
| AC-E2-04 | Uneven sides (`teamAPlayers/teamBPlayers`) can be set and drive all-out and margins | U-INN-04, 05, U-RES-05 | D1, D3 |
| AC-E2-05 | Creating a match writes the match, squads and the opening `innings_started` in one transaction: a crash never leaves a created-but-unstarted match | IT-M-03, FR-01g | D5 |
| AC-E2-06 | `validateRules` errors block creation; warnings are shown (e.g. `BOWLER_QUOTA_TOO_LOW`) | U-PRE-05, 06; RNTL | D1 |

## E3 — Scoring engine (§9–§23 rules, §90)

| ID | Criterion | Verification | §104 |
|---|---|---|---|
| AC-E3-01 | Runs 0, 1, 2, 3, 4, 6, all-run fours, overthrows and short runs give the correct team, batter and bowler figures and strike | U-CMD-01…13, U-STR-* | D1, D3 |
| AC-E3-02 | Every extra in §17 (wide 1–5/custom, NB+0/1/2/3/4/6/custom, NB + byes/leg-byes, byes 1–4/custom, leg-byes 1–4/custom) is correct in runs, legality, balls faced, bowler charge and token | U-EXT-01…36 | D1, D3 |
| AC-E3-03 | Every §18 dismissal (incl. off-ball, retirements, substitutes as fielders) and every legal extra × wicket combination is handled; illegal ones are rejected with the documented code | U-WKT-*, U-RO-*, U-L166-* | D1, D3 |
| AC-E3-04 | Strike: odd crossings, over-end swap, wicket replacement ends, manual swap, last-man-stands | U-STR-01…15, U-RO-01…10 | D1 |
| AC-E3-05 | Over end, maidens, the consecutive-overs rule, uniform and ICC quotas, mid-over replacements | U-OVR-01…22 | D3 |
| AC-E3-06 | Innings completion for every reason; a completed innings never reopens for deliveries | U-INN-01…19 | D1 |
| AC-E3-07 | Results: runs/wickets margins, ties, super overs (repeat, boundary count, limits), revised target, par score, no result, abandoned, walkover, awarded; natural completion always needs `confirm_result` | U-RES-01…31 | D1, D3 |
| AC-E3-08 | Penalties never cross phases; revisions and penalties re-run completion and the result | U-PEN-*, U-REV-* | D3 |
| AC-E3-09 | Free hit (§20) set, carried and cleared correctly, with dismissal restrictions | U-EXT-25, U-WKT-41…43 | D3 |
| AC-E3-10 | Every validation code has a test and a human message | U-VAL-01…65 | D6, D9 |
| AC-E3-11 | Replay is deterministic, total (never throws), incrementally equivalent and repairs-aware (one bad event skips only itself) | U-RPL-01…09 | D5 |
| AC-E3-12 | Undo is unlimited and reverses by replay; wicket + new batter is one step; redo restores identical events; stale redo is refused | U-HIS-01…06, IT-M-07/08, E2E-03 | D6 |
| AC-E3-13 | The formatting helpers produce the §10–§13 notation exactly (`142/4`, `16.4`, `8.52`, `+1.234`, `3.4-0-28-2`, tokens) | U-FMT-01…09 | D1 |
| AC-E3-14 | Replaying a 50-over match (about 700 events) takes < 50 ms in node | U-RPL-12 | D7 |

## E4 — Live scoring UI (§9–§13, §19, §72, §73)

| ID | Criterion | Verification | §104 |
|---|---|---|---|
| AC-E4-01 | Each pad button `0 1 2 3 4 6` records one ball with **one tap** and no confirmation; EXTRAS and WICKET open sheets | RNTL (WP-match-ui), E2E-01 | D7 |
| AC-E4-02 | A bowled or caught wicket with the next batter takes ≤ 3 taps after WICKET | RNTL tap count; E2E-03 | D7 |
| AC-E4-03 | The header shows team, score, overs (`16.4`), CRR, and (when chasing) target, runs required, balls remaining and RRR, all from domain state | U-CRR-01…06, RNTL, E2E-01 | D1, D3 |
| AC-E4-04 | The striker is marked by an icon with an accessibility label, not only an asterisk or colour (§11); Swap Strike is always available | RNTL, E2E-03 | D9 |
| AC-E4-05 | The bowler line shows `overs-maidens-runs-wickets` and economy (§12) | RNTL | D1 |
| AC-E4-06 | The current-over strip renders the domain tokens (`1 4 0 W WD 2`); a wicket is conveyed by text, not colour alone (§13, §78) | RNTL, E2E-04 | D9 |
| AC-E4-07 | Every `PendingAction` renders its prompt; nothing else can be scored until it is resolved; mandatory retirement shows as a non-blocking banner | RNTL per pending type | D1 |
| AC-E4-08 | The visual hierarchy follows §73: score > current over > batters > bowler > sequence > controls > secondary actions | MAN design review with screenshots (E2E-13) | D7, D8 |
| AC-E4-09 | Touch targets ≥ 44×44 everywhere and ≥ 56×56 on the scoring pad (proposed value for "larger", §72) | RNTL layout test | D7, D9 |
| AC-E4-10 | Tap → updated header in ≤ 50 ms p95 on the reference mid-range Android and ≤ 100 ms p95 on the low-end reference device, release build (NFR-P-01, the §88 "immediate" budget) | MAN with a performance trace, 50 taps | D7 |
| AC-E4-11 | A second tap during a save is queued, never lost and never duplicated | FR-11 | D5, D7 |
| AC-E4-12 | A failed save shows "Couldn't save this delivery. Your previous match data is still safe." with Try Again; nothing technical is shown | FR-07a/b/i | D5, D9 |
| AC-E4-13 | Tablets ≥ 768 dp show two panes (scorecard | live scoring) (§74) | E2E-13, RNTL | D7 |
| AC-E4-14 | Haptics and sound follow §76/§77 and can be switched off | RNTL with mocked expo-haptics; MAN | D7 |

## E5 — Scorecard & history (§16, §23, §81, §83)

| ID | Criterion | Verification | §104 |
|---|---|---|---|
| AC-E5-01 | The scorecard shows batting (incl. "absent hurt", "c sub (X) b Y"), bowling, extras, fall of wickets, partnerships and the over summary exactly as the domain computes them | U-CARD-*, IT-M-18 | D3 |
| AC-E5-02 | Resume (§23): after a crash or restart the startup prompt shows team, score and overs with RESUME / SAVE & EXIT / DISCARD, and each works | E2E-02, IT-M-05/11/12, FR-01h, FR-03a…c | D5 |
| AC-E5-03 | A historical edit (§16) validates, recalculates everything, shows WHAT WILL CHANGE, requires a reason for completed matches, and is audited with the removed/inserted events | IT-M-20…24, E2E-05, FR-10h | D6 |
| AC-E5-04 | An edit that would make the recorded log invalid is refused with a clear message and changes nothing | IT-M-24, U-HIS-10/17 | D6 |
| AC-E5-05 | History supports search, filter by status, sort, paging and delete; each card shows teams, scores, result line, overs and date (§81) | IT-DB suites, RNTL, E2E-14 | D1 |
| AC-E5-06 | Discarding an unfinished standalone match removes all its data; tournament matches cannot be discarded | IT-M-25, IT-T-33 | D5 |

## E6 — Tournament foundation (§24–§29, §54, §61, §62)

| ID | Criterion | Verification | §104 |
|---|---|---|---|
| AC-E6-01 | The wizard creates a tournament through Info → Teams → Structure → Rules → Pools → Fixtures → Review, saving progressively; an interrupted wizard resumes | E2E-06, FR-01j, RNTL | D2 |
| AC-E6-02 | Team seeds can be entered and edited (audited) | IT-T-03, U-IMP-07 | D4 |
| AC-E6-03 | All five built-in templates instantiate for their team counts with one champion-deciding stage; any tournament can be saved as a template and re-instantiated | U-TPL-01…05 | D2, D4 |
| AC-E6-04 | The tournament, stage, fixture and match state machines allow exactly the transitions in STATE_MACHINES.md; edit policies match the §55 matrix | U-SM-01…15 | D6 |
| AC-E6-05 | 128 teams can be added and managed; no screen is hard-coded to a small team count (§27) | U-EVAL-03, MAN on a 128-team seeded DB | D2 |
| AC-E6-06 | The dashboard shows name, current stage, progress (e.g. "24/48"), next match, standings and recent results, without a card per statistic (§49, §80) | E2E-06 (`dash-text-progress`), MAN design review | D2, D8 |
| AC-E6-07 | Deleting a tournament with played matches requires the typed name and the explicit "delete completed matches" opt-in, and offers a backup first | IT-T-34, FR-15 | D5, D6 |

## E7 — Pools & fixtures (§30–§39)

| ID | Criterion | Verification | §104 |
|---|---|---|---|
| AC-E7-01 | Random pool assignment is reproducible from a displayed seed (e.g. 847291); manual and seeded (snake) assignment work | U-RNG-*, U-POOL-03…09, IT-T-05/06, E2E-07 | D4 |
| AC-E7-02 | Replacing an arrangement always warns "Current pool arrangement will be replaced." and can be undone (§31) | E2E-07, RNTL | D6 |
| AC-E7-03 | Uneven pools are allowed and warn "Teams in different pools may play different numbers of matches." (§32) | U-POOL-15, E2E-07 | D4 |
| AC-E7-04 | Move / swap / replace of teams (and slot members) work before and after fixtures; after fixtures they show the impact first and never touch played fixtures | U-POOL-12…14, U-IMP-01…03, FR-09a/b/j, E2E-08 | D4, D6 |
| AC-E7-05 | Round robin (single, double, n encounters) satisfies every property for 2–17 and 128 teams | U-FIX-01…09 | D2, D3 |
| AC-E7-06 | Generation is Generate → Preview → Edit → Confirm; nothing is persisted before Confirm; re-generation replaces only fixtures without a match | IT-T-07/08, FR-09e, E2E-06 | D4, D6 |
| AC-E7-07 | Manual fixtures (§37) and fixture edits (§38) work; completed fixtures are restricted and audited; postpone → reschedule → complete, cancel and restore work (§39) | U-SM-06…08, RNTL, IT suites | D4 |
| AC-E7-08 | Fixture validation reports same-side, not-in-pool and not-in-tournament errors and duplicate/double-booked/out-of-window warnings | U-FIX-12…17 | D4 |

## E8 — Standings & rules (§40–§45, §50, §51, §98)

| ID | Criterion | Verification | §104 |
|---|---|---|---|
| AC-E8-01 | Points are configurable (2/1/1/0, 3/1/1/0, walkover, abandoned, bonus, decided ties) and applied for every result type | U-PTS-01…15 | D3 |
| AC-E8-02 | The standings columns Pos, Team, P, W, L, NR, Pts and NRR match the domain values for POOL-A and POOL-B exactly | U-STD-01…04, IT-T-14/15, E2E-06 | D3 |
| AC-E8-03 | NRR is correct for all-out sides (full quota), chases won early, revised and terminated (par) chases, no result/abandoned (excluded or included), walkovers, super overs (ignored) and mixed balls per over | U-NRR-01…20 | D3 |
| AC-E8-04 | Tie-breakers follow the configured chain with subgroup recomputation and no restart, including 3-way head-to-head, mini-league completeness, organizer decision and draw of lots | U-TB-01…20 | D3 |
| AC-E8-05 | Qualification supports top N per pool, pool winners + best runners-up across uneven pools (raw / per-match / drop-extra), top N overall, parallel Cup/Plate, direct entries and manual slots | U-QUAL-01…12, U-SLOT-* | D3, D4 |
| AC-E8-06 | Certainty (qualified / in contention / eliminated) is never claimed wrongly; explanations follow §98 and are always shown as text | U-QUAL-14…20, E2E-06 | D3, D9 |
| AC-E8-07 | Manual overrides (qualify, eliminate, reassign, points adjustment, tie resolution, slot assignment, champion) need a reason, show "Manual Override" and are audited and revocable | U-QUAL-09…11, E2E-10 | D4, D6 |
| AC-E8-08 | Standings update automatically after a match completes, with no manual refresh (§42, §66) | IT-T-12…15, E2E-06 | D2 |
| AC-E8-09 | A rules change after completed matches requires confirmation and a reason and recomputes every table | FR-09f | D6 |
| AC-E8-10 | Evaluating a 128-team, about 500-fixture tournament takes < 100 ms (node) | U-EVAL-03 | D7 |

## E9 — Knockout (§45, §46, §92)

| ID | Criterion | Verification | §104 |
|---|---|---|---|
| AC-E9-01 | Brackets for 2–33 entrants give byes to the top seeds and keep seeds 1 and 2 apart until the final; the third-place play-off is optional | U-KOB-01…10 | D2 |
| AC-E9-02 | Fixed (A1 v B2, B1 v A2), random (seeded) and ranking seeding work; ranking waits for final entrants | U-KO-01…09 | D4 |
| AC-E9-03 | Advancement handles wins, walkovers, awards, super-over or boundary-count decided ties, undecided ties and no results per the stage config | U-KO-10…24 | D3 |
| AC-E9-04 | Later rounds resolve from bracket positions; a re-draw never breaks them; a played knockout fixture's teams are frozen | U-KOB-09, U-QUAL-21, IT-T-19/20 | D5, D6 |
| AC-E9-05 | The §92 scenario completes: 8 teams → 2 pools → single RR → top 2 → 2 semifinals → final → champion, shown on the dashboard and in the tournaments list | IT-T-01…26, E2E-06 | D2 |
| AC-E9-06 | The champion comes only from the champion-deciding stage; shared champions and a champion override work | U-CHMP-01…06 | D3 |
| AC-E9-07 | Tied knockout matches force super overs when configured | IT-T-17/18 | D3 |

## E10 — Analytics & export (§52, §64, §82, §83)

| ID | Criterion | Verification | §104 |
|---|---|---|---|
| AC-E10-01 | Worm and Manhattan charts render the domain series; super overs are excluded | U-CARD-12/13, RNTL | D3 |
| AC-E10-02 | Tournament statistics (team, player, records) are computed locally from summaries; empty tournaments show zeros and nulls, never sample data | U-TST-01…06, IT-T-24 | D3 |
| AC-E10-03 | The PDF scorecard contains title, teams, venue, date, result, toss, batting, bowling, extras, FoW, partnerships, over summary and (tournament) standings; names are HTML-escaped; print styling is independent of the app theme | IT-M-18, FR-08e, WP-export tests | D10 |
| AC-E10-04 | PDF generation and share work offline via expo-print/expo-sharing; failure or cancellation leaves data untouched | FR-08a…d | D10, D5 |
| AC-E10-05 | The tournament PDF shows standings, results, bracket and champion | WP-export tests, MAN | D10 |

## E11 — Backup, accessibility, performance (§78, §84, §88)

| ID | Criterion | Verification | §104 |
|---|---|---|---|
| AC-E11-01 | A full / tournament / match JSON backup exports with all relationships, a checksum and an `exportId`, and round-trips exactly | IT-BK-01, U-BKP-* | D10 |
| AC-E11-02 | Import validates format, versions, checksum, values, duplicate ids, references (incl. ids inside event payloads) and event logs, and never changes data on error | FR-04a…l | D5 |
| AC-E11-03 | Duplicate imports are recognised; skip / import-as-copy / replace behave as specified and never silently overwrite | FR-06a…h, E2E-12 | D5 |
| AC-E11-04 | Screen reader: every control has an accessibility label; TalkBack and VoiceOver can complete a match setup, score an over (incl. a wicket) and read standings | E2E §8, MAN (checklist AC-E11-04, one pass per platform) | D9 |
| AC-E11-05 | Crash / power-loss checklist: 5 hard power-offs during scoring on a physical device lose at most the uncommitted ball and never corrupt the DB | FR-02b/c | D5 |
| AC-E11-06 | Dynamic type at 200 %: the score, pad labels and standings remain readable, without truncating the score figure | MAN with screenshots | D9 |
| AC-E11-07 | Reduced motion (system/on/off) disables the §75 transitions | RNTL, MAN | D9 |
| AC-E11-08 | Text contrast ≥ 4.5:1 (≥ 3:1 for large score text) in both themes, computed from tokens | WP-design-system tests | D8, D9 |
| AC-E11-09 | Performance: append + projection < 10 ms on sql.js; a history list of 1 000 matches and a 700-event ball log scroll without dropped frames (FlatList) | IT-DB-09, MAN with a performance overlay | D7 |
| AC-E11-10 | Data stays local: no account, login, tracking or cloud sync; export and share are always explicit user actions (§85) | G-08, MAN review | D10 |

## E12 — QA & polish (release gate, §100–§105)

| ID | Criterion | Verification | §104 |
|---|---|---|---|
| AC-E12-01 | Every E2E flow (E2E-01…14) passes on the phone emulator; E2E-06 passes 3 times in a row with no retries | CI (Maestro) | D1, D2 |
| AC-E12-02 | Every §93 scenario in FAILURE_RECOVERY_TESTS passes (INT in CI; DEV and MAN recorded) | FR-01…FR-18 | D5, D6 |
| AC-E12-03 | Light and dark screenshots of Home, Scoring, Scorecard, Standings, Bracket and Settings are reviewed against §68/§69/§101 (no neon, glassmorphism, giant cards or decorative dashboards); findings are fixed or waived in writing | E2E-13 + MAN design review | D8 |
| AC-E12-04 | Empty states (§87) and error states (§86) exist for every list and every failure path; no raw technical error text reaches the UI | E2E-14, FR-07, grep of `ServiceError.message` values | D9 |
| AC-E12-05 | Tested on a small phone (≤ 360 dp wide), a large phone, and a tablet in both themes; no clipped controls | MAN matrix | D7, D8 |
| AC-E12-06 | Open questions 1–10 in CONTRACTS.md §6 are answered by the product owner or explicitly deferred | MAN (PO sign-off) | — |

## §104 coverage matrix

| §104 clause | Criteria |
|---|---|
| D1 Match scored reliably offline | AC-E2-01…06, AC-E3-01…07, AC-E4-01, 03, 07, AC-E5-05, G-08 |
| D2 Tournament created → completed | AC-E6-01…06, AC-E7-05, AC-E8-08, AC-E9-05, AC-E12-01 |
| D3 Correct scores, stats, standings, NRR, qualification | AC-E3-01…09, AC-E8-01…06, AC-E9-03, 06, 07, AC-E10-01, 02 |
| D4 Customisable pools, fixtures, stages | AC-E6-02, 03, AC-E7-01…08, AC-E8-05, 07, AC-E9-02 |
| D5 Crashes and restarts are safe | AC-E1-01…03, 08, AC-E2-05, AC-E3-11, AC-E4-11, 12, AC-E5-02, 06, AC-E11-02, 03, 05, AC-E12-02 |
| D6 Mistakes correctable | AC-E3-10, 12, AC-E5-03, 04, AC-E6-04, 07, AC-E7-02, 04, 06, AC-E8-07, 09, AC-E9-04 |
| D7 Fast, usable outdoors | AC-E3-14, AC-E4-01, 02, 08…11, 13, 14, AC-E8-10, AC-E11-09, AC-E12-05 |
| D8 Professional light and dark | AC-E1-06, 07, AC-E6-06, AC-E11-08, AC-E12-03, 05 |
| D9 Accessible | AC-E4-04, 06, 09, AC-E8-06, AC-E11-04, 06…08, AC-E12-04 |
| D10 Export/share without cloud | AC-E10-03…05, AC-E11-01, 10 |

## Sign-off record (release)

| Epic | Owner | Automated | Manual | Status |
|---|---|---|---|---|
| G-01…G-10 | orchestrator | CI run # | — | ☐ |
| E1 Foundation | WP-db / WP-design-system | | AC-E1-06 | ☐ |
| E2 Match setup | WP-match-ui / WP-scoring-engine | | — | ☐ |
| E3 Scoring engine | WP-scoring-engine | | — | ☐ |
| E4 Live scoring UI | WP-match-ui | | AC-E4-08, 10, 14 | ☐ |
| E5 Scorecard & history | WP-match-ui / WP-services-stores | | — | ☐ |
| E6 Tournament foundation | WP-tournament-ui / WP-tournament-structure | | AC-E6-05, 06 | ☐ |
| E7 Pools & fixtures | WP-tournament-structure / WP-tournament-ui | | — | ☐ |
| E8 Standings & rules | WP-tournament-standings | | — | ☐ |
| E9 Knockout | WP-tournament-structure / WP-tournament-standings | | — | ☐ |
| E10 Analytics & export | WP-export | | AC-E10-05 | ☐ |
| E11 Backup, a11y, perf | WP-export / WP-design-system | | AC-E11-04…07, 09 | ☐ |
| E12 QA & polish | all | Maestro run # | AC-E12-03, 05, 06 | ☐ |
