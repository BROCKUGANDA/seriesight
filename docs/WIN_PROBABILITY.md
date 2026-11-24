### Outcome-based draft win probability

Standalone exports: `src/domain/prediction/index.ts`. No API/UI, GRID credentials,
network access, deployment, or production-trained artifact is included.

### Integration contract

```ts
type Side = "blue" | "red";
interface LabelledMatch {
  matchId: string;
  seriesId: string;
  startedAt: string; // ISO timestamp with timezone, actual game start
  blueChampions: string[]; // exactly five, in actual per-side pick order
  redChampions: string[];  // exactly five, in actual per-side pick order
  winner: Side; // actual final outcome, not a heuristic label
  provenance: {
    kind: "real" | "synthetic";
    source: string;
    sourceMatchId: string;
  };
}
interface DraftInput {
  blueChampions: string[]; // 0..5 known picks, same canonical champion IDs
  redChampions: string[];  // 0..5 known picks
  side: Side;             // side whose probability is requested
}

trainWinModel(matches: readonly LabelledMatch[]): TrainingResult;
validateArtifact(value: unknown): TrainingResult;
predictWinProbability(artifact: unknown, draft: DraftInput): PredictionResult;
scoreProbabilities(probabilities: number[], outcomes: number[]): Metrics;
```

`TrainingResult` is `{status: "ready", artifact: WinModelArtifact}` or
`{status: "unavailable", reason: string}`. A ready artifact means training and
structural validation succeeded, **not** that every draft stage passes quality.

`PredictionResult` is `{status: "ready", probability, blueWinProbability,
partial, stage, metrics}` or the same unavailable result. Probabilities are in
`[0,1]`, not percentages; `probability` is for the requested side and red is
exactly `1 - blueWinProbability`. `stage` is `"blueCount:redCount"`.
`metrics` contains `calibration` and `test`, each with `model`, `baseline`
(training blue-win rate), and `coinflip` (0.5). Each has `brier`, `logloss`
(natural logarithm), and `ece` (10 equal-width probability bins).

### Reproducible usage

Use the existing TypeScript application/runtime; no training CLI is required.
For example, from a server-side TypeScript caller at the project root:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import {
  trainWinModel, predictWinProbability, validateArtifact,
  type LabelledMatch,
} from "./src/domain/prediction";

// An authenticated, audited ingestion job supplies this file. Never substitute
// demo fixtures or merely relabel synthetic records as real observations.
const matches: LabelledMatch[] = JSON.parse(readFileSync("real-matches.json", "utf8"));
const trained = trainWinModel(matches);
if (trained.status === "unavailable") throw new Error(trained.reason);
writeFileSync("win-model.json", JSON.stringify(trained.artifact));

