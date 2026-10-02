# Scorebook — Personas

§102 product item 2. These personas drive the priorities in [USER_STORIES.md](USER_STORIES.md) (stories name their persona as P1–P5) and the outdoor and accessibility requirements in [REQUIREMENTS.md](REQUIREMENTS.md). They are composites of real scorer and organizer roles, not real people.

| ID | Persona | Mode | Main value |
|---|---|---|---|
| P1 | Imran Qureshi, club scorer | Single match + tournament fixtures | Fast, correct ball-by-ball scoring and a scorecard to be proud of |
| P2 | Nadia Rahman, school PE teacher | Small tournament | A junior inter-house competition run without spreadsheets |
| P3 | Rahul Menon, university sports officer | Large tournament | 22+ teams, uneven pools and knockouts, with a record of every decision |
| P4 | Bilal Ahmed, weekend group organizer | Single match | Start in 30 seconds, gully rules, zero friction |
| P5 | Margaret Doyle, league statistician | Tournament (league) | Correct tables, NRR, tie-breaks, corrections and backups |

---

## P1 — Imran Qureshi, club scorer

> "I've kept the book for this club for eleven years. If an app can't do a no-ball with two byes properly, it's a toy."

**Context.** 44, accountant. Honorary scorer for a Saturday club in Lahore that plays 30-over matches in a district league from October to March. He scores every home and away match from the boundary, often sitting on a plastic chair beside the sightscreen. He writes up the paper book at night and posts a photo of the scorecard in the club WhatsApp group. He is also asked to score the knockout rounds of the league's cup.

**Goals**
* Record every delivery accurately in real time, including the awkward ones: NB + 2 byes, 1 + 4 overthrows, a run-out going for the second, a stumping off a wide.
* Get bowling figures, fall of wickets and partnerships without transcribing anything.
* Fix a mistake from three overs ago without rebuilding the innings by hand.
* Hand the captain a PDF scorecard in the car park.
* When he scores a league fixture, have the result flow into the table without re-entering it.

**Frustrations**
* Apps that need a login and data. The ground has one bar of signal behind the pavilion.
* Undo that only removes "one run" instead of the whole ball, or that forgets who was on strike.
* Wrong bowler credit (a run out credited to the bowler) or wrong economy after extras.
* Adverts that cover the scoring buttons.
* "Match lost" after the phone restarted for an update.

**Device and conditions**
* Samsung Galaxy A-series (mid-range Android, 4 GB RAM), 3 years old, battery at 70% health. Carries a power bank.
* Direct afternoon sun (35–40 °C in October). Glare on the screen, brightness at maximum, sunglasses sometimes on.
* Holds the phone in his left hand and a pen in his right (he still keeps a paper backup for big games), so he scores with his left thumb.
* 4–5 hours of screen-on time per match. The screen must stay awake while scoring.

**Uses most:** live scoring pad, extras and wicket sheets, bowler prompt, undo, ball log edit, scorecard, PDF, resume after crash.

**Design implications:** one-tap normal balls; an extras sheet that covers every §17 combination; dismissal text in scorebook notation ("c Rizwan b Hassan"); high contrast; a keep-awake setting; a clear striker marker that isn't only an asterisk (§11); corrections that re-stamp later balls.

**Success looks like:** he stops transcribing and shares the PDF the same evening. The table updates as soon as he confirms the result.

---

## P2 — Nadia Rahman, school PE teacher

> "I have four houses, two age groups, one afternoon a week and forty eleven-year-olds who all want to bat."

**Context.** 36, Head of PE at a co-educational secondary school in Karachi. Every February she runs the inter-house cricket competition: 4 houses (Iqbal, Jinnah, Quaid, Sir Syed) in Under-13 and Under-15. Under-13 plays 8 overs a side, 8-a-side, every player bowls at most 1 over, and batters retire at 20. The U-15 league is a single round robin plus a final. Matches run on two practice strips at the same time during games periods. Older pupils sometimes score while she umpires.

**Goals**
* Set up both competitions in minutes from a template and edit the junior rules (8 overs, 8 players, retire at 20, wides re-bowled but only 1 run).
* Let a pupil score on her phone or a school tablet without breaking anything.
* Have the league table, and who plays in the final, calculated automatically for assembly on Monday.
* Handle a house fielding 7 because of absences, and a match abandoned because of a school event.

**Frustrations**
* Adult-cricket assumptions: 11-a-side, 20 overs, 4 overs per bowler.
* Tools that need every child's details before a match can start.
* Uneven sides and "retire at 20" break most apps' all-out and strike logic.
* Explaining NRR to parents when two houses finish level.

