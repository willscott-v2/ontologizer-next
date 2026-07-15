# Ontologizer 50-URL Calibration Method

Prepared by: Search Influence
Seed: `2026-07-15-ontologizer-calibration-v1`

## Purpose

This calibration checks whether Ontologizer's topic, entity, clarity, recommendation, modeled-question, and schema outputs agree with visible page evidence. It does not target a preferred distribution of Strong, Mixed, or Weak results.

## Sample

The candidate pool is the AI Website Grader's normalized historical public-URL corpus. The sampler removes manual input, duplicate normalized URLs, local or reserved hosts, credentials, and authentication, admin, account, cart, or checkout paths. It orders remaining candidates by a SHA-256 rank derived from the fixed seed, performs a public HTML preflight, and accepts the first 50 fetchable URLs.

Raw URLs, rejection details, and full outputs stay in `calibration/private/`, which Git ignores. The repository records only this method, aggregate findings, ordered sample hashes, and sanitized fixtures created from repeated defects.

The sample is split before review:

- Positions 1–40: calibration set
- Positions 41–50: untouched holdout set

If the original holdout fails and its examples become visible, later corrections are not tuned to those individual pages. A second validation set may be drawn with the same seed only by excluding all 50 original sample IDs. The failed holdout remains recorded.

## Run order and cost control

The current branch runs first without scoring or prompt adjustments. Each URL receives the core extraction, entity enrichment, clarity, recommendation, and connected-schema analysis. AI Query Coverage runs when tracked provider budget remains.

The private budget ledger has a $1.00 cap for the baseline and one correction rerun. The runner reserves $0.03 before starting each tracked provider call and stops or skips optional Query Coverage when the reserve is unavailable. Cached calls that report no provider usage add no cost.

## Review rubric

Reviewers judge the page evidence, not the tool's label:

1. **Main topic:** Does the topic name the page's primary subject or task?
2. **Identity:** Are important entities correctly typed and linked without fabricated identifiers?
3. **Clarity agreement:** Do the four statuses agree with their cited title, heading, opening, body, and entity evidence?
4. **Recommendations:** Is each action specific, useful, and traceable to page evidence?
5. **Modeled questions:** Are questions plausible for the page, non-duplicative, and supported by the cited chunks?
6. **Schema parity:** Does every emitted fact appear visibly on the page, and is the inferred page type appropriate?

Repeated defects receive a sanitized fixture before the smallest rule, parser, threshold, or prompt correction. The 10-URL holdout is reviewed only after corrections are frozen. Topic and schema type must agree with the rubric on at least 9 of 10 holdout pages, with zero unsupported schema facts or fabricated identifiers.
