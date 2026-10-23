# Play Store launch plan — Scorebook

Owner: personal Google Play developer account (meahmadkhanalone@gmail.com). Prepared 2026-10-23.

## 1. Timeline

| Phase | Duration | Outcome |
|---|---|---|
| A. Release readiness | 2–4 days | Signed `.aab`, clean permissions, final package name, store assets, privacy policy URL |
| B. Internal test | 1–2 days | Owner installs the Play-signed build on a real phone and scores a full match |
| C. Closed test (Google gate) | **14 days minimum** | ≥ 12 testers opted in and installed for 14 consecutive days; fix their feedback with updates |
| D. Production access | ~1–7 days | Apply in Play Console (questionnaire about the test); Google reviews |
| E. Launch | 1 week | Staged rollout 20% → 50% → 100%, watch Android vitals |
| F. Growth | ongoing | ASO iteration, review prompts, community outreach |
| G. Monetisation | after ~1–2 months | AdMob (and/or "remove ads" purchase) in a later version |

New personal accounts (created after 13 Nov 2023) cannot publish to Production until the closed-test gate is cleared: 12+ testers opted in for 14 consecutive days; an open test does not count; if active testers drop below 12 the clock restarts.

## 2. Phase A — release readiness checklist

Engineering:
- [x] **Package name** `com.ahmadkhan.scorebook` (permanent after the first upload).
- [x] `expo-audio` removed (sound was disabled).
- [x] Release manifest permissions: only `VIBRATE` (`app.json` `permissions` + `blockedPermissions`; `plugins/withDebugInternet.js` keeps `INTERNET` for debug builds only).
- [x] Upload key `C:\Users\User\.scorebook\scorebook-upload.jks` + `upload.properties` (outside the repo, wired by `plugins/withUploadSigning.js`). **Back both files up** — Play App Signing holds the real app-signing key; the upload key can only be reset through Google support.
- [x] `versionCode 1` / `versionName 1.0.0`; signed `.aab` with all four ABIs: `android/app/build/outputs/bundle/release/app-release.aab` (copy in `.workflow/release/scorebook-1.0.0-1.aab`), upload certificate SHA-256 `19:A3:CD:4E:42:59:DC:64:A7:07:40:10:17:53:EE:61:00:C5:50:DD:DD:C6:55:A5:05:63:0C:AD:71:EF:BD:FA`.
- [x] Android date/time picker dialogs themed to the app accent.
- [x] `npx tsc --noEmit` clean, `npx jest` 4,573 tests green.
- [ ] Release build on a real phone (Phase B, via the Play internal testing track).

Also done: target API 36, R8 + resource shrinking, unused native modules removed (download ≈ 13.8 MB, was ≈ 26.5 MB), English-only resources, release build runtime-checked on an emulator.

Store / policy:
- [x] Privacy policy: **https://muhammadahmad42.github.io/scorebook/privacy/** (GitHub Pages, repo `MuhammadAhmad42/MuhammadAhmad42.github.io`; the site root can host `app-ads.txt` later). Source: `docs/release/privacy-policy.html`.
- [x] Developer website: https://muhammadahmad42.github.io/
- [x] Support email: meahmadkhanalone@gmail.com
- [x] 512×512 Play icon and 1024×500 feature graphic: `docs/release/store-assets/` (rendered by `node scripts/brand/render-store.mjs`).
- [ ] 8 captioned phone screenshots (1080×1920): raw captures in `docs/release/store-assets/raw/`, framed by `node scripts/brand/render-screenshots.mjs` into `docs/release/store-assets/screenshots/`. Demo data: `.workflow/release/store-demo-backup.json` (fictional player names).
- [ ] Play Console forms: Data safety, content rating, target audience, ads declaration ("No ads"), app category, contact details (section 4 has the answers).

## 3. App Store Optimisation (ASO)

Google Play ranks mostly on: title, short description, full description (keyword relevance), install velocity, ratings/reviews, retention and crash rate. Keep keywords natural — keyword stuffing, "best/#1/top", emojis or ALL CAPS in the title are policy violations.

### Keyword targets

Primary: cricket scorer, cricket scoring app, cricket score counter, cricket scorebook.
Secondary: offline cricket scorer, cricket tournament manager, points table, net run rate (NRR) calculator, ball by ball scoring, scorecard PDF.
Long tail / regional: gully cricket, tape ball cricket, tennis ball cricket, club cricket, school cricket, local league, T10/T20 scorer, super over.

### Title (max 30 characters)

Recommended: **Cricket Scorer – Scorebook** (26). Alternatives: *Scorebook: Cricket Scorer* (25), *Cricket Score Counter Offline* (29).
The home-screen label stays **Scorebook**.

### Short description (max 80 characters)

> Offline cricket scoring & tournament manager: ball by ball, NRR, points table

(77 characters)

### Full description (max 4,000 characters)

