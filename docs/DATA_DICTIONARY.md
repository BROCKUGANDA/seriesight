# Seriesight Data Dictionary

Provenance rules that govern every displayed number:

1. Every rate carries an explicit denominator definition embedded in its metric id (`definition` field).
2. Denominators count only eligible observations — a team's games exclude games it did not play; objective metrics exclude games without event coverage (excluded counts are shown, never silently dropped).
3. When a metric's inputs are missing, the UI renders an explicit **Unavailable** state. Nothing is estimated.
4. All fixture-derived numbers carry fixture provenance and never appear inside an official-data view.
5. Confidence labels derive from sample size **and** interval width — never from how impressive a value looks.

## Metric definitions

| Metric | Definition | Denominator | Null behaviour |
|---|---|---|---|
| `pick_rate (champion, team)` | picks / draft-eligible games of the team | draft-covered games in filter | null when denominator = 0 |
| `ban_rate (champion, team)` | bans / draft-eligible games | draft-covered games | null when 0 |
| `win_rate_when_played` | wins / picks of that champion | picks (withheld under 3 observations) | null below threshold |
| `pick_rate_blue / _red` | picks on that side / games on that side | side-specific games | null when side has 0 games |
| `first_dragon_rate` | games securing first dragon / eligible games | games with objective coverage | unavailable state when 0 eligible |
| `herald_secured_rate` | games securing herald / games with a herald event | games containing a herald event | unavailable when none |
| `baron_secured_rate` | games securing ≥1 baron / games with a baron event | games containing a baron event | unavailable when none |
| `first_turret_rate` | games taking first turret / eligible games | objective-covered games | unavailable when none |
| `kills_first_15_min` | kills ≤ 900 s / eligible games (count per game) | objective-covered games | unavailable when none |
| `average_game_duration` | Σ duration / completed games | games with duration | null when none |
| `composition_repeat_count` | occurrences of an identical 5-pick set | draft-covered games | insight suppressed when < 2 |

## Statistical machinery

- **Wilson interval** — binomial rates at 95% (`z = 1.959963985`); bounded to [0,1].
- **Confidence labels** — `high`: n ≥ 20 and CI width ≤ 0.28; `moderate`: n ≥ 8 and width ≤ 0.5; otherwise `low`.
- **Recency weighting** — `weight = exp(-ln2 · ageDays / 60)`; half-life 60 days (≈ two competitive patches), documented and unit-tested.

## Composition dimensions (coach-curated)

`engage, disengage, frontline, crowdControl, physicalDamage, magicDamage, scaling, siege, pickPotential, objectiveControl` — 0–100 vectors per champion, authored for the demo workspace. `null` means unknown: unknown dimensions are excluded from averages and scores, never interpolated. The champion *names/roles* follow Riot's public Data Dragon static-data conventions; the trait vectors are Seriesight-curated and labelled as such.

## Recommendation score (0–100)

Picks: composition fit 0.30 · historical usage 0.20 · evidence quality 0.15 · matchup support vs opponent 0.15 · side context 0.10 · flexibility 0.10.
Bans: opponent priority 0.45 · cross-game trend 0.15 · side threat 0.15 · evidence quality 0.15 · availability 0.10.

Components with no supporting data contribute `raw = null` and are excluded from both numerator and denominator of the weighted average. Every card exposes the full breakdown, positive/risk factors and alternatives. **The score is a draft-suitability heuristic, not a win probability** — the UI states this on every card.

## Draft state model

- Phases: `CONFIGURATION → BAN_PHASE_1 → PICK_PHASE_1 → BAN_PHASE_2 → PICK_PHASE_2 → FINALIZATION → COMPLETED` (+ `INVALID`, `CANCELLED` reserved).
- The ruleset owns the sequence (default tournament order: 6 bans → 4 picks B,R,R,B → 4 bans R,B,R,B → 6 picks B,R,R,B,B,R). Custom sequences are honoured verbatim.
- Bans (`bans[5]` per side), picks (ordered list per side) and Fearless restrictions are **separate** states; a ban never counts as a pick.
- Fearless: `hard` locks every champion picked by either team in earlier games for both teams; `soft` locks a team's own earlier picks (scope `own`) or both teams' (scope `both`). Availability is resolved **per side** — a champion locked only for RED stays available for BLUE.
- Every applied action = `{ id, order, type, side, championId, playerId?, role?, phase, actor, createdAt, priorStateVersion }`; undo/redo are event-sourced with board rebuilds from the action log.

## Fixture dataset

`fx-demo-2026-w46`, seed `20261117`, generated deterministically at module load: 4 fictional teams (Signal Nine is "our squad"; Nova Vanguard / Eastern Tide / Helix Syndicate are opponents), 3 tournaments (Regional BO3 standard, Continental Cup BO3 **soft** Fearless, Masters Invitational BO5 **hard** Fearless), 3 patches (16.8–16.10), 17 series (16 completed + 1 upcoming) and 47 games including a full 5-game Fearless BO5. Two games deliberately lack objective coverage and two lack player attribution to exercise partial/unavailable states. Label everywhere: *"Illustrative fixture data. Not actual Cloud9 performance and not an official GRID dataset."*