const loaded = validateArtifact(JSON.parse(readFileSync("win-model.json", "utf8")));
if (loaded.status === "unavailable") throw new Error(loaded.reason);
const result = predictWinProbability(loaded.artifact, {
  blueChampions: ["Ahri"], redChampions: ["Vi"], side: "blue",
});
// Handle unavailable explicitly (including unknown champions and quality failure).
// Never turn unavailable into a numeric fallback presented as a calibrated score.
console.log(result);
```

Champion IDs in the example are illustrative; ingestion must use the exact
canonical, case-sensitive vocabulary of its dataset. Do not mix leagues, games,
patch eras, or incompatible champion naming schemes without separate evaluation.

Training sorts games by start time and match ID, groups whole series, and assigns
the earliest 60% of series to training, next 20% to calibration, final 20% to test
(floor boundaries). Every series must have a globally stable ID. Overlapping
time ranges across partition boundaries cause abstention rather than leakage or
silent resplitting. Reordering input records does not affect the artifact. There
is no randomness, clock dependence, shuffle, or seed to configure. The same
records and runtime produce the same JSON-serializable artifact.

### Training, calibration, and partial drafts

The model is L2-regularized logistic regression: a blue-side intercept and one
signed pick-presence coefficient per training champion (`+1` blue, `-1` red).
No team priors, outcomes from later games, final-result-derived features, or
champion vocabulary from held-out data are used. Training uses zero initialization,
250 full-batch gradient steps, learning rate 0.2, and L2 coefficient 0.01 (not on
the intercept). Calibration fits a logistic/Platt transform on calibration logits
only, with the same optimizer and L2 0.001. Its slope is constrained nonnegative
after fitting. Weights and hyperparameters are never tuned on the test partition.

Each match supplies all 36 per-side ordered prefix lengths `0..5 × 0..5`, equally
weighted. This is deterministic masking of **real observations**, not generated
outcomes; it does not multiply the effective match or series sample counts.
Calibration uses these prefixes too. Metrics are computed separately for each
stage, each on one prefix per held-out match, not pooled as independent examples.
The empty draft is honestly just a learned side prior. Partial predictions are
conditional on observed picks only, with no claimed knowledge of future picks.

Only actual pick prefixes are covered by partial-stage validation. Integrators
must not send arbitrary subsets, role-sorted final picks, or unseen selection
policies as though they had validated partial-stage calibration. The additive
model does not model champion interactions, teams, bans, pick policy, patch
drift, or causal champion strength. Calibration and test prefixes within a
series are correlated; reported metrics are descriptive point estimates, not
confidence guarantees or independent-sample significance tests.

### Availability and validation gates

- Only `kind: "real"`, nonempty source and source-match IDs, complete labelled
  drafts, valid timestamps, and binary side outcomes are accepted for training.
  One bad record rejects the dataset; it is not silently discarded.
- Match IDs and `(source, sourceMatchId)` must be unique. Champions cannot repeat
  within a draft or across sides. Inputs are runtime-validated with strict schemas.
- Minimum independent records: train 300 games/50 series; calibration 100/20;
  test 100/20. Both outcomes must comprise at least 20% in **every** partition.
  Fixed series fractions may require more than 500 games for uneven series sizes.
- Held-out champions must exist in the training vocabulary; otherwise training
  returns `unsupported-heldout-champion`. Prediction refuses unknown champions
  and champions occurring in fewer than 20 training games.
- Each prediction stage must have ECE ≤ 0.10 on calibration **and** test and
  must not worsen Brier or logloss against either training-prior or coinflip
  baseline (numerical tolerance `1e-8`). Otherwise `quality-gate-failed`.
  These are conservative operational floors, not scientific proof of calibration.
- Artifact validation checks version/algorithm, real-provenance marker, finite
  bounded parameters, dimensions, vocabulary uniqueness, counts/class balance,
  series disjointness, chronological ranges, training prior, and all 36 stages.
  Invalid artifacts cannot be used to predict. Validation does not retrain or
  independently reconstruct the submitted evaluation metrics.

**Trust boundary:** `kind: "real"` is an ingestion attestation, not a detector of
fabricated records. Likewise, artifact provenance and metrics are not a digital
signature. Only load artifacts produced by a trusted training job from audited
real outcomes; authenticate ingestion and protect artifact storage/access in the
parent integration. Do not accept client-supplied artifacts or caller-asserted
provenance as evidence. Duplicate events under different source identities also
require upstream identity reconciliation. No real data was supplied with this
implementation, so no credible real-world calibration or accuracy is claimed.

Freeze a dataset and inspect its one-shot test report before promotion. Repeated
model selection against the same test data invalidates its held-out interpretation;
reserve a new future evaluation cohort when changing features or hyperparameters.
Reject stale/out-of-domain artifacts upstream and evaluate new patches/leagues
before use; this module has no automatic freshness detector.

### Validation command

```powershell
npx vitest run tests/unit/prediction.test.ts
```

Tests exercise deterministic fitting with explicitly documented ingestion test
doubles, not credible real training data. No test artifact is saved or deployed.
They cover full/partial/empty drafts, complements, real-provenance rejection,
sample/class floors, duplicate identity, temporal overlap, unknown vocabulary,
artifact corruption/leakage, quality/support abstention, and exact metric examples.
API/UI wiring and integration tests belong to the parent integration task.