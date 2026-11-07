# Final manuscript QA

Completed 2026-10-29 with Tectonic 0.17.0, the unmodified IEEEtran 1.8b class,
IEEEtran bibliography style 1.14, and Poppler rendering/font inspection.

- Seven pages; every media box is A4 (595.28 x 841.89 pt).
- Conference two-column layout, default class margins and 10 pt body typography.
- 197-word abstract; six keywords; six numbered sections.
- Three user-supplied authors and roll numbers in the requested order.
- Four vector figures, four tables, six equations, ten cited references.
- BibTeX completed successfully; all citations and cross-references resolve.
- No overfull boxes, font substitutions, missing-glyph warnings, or text outside
  page boundaries. Every font is embedded; no Type 3 fonts.
- After substantive review, all seven final pages were rendered and visually
  inspected. Authors retain ascending roll-number order and inline roll
  numbers; the institute appears once.
- Diagrams were separately rendered to check internal label and arrow spacing.
- All 24 saved global pairwise variants were independently recounted and match
  retained summaries. HTTP/service sample counts and concurrency cohort results
  match their artifacts. This is an artifact verification, not a benchmark rerun.

The log retains underfull line/page justification notices, primarily for narrow
technical prose and bibliography URLs. Their rendered output was reviewed;
no spacing/margin/font-size overrides were added to suppress notices or force
the page count. The initial dependency-download failures were resolved with
official TeX resources and are not present in the retained successful log.

Machine-readable checks and PDF hash: `qa.json`. Embedded font report:
`fonts.txt`. Page metadata: `pdfinfo.txt`. Compiler outputs: `main.log`,
`main.blg`, `main.bbl`, and `compile-console.log`.

The paper has not been checked by a target conference or IEEE PDF eXpress.
Missing author contact/department information and experimental evidence limits
are documented in the README and source index.
