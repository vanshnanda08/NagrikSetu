# Manuscript review and revision

Reviewed 2026-10-29 against the manuscript, implementation evidence map,
verification tally source, and independently recounted retained results.

## Assessment

The manuscript is strongest as a prototype systems paper: its implemented
association rule, transparent failure cases, correction workflow, and paired
extent-cap ablation form a coherent contribution. It does not yet establish
comparative algorithm superiority or municipal effectiveness. The main weakness
was that implementation inventory displaced explanation of the research
question and the meaning of the observed errors.

## Changes made

- Added an explicit research question and three evaluation questions, then
  organized the results around them.
- Added the inductive justification for the conservative extent update and
  derived its conditional pairwise-distance limit. Distinguished geometric
  boundedness from correctness of physical-defect identity.
- Clarified that anonymous device identities count toward the quorum's reporter
  total but cannot vote, that settlement is sequential, and that the quorum cap
  is not a majority of all reporters.
- Interpreted category concentration: open manholes are 19.2% of reports but
  77.8% of missed pairs. Explained the weighting implicit in pairwise metrics.
- Quantified the seeded recall cost as 8.2 percentage points and connected the
  ablation to the unmeasured operational costs of incorrect merges and splits.
- Distinguished artifact consistency checks from repeated experiments, and
  identified dependence among pair outcomes as a constraint on uncertainty
  estimates.
- Removed peripheral stack and deployment inventory, tightened the conclusion,
  and preserved all quantitative results and existing bibliography entries.

## Evidence still needed for a stronger submission

1. Evaluate independently labelled real incidents and multiple synthetic seeds;
   report defect-level as well as pairwise errors, with appropriate uncertainty.
2. Run comparative baselines under a defined persistent-ticket policy and use
   held-out data for parameter selection. The current common-radius sweep also
   changes the extent threshold and cannot isolate radius effects.
3. Repeat timed workloads with hardware/runtime/configuration manifests, raw
   samples, and realistic photo retrieval; characterize sustained load.
4. Exercise adjacent-cell empty-candidate races and document mitigation results.
5. Evaluate citizen participation, adversarial voting, and actual repair outcomes.

These are experimental follow-ups, not results that can be supplied by editing.
No new benchmark, field study, or bibliography verification was claimed.

## Validation

All 24 saved global pairwise variants match the independent recount. The final
seven-page A4 PDF passes structural, citation, font, and page-bound checks; all
seven rendered pages were visually inspected. No overfull boxes, undefined
references, missing glyphs, or unembedded fonts were detected. Author names
retain ascending roll-number order and the institution appears once.