**Device and conditions**
* School-issued 10" Android tablet (shared, sometimes low battery) and her own iPhone.
* Outdoors in dusty conditions with bright winter sun. Children crowd around the screen.
* Pupil scorers are novices: large, labelled buttons and forgiving undo are essential.
* Sessions are 60–80 minutes. Matches are often paused and resumed the next week (SAVE & EXIT).

**Uses most:** match setup with custom rules (`playersPerSide`, per-team `teamAPlayers/teamBPlayers`, `mandatoryRetirement` advisory, `maxOversPerBowler`), players added on the fly, a league template, standings with explanations, a PDF of the final table.

**Design implications:**
* Junior presets are only pre-fills, and every rule stays editable.
* Mandatory retirement shows a banner but never blocks scoring.
* The tablet two-pane layout (§74) shows the scorecard next to the scoring pad for the class.
* Qualification text is plain enough for pupils ("Jinnah have qualified for the final.").

**Success looks like:** both competitions finish with no spreadsheet, and pupils score whole matches with her only checking the result.

---

## P3 — Rahul Menon, university sports department organizer

> "Every decision I make gets appealed. I need to show exactly what the rule was and when anything changed."

**Context.** 31, Assistant Sports Officer at a large university in Bengaluru. He runs the annual inter-department T20 championship: 22 department teams, 6 pools (4/4/4/4/3/3), pool winners and the 2 best runners-up go to quarterfinals, then semifinals and a final, over three weekends on 3 grounds. There is a Plate competition for 3rd-placed teams. Student volunteers score most matches on their own phones and send him backup files. He reports to the Dean of Students, and team captains lodge protests.

**Goals**
* Build a multi-stage structure (Groups → QF → SF → Final, plus a Plate) with qualification slots filled automatically ("Pool C winner", "Best runner-up #2").
* Compare runners-up fairly across 4-team and 3-team pools (points per match, or dropping results against 4th place).
* Handle withdrawals (a department team pulls out in week 2), replacements, rescheduling after rain, and a washed-out quarterfinal (higher seed goes through).
* Correct a result after a protest and see at once whether it changes who qualified. Record the reason.
* Export the bracket and final standings for the notice board.

**Frustrations**
* Spreadsheet qualification logic that breaks when a pool has a different number of matches.
* No way to prove when a result was changed and by whom (on this device) or why.
* Apps that assume "top 2 qualify" and 4 equal pools.
* Re-draws that silently rewrite a quarterfinal that has already been played.

**Device and conditions**
* 11" Android tablet at the organizer's desk under a tent, plus a personal Android phone on the grounds.
* Mixed conditions: shade at the desk, sun on the grounds, occasional rain delays.
* Imports 5–10 backup files per weekend from volunteer scorers, so duplicate imports are likely.

**Uses most:** stage builder, entry rules and slots, uneven-pool normalisation, WHAT WILL CHANGE previews, team withdraw/replace, overrides with reasons, audit log, bracket, backup import with conflict handling, tournament PDF.

**Design implications:**
* §98 explanations on every qualification.
* Impact previews before any structural change.
* Frozen knockout sides once a match starts.
* Import preview that recognises a file already imported (`previouslyImportedAt`) and offers skip / copy / replace.
* The tablet layout shows standings and fixtures side by side.

**Success looks like:** protests are settled from the audit log and qualification explanations, and the champion is decided without a manual table.

---

## P4 — Bilal Ahmed, casual weekend group organizer

> "We have 13 people, one tape ball and 90 minutes before it gets too hot. Just let me start."

**Context.** 27, software tester. Organizes Sunday-morning tape-ball cricket in a housing-society ground in Rawalpindi. Numbers change every week (11–16 people). Teams are picked on the spot, often 7 v 6. They play 6 or 8 overs, last man stands, one batter can't get out twice… and friends arrive halfway through and are added. Scoring is done by whoever is waiting to bat, so the phone changes hands several times a match. At the end they want the result in the group chat and some bragging rights (top scorer, best figures).

