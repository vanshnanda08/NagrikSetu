# NagrikSetu IEEE conference manuscript

This paper describes the implemented application at repository commit
`011ecb5c04192b1823065a2d4c248630c853add8`, inspected on 2026-10-29.
It uses the official `IEEEtran` class in conference mode with the `a4paper`
option. No geometry package, margin overrides, line-spacing changes, negative
spacing tricks, or body-font reductions are used.

## Deliverables

- `main.tex`: complete six-section research paper with ascending roll-number order
  and roll numbers.
- `REVIEW.md`: substantive review, revisions, and remaining evidence gaps.
- `references.bib`: ten verified academic/primary technical references.
- `IEEEtran.cls`, `IEEEtran.bst`: unmodified official class/style copies from
  CTAN, retaining their original license notices; see `THIRD_PARTY.md`.
- `figures/`: four original vector PDF figures (architecture/module interaction,
  lifecycle, core schema, and two-panel experimental results).
- `paper.pdf`: compiled A4 two-column manuscript.
- `generate_figures.py`: editable figure source; charts read the repository CSVs.
- `verify_evidence.py`: independent pairwise recount and artifact sanity checks.
- `validate_paper.py`: structural, author, font, citation, and page-bound checks.
- `evidence/verification.json`: recount output and SHA-256 hashes of source CSVs.
- `evidence/SOURCES.md`: implementation claim map, reference verification,
  evidence boundaries, and missing information.
- `build/`: retained compiler log, bibliography output, and QA records.

The manuscript is an implementation/evaluation paper, not a generic template.
It explicitly reports the extent cap's recall cost and its benefit on a
constructed stress geometry, instead of claiming universal superiority.

## Compile

From `paper/`, with Tectonic installed:

```sh
mkdir -p build
tectonic --keep-logs --keep-intermediates --outdir build main.tex
cp build/main.pdf paper.pdf
```

Tectonic automatically fetches standard packages/fonts and runs
BibTeX and the required LaTeX passes. Its first compilation needs internet
access; subsequent builds can reuse its cached bundle. On this machine the
compiler is Tectonic 0.17.0.

The source selects T1 encoding before the class initializes its default Times
family, making that standard typography work with Tectonic/XeTeX as well as
pdfLaTeX. The delivered PDF embeds its Times-compatible Nimbus fonts and
Computer Modern mathematics; body size and class layout remain unchanged.

The first default-bundle download failed on the authoring machine. The successful
build used its existing TeX cache, supplemented by exact TeX Live bundle byte
ranges fetched from the official Tectonic bundle host:

```sh
TECTONIC_CACHE_DIR="$HOME/Library/Application Support/ChatGPT/latex/tectonic" \
  tectonic --only-cached --keep-logs --keep-intermediates --outdir build main.tex
```

That cache path is specific to this machine; use the ordinary command above on
another machine. Full source and vector figures are included independently of
the cache.

Alternatively, install a TeX Live/MacTeX distribution that includes IEEEtran:

```sh
pdflatex -interaction=nonstopmode -halt-on-error main.tex
bibtex main
pdflatex -interaction=nonstopmode -halt-on-error main.tex
pdflatex -interaction=nonstopmode -halt-on-error main.tex
cp main.pdf paper.pdf
```

An Overleaf project using `main.tex`, `references.bib`, and `figures/` also works.
If a venue requires US Letter, change `a4paper` only after checking its rules;
this deliverable intentionally follows the user's A4 requirement.

## Rebuild figures and independently verify saved results

Use Python 3.9+ with Matplotlib (NumPy is a transitive dependency):

```sh
python3 -m venv .venv
.venv/bin/pip install matplotlib
.venv/bin/python verify_evidence.py
.venv/bin/python generate_figures.py
```

The scripts expect the original repository layout: `../artifacts/evaluation/`.
They do not contact or mutate an application database. The evidence verifier
uses Python's standard library only. It recomputes all 24 retained variants'
global pairwise scores from `production-predictions.csv`; it does **not** rerun
HTTP benchmarks or measure current performance.

The final compiled copy has seven A4 pages, six numbered sections, four vector
figures, four tables, six equations, and ten references. All pages were rendered
with Poppler and visually reviewed. Recheck the structural QA after edits with:

```sh
.venv/bin/pip install pypdf pdfplumber
.venv/bin/python validate_paper.py
pdftoppm -r 110 -png paper.pdf build/rendered/review
```

`validate_paper.py` also needs Poppler's `pdffonts`. Its current seven-page
assertion is a check on the delivered revision, not a rule to force later text
to fit. The retained log contains only underfull justification notices; no
overfull boxes, unresolved references/citations, or font substitutions remain.
Visual review must still be repeated after changes.

For fresh database experiments, follow `../evaluation/README.md`. Those
workloads require isolated scratch/Testcontainers databases and must not be
directed at production or the user's working local corpus. The prefill script
is destructive to its target database. No benchmark reset was performed to
prepare this paper.

## Missing information and submission preparation

- Authors are ordered by ascending roll number: Maurya Raheja (1024030078),
  Udhey Goyal (1024030084), and Vansh Nanda (1024030091), all at Thapar Institute of Engineering and
  Technology, Patiala. No unconfirmed department, email, ORCID, supervisor,
  funding statement, or institutional logo was invented. Department and email
  are omitted; add confirmed values if the venue requires them.
- No target conference, page limit, copyright notice, funding requirement, or
  anonymous-review policy was supplied. The author block and roll numbers are
  appropriate to the requested academic copy but may need adjustment for a
  specific venue. This has not been submitted or certified by IEEE PDF eXpress.
- Saved benchmark artifacts lack a complete hardware/OS/container-allocation,
  exact runtime, and run-configuration manifest. The paper states this instead
  of borrowing the current laptop's configuration for historical runs.
- No independent field labels, held-out dataset, multiple-seed trials,
  uncertainty calibration, confidence intervals, comparative algorithm runs,
  usability study, ethics approval, or municipal repair-outcome evidence was
  available. The manuscript makes no claims requiring those results.
- The names CivicTrack and NagrikSetu coexist in the repository. The paper uses
  NagrikSetu for the application and explains the retained internal name.
- Production email delivery, physical-device/screen-reader/PWA checks, reviewed
  destructive media cleanup, and production operating conditions remain
  follow-ups in the project record; they are not described as completed here.

All current figures are original diagrams or evidence-based plots. Screenshots
were unnecessary for the algorithmic argument and were not used as substitute
evidence for performance or usability. Bibliography entries were verified on
2026-10-29 from publishers, the original conference archive, or official docs;
see `evidence/SOURCES.md`.
