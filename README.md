# One Dot Is 10,000 People

How many people does a single member of the U.S. House of Representatives
speak for? An interactive look at Census apportionment data, 1910–2020.

## Run it

Open `index.html` in a browser. There is no build step and no server —
the data is precomputed into `js/data.js`, so the page works straight
from the filesystem.

## Rebuild the data

Only needed if `data/apportionment.csv` changes:

    python3 tools/build-data.py

The script asserts everything the page assumes — 50 states, 600 rows,
House seats totalling 435, the 100-dot ceiling — and refuses to write
output if any of it fails.

## Run the tests

Open `tests/dotgrid.test.html` in a browser. It prints PASS/FAIL per test
and a summary.

To run the same page from a terminal instead:

    bash tools/run-tests.sh

It renders the test page in headless Chrome and exits non-zero if
anything fails. Set `CHROME=/path/to/chrome` if yours lives somewhere
unusual.

## Structure

| Path | What it does |
|---|---|
| `index.html` | The page |
| `css/style.css` | Tokens, cover, sections |
| `js/data.js` | Generated dataset — do not edit by hand |
| `js/dotgrid.js` | Dot renderer. Two modes: `render` draws a fixed grid, `renderCapacity` + `setShowing` draw one whose value changes over time |
| `js/format.js` | `commas`, `plural` |
| `js/records.js` | Dataset lookup and dot arithmetic |
| `js/store.js` | Shared state and year; Section 4's four comparison values and its active tab |
| `js/yearpicker.js` | Chevrons and slider, driven by callbacks; Section 2 runs the only one |
| `js/section1.js` | One representative, and the fan-out |
| `js/section2.js` | The timeline and its stepper |
| `js/comparetabs.js` | Tab strip over labelled ids, callback-driven; Section 4 runs one |
| `js/section4.js` | Three preset comparisons and a custom explorer |
| `js/app.js` | Bootstrap |
| `tools/build-data.py` | CSV → `js/data.js` |
| `tools/run-tests.sh` | Headless test run |
| `tools/drive.mjs` | Drive the real page in Chrome: clicks, keys, screenshots, console errors |

Sections never call each other. All of them subscribe to `js/store.js`,
and a redundant set does not notify — which is what lets several dropdowns
bind to one value without suppression flags.

Two constraints hold the architecture together, and both are easy to
break by accident:

- **No ES modules.** `type="module"` is blocked by CORS over `file://`,
  which would make the page work behind a server and silently fail on
  double-click. Everything is a classic `<script>` hanging off one
  global, `window.Apportionment`.
- **No absolute asset paths.** A leading `/` works locally and breaks
  the moment the site is served from a project subpath on GitHub Pages.

## Changing it

The test suite has never caught the defects that mattered most here.
Every serious one — dots painted over the next section after a rotation,
a slider rendering as a browser-default stub, content unreachable at any
scroll position on a common laptop — passed a green suite and was found
by rendering the page and looking at it. `tools/drive.mjs` exists for
that: real Chrome, real clicks and keypresses, screenshots, console
errors. Use it on anything visual before calling the work done, and
write the test afterwards — the test is how a fix stays fixed, not how
the bug gets found.

## Publishing

No build step, so GitHub Pages can serve the repository root directly:
Settings → Pages → Deploy from a branch → `main` / `/ (root)`.

## Data

U.S. Census Bureau, Congressional Apportionment. Figures for people per
representative use apportionment population, which differs slightly from
resident population — the page reads the Bureau's own per-representative
column rather than dividing population by seats.

Washington, DC and Puerto Rico appear in the source data with population
in every decade and no representatives in any. They are out of scope for
this piece and filtered out at build time.

## Status

Cover and Sections 1 to 4 are finished: what one representative carries
today, how that changed across twelve censuses, a divider explaining why
the gap opens at all, and three prepared comparisons with a custom
explorer. The closing carries the data source.

Section 4 opens on three presets — Delaware against Montana, Delaware
against Wyoming, and Montana against itself in 2010 and 2020 — each with
one sentence saying what gap it points at. A fourth tab hands the reader
the controls: a state and a year per column, so anything the presets show
can be rebuilt by hand. Custom starts from whatever preset you arrived
from, and keeps your own pair once you have edited it.
