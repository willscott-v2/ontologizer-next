# Ontologizer UI/UX and Calibration Report

Prepared by: Search Influence
Date: 2026-07-15
Seed: `2026-07-15-ontologizer-calibration-v1`

## Outcome

Ontologizer now uses the AI Website Grader's product-family structure: a compact navigation row, two-column hero, white analyzer card, task-specific progress, actionable failure state, and one linear report. The report no longer requires tab switching or a nested vertical scrollbar. Schema review, modeled AI Query Coverage, recommendations, evidence, exports, and diagnostics remain available in the same analysis.

The calibration corrected repeated reliability and trust defects before adjusting presentation labels. It did not force a preferred Strong, Mixed, or Weak distribution.

## Original 50-URL sample

The AI Website Grader corpus contained 986 historical runs when the original manifest was created. Normalization and fixed exclusions produced 555 unique candidates before public-HTML preflight. The fixed seed selected 50 eligible URLs: 40 calibration and 10 untouched holdout. The private ordered-sample hash is:

`a3c97b66070dfed5393a3017a29a1175e8c05a1e072f9f351553337d21af587b`

Raw URLs, rejected candidates, page excerpts, and full model outputs remain in the ignored `calibration/private/` directory.

## Defects found and corrected

1. **Entity route mismatch:** extraction sometimes returned more than 20 entities while enrichment accepted at most 20. Three of the first 40 pages failed. Extraction now trims, deduplicates, and caps entities at the shared limit. All three completed after the fix.
2. **Untracked fallback usage:** invalid recommendation and Query Coverage responses discarded provider usage. Both paths now preserve tokens and cost. The ledger includes a conservative $0.43 reserve for pre-fix calls whose exact usage was lost.
3. **Recommendation contract failures:** only 4 of 39 corrected-pass pages used AI recommendations; most failures involved invalid evidence IDs or response shape. OpenAI Structured Outputs now enforces the response contract, the prompt separates allowed IDs from the evidence catalog, and invalid evidence still falls back safely. The second validation set used AI recommendations on 10 of 10 pages.
4. **Query Coverage shape failures:** 6 of 39 corrected-pass pages returned invalid structures. The parser now normalizes safe provider variants such as coverage aliases, string arrays, null optional values, and excess evidence references before applying the strict evidence checks. Query Coverage completed on 10 of 10 pages in both holdouts.
5. **Unsupported recommendation evidence:** absence-based heading and repetition actions could lack evidence IDs. The clarity assessment now records the headings reviewed and the measured repetition count. The second validation set had no empty or invalid recommendation references.
6. **Page-type overclassification:** institutional homepages, profile pages, content portals, and service pages inside generic article wrappers were misclassified. Classification now requires stronger Article and Service evidence, recognizes profile and institution fallbacks, and uses the analyzed URL to keep root-path homepages out of Article schema.
7. **Unsupported schema fields:** Service schema could invent `Professional Service`, United States coverage, audience, and category values. Article and education generators could also accept weak author or provider guesses. Generic Service defaults and unsupported geography/category were removed; audience requires an explicit target phrase; authors must look like names and come from stronger byline signals; education providers are omitted when no institution is supported.
8. **Fixed topic confidence:** every model extraction reported 0.85. Confidence now reflects visible support in the title, H1, description, opening, and body. Topic overrides remain 1.0.

## Validation results

The original calibration pass reached 40/40 completed records after the route-limit fix. A later correction pass completed 39/40; the remaining page returned HTTP 429 during fetch and was classified as an external fetch limitation.

The first untouched holdout completed 10/10 through the pipeline, but the evidence rubric failed the release threshold:

- Main-topic agreement: 8/10
- Page-type agreement: 7/10
- Query Coverage completion: 10/10
- Generic Google `?q=` links: 0
- Identifier concerns: 0

The page-type and unsupported-field corrections were based on patterns already present in the 40-page calibration set. Because the original holdout had been observed, a second validation set was created from the same seeded corpus while explicitly excluding all original 50 sample IDs. This added 10 pages; it did not replace or rewrite the failed holdout.

The second validation set produced:

- Pipeline completion: 10/10
- Main-topic agreement: 10/10
- Page-type agreement: 9/10
- AI recommendation contract success: 10/10
- Query Coverage completion: 10/10
- Empty or invalid recommendation evidence references: 0
- Generic Google `?q=` `sameAs` links: 0
- Identifier concerns: 0

The one page-type miss was a root-path developer portal classified as Article. The final URL-aware homepage guard corrects that repeated homepage pattern and has deterministic regression coverage. No further live provider run was made after the ledger reached its stop margin.

## Cost and limitations

The final private ledger is $0.955986 against the $1.00 cap. That figure includes the conservative $0.43 reserve for usage the pre-fix fallback paths did not retain, so it is an upper-bound accounting figure rather than exact billed spend.

The evidence rubric is an independent structured review of visible title, description, headings, body excerpt, proposed topic/type, and generated schema. It does not use the tool's clarity labels as answers and does not receive raw source URLs. It can still disagree with a human reviewer on borderline Article versus WebPage decisions.

Google Knowledge Graph `kgmid` URLs are retained because they come from verified KG API matches. Generic Google `?q=` search links remain blocked from `sameAs`.

## Release position

The UI, route contracts, evidence references, model response handling, and schema fact controls are ready for protected-preview review. The final homepage guard and prominence-based topic confidence are covered by deterministic tests but were not followed by another paid 10-page run because the cost ledger reached the planned stop margin.