**Goals**
* Start a match in under 30 seconds: two team names, overs, go. Add players as they arrive, even mid-innings.
* Uneven sides and last man stands handled correctly (the lone batter keeps strike, and all out is at the team's own size).
* Local variants: wides that count as a ball, no free hit, a 2-over bowler limit, no toss.
* Undo a mistaken tap from the previous "scorer" without fuss.
* Share the result line and scorecard as a PDF or image in WhatsApp.

**Frustrations**
* Setup wizards that demand full squads, a venue, a date, and a toss before the first ball.
* Apps that say "all out" when 5 wickets have fallen in a 6-player team because they think it is 11-a-side.
* Being blocked because the "correct" bowler isn't set up, or because a player isn't in the squad.

**Device and conditions**
* Budget Android phone (Redmi-class, 3 GB RAM, 720p screen), cracked screen protector, 30% battery at 7 am.
* Harsh morning sun and dust. The phone is sometimes in a pocket between overs, and sweaty thumbs cause mis-taps.
* One-handed scoring while standing at square leg.

**Uses most:** quick match setup with rule presets (`rulesForOvers`), `lastManStands`, per-team side sizes, `wide.countsAsBall`, `noBall.freeHit: false`, add player on the fly, undo, result text, share.

**Design implications:**
* Venue, date, toss and squads are optional.
* The batter / bowler pickers include "add player".
* The pending action never deadlocks. `select_next_batter` offers "End innings (no batters available)", and bowler eligibility explains why someone is greyed out.
* Big touch targets.

**Success looks like:** the group uses it every Sunday with no instructions, and nobody argues about the score.

---

## P5 — Margaret Doyle, league statistician

> "If NRR is off by 0.001 the wrong club gets relegated, and it'll be my name on the email."

**Context.** 58, retired schoolteacher. Volunteer fixtures secretary and statistician for a district Sunday league in Leicestershire: 12 clubs, one division, 40-over matches, double round robin from May to August. Clubs' scorers send her results. She keeps the official table, applies points deductions (unfit ground, late start), awards walkovers when a side can't raise a team, and publishes weekly tables and end-of-season averages. At the moment she uses a spreadsheet she has "fixed" many times.

**Goals**
* Configure the league's points system (e.g. win 20, tie 10, NR 5, loss 0, plus a bonus point for run-rate dominance), the NRR method and the tie-breaker order exactly as the league handbook says.
* Import scorers' backup files and have the table update. Never double-count a file sent twice.
* Apply and later revoke a points deduction with a reason. Award a walkover. Record an "abandoned: no play" match.
* See why one club is above another ("Ahead of Kibworth on net run rate (+0.512 vs +0.231)").
* Keep an audit trail for the league committee. Export standings and player statistics.

**Frustrations**
* Hidden NRR assumptions: all-out rule, reduced overs, walkovers counted in NRR or not.
* Spreadsheets where one pasted row breaks every formula.
* No easy way to answer "what does Syston need from the last match to stay up?"
* Losing data when a laptop dies. She wants backups she controls.

**Device and conditions**
* iPad (10th gen) at the kitchen table, and an iPhone for checking tables at grounds.
* Mostly indoors. Occasionally at a ground in overcast, drizzly conditions.
* Prefers larger text (Dynamic Type at XL). Reads tables carefully and wants them dense but legible.

**Uses most:** tournament rules (points, bonus, NRR config, tie-breaker order), standings, points-adjustment and tie-resolution overrides, walkover and abandonment flows, backup import with duplicate detection, what-if, statistics, audit log, tournament PDF.

**Design implications:**
* NRR and tie-breakers are configured and explained, never hard-coded.
* Tables scale with Dynamic Type.
* Imports never merge silently.
* Every table change carries an explanation and an audit entry.

**Success looks like:** she retires the spreadsheet. The committee accepts the app's table and audit log as the official record.

---

## Cross-persona conditions that shape requirements

| Condition | Personas | Requirement consequence |
|---|---|---|
| No or weak signal at the ground | P1, P2, P3, P4 | Offline-first, no network calls (NFR-O) |
| Direct sunlight and glare | P1, P2, P4 | Contrast ≥ 4.5:1, a large scoring pad, no low-contrast labels (§72) |
| One-handed or thumb-only scoring | P1, P4 | Primary actions in the bottom 60% of the screen, ≥ 44 dp targets (larger on the pad) |
| Battery stress and old phones | P1, P2, P4 | Durable commits, resume prompt, keep-awake only on the scoring screen, low-end performance budgets |
| Scorers change during a match | P2, P4 | Undo that is always visible, forgiving pending prompts, no hidden gesture-only actions |
| Novice scorers | P2, P4 | Organizer-friendly validation messages that say why and what to do (§86) |
| Disputes and accountability | P3, P5 | Explanations (§98), WHAT WILL CHANGE (§99), audit (§53), reasons on overrides |
| Many imported files | P3, P5 | `exportId` recognition, per-aggregate conflicts, preview before import |
| Larger text sizes | P5 | Dynamic type support; tables reflow rather than truncate the score or NRR |
| Tablets | P2, P3, P5 | Two-pane layouts at ≥ 768 dp (§74) |