```
Score every ball of your cricket match in one tap – no account, no internet, no ads.

Scorebook is a fast, offline cricket scorer and tournament manager for club, school, college, tape ball and gully cricket. Keep a complete ball-by-ball scorecard on your phone, then run a whole tournament with pools, a points table, net run rate and knockouts.

LIVE SCORING
• One tap for 0, 1, 2, 3, 4 and 6
• Wides, no-balls, byes, leg byes, free hits and penalty runs
• Every dismissal: bowled, caught, LBW, run out, stumped and more
• Automatic strike rotation, overs, CRR, RRR and target
• Undo, redo and edit any past ball – see what changes before you save
• Any number of overs, players per side and bowler limits
• Super over, rain-reduced overs and revised targets

SCORECARDS
• Full batting and bowling cards, extras, fall of wickets and partnerships
• Over-by-over summary, run-rate worm and Manhattan charts
• Share a clean PDF scorecard on WhatsApp or anywhere

TOURNAMENTS
• League, groups, knockouts – or your own format
• Random or manual pools, uneven pools, round-robin fixtures
• Automatic points table with net run rate (NRR)
• Tie-breakers, qualification, semi-finals and final
• What-if: see how a result would change the table
• Change history for organisers

BUILT FOR THE GROUND
• Works 100% offline – your matches stay on your phone
• Big buttons for one-handed scoring in bright sun
• Resume a match after a crash or a flat battery
• Dark and light themes
• Back up and restore your data as a file

Made for local leagues, school and university tournaments, office cricket, weekend matches and tape ball cricket. No sign-up and no tracking – open the app and start scoring.
```

When ads are added, remove "no ads" from the first line and the last paragraph.

### Graphics

Screenshots (1080×1920 or larger, captions in large text, real app data — no fake stats):
1. "Score every ball in one tap" — live scoring, dark.
2. "Works 100% offline" — home with a live match.
3. "Full scorecards & PDF" — scorecard.
4. "Run your tournament" — dashboard.
5. "Points table with NRR" — standings with qualification.
6. "Fix any ball safely" — edit preview (WHAT WILL CHANGE).
7. "Charts that tell the story" — worm / Manhattan.
8. "Light or dark" — light theme scoring.

Feature graphic 1024×500: brand mark + "Cricket Scorer – Scorebook" + one line "Offline scoring & tournaments".

### Category, tags, markets

- Category **Sports**; tags: cricket, sports scoring, tournament.
- Countries: all, with focus on Pakistan, India, Bangladesh, Sri Lanka, Afghanistan, UAE, UK, Australia, New Zealand, South Africa.
- Later: translated listings (Urdu, Hindi, Bengali) and custom store listings per country ("tape ball" wording for Pakistan/India).

### Growth levers after launch

- In-app review prompt after a completed match (never during scoring), at most once per few weeks.
- Shareable PDF scorecards and points tables carry a small "Scored with Scorebook" footer — every share is an ad.
- Local outreach: cricket clubs, school/university sports departments, Facebook and WhatsApp cricket groups, short demo videos.
- Recruit the 12+ closed testers from real local players and organisers — they become the first reviewers and word-of-mouth.
- Watch Play Console: store listing conversion rate, uninstall rate, ANR/crash rate (Android vitals is free, no SDK needed).

## 4. Policy forms (v1, no ads)

**Data safety:** no data collected, no data shared. All match and tournament data is stored only on the device; backups are files the user exports themselves. Users delete data in the app or by uninstalling.

**Privacy policy (draft content):** the app works offline; it does not collect, transmit or sell personal data; no account; no analytics or advertising SDKs; data stays on the device; exported backups and PDFs go only where the user sends them; contact email for questions. (Rewrite when ads are added.)

**Content rating (IARC):** utility/sports app; no violence, sexual content, gambling, user-to-user communication or location sharing → expected rating Everyone / 3+.

**Target audience:** 13+ (13–15, 16–17, 18+). Selecting under-13 brings Families policy obligations, which restrict ads later.

**Ads declaration:** "No, my app does not contain ads" for v1.

## 5. Monetisation plan (later version)

Principles: ads never appear on the live scoring screen or interrupt a match; the app keeps working fully offline (ads simply don't load); launch ad-free first to collect good ratings.

Recommended mix:
- **Banner / native ad** on History and Tournaments lists.
- **Interstitial** only after a match is completed, frequency-capped (e.g. at most one per two matches, never in the first session).
- Optional **rewarded ad** for extras (e.g. premium PDF themes).
- **"Remove ads" one-time purchase** via Google Play Billing — common and well received for scorer apps.

What adding ads requires:
- AdMob account linked to the Play app; `react-native-google-mobile-ads` (works with our development/release builds, not Expo Go).
- Google-certified consent (UMP) for EEA/UK users; `AD_ID` and `INTERNET` permissions.
- Updated Data safety (device identifiers, app interactions shared with Google for advertising), updated privacy policy, ads declaration "Yes".
- `app-ads.txt` on the developer website listed in Play (needs a website/domain).
- SPEC amendment: §85 currently promises no advertising — record the owner decision as a new spec section before implementing.
