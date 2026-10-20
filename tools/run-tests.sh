#!/bin/bash
# Run tests/dotgrid.test.html in headless Chrome and print PASS/FAIL.
#
# The test page is meant to be opened in a browser; this runs the same page
# without one, so the suite can be checked from a terminal. Exits non-zero
# if any test fails or the page throws before finishing.
#
# Usage, from the repository root:
#     bash tools/run-tests.sh

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PAGE="file://$ROOT/tests/dotgrid.test.html"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

if [ ! -x "$CHROME" ]; then
  echo "run-tests: no Chrome at $CHROME" >&2
  echo "run-tests: set CHROME=/path/to/chrome, or open $PAGE by hand." >&2
  exit 2
fi

DOM="$(mktemp -t dotgrid-dom)"
trap 'rm -f "$DOM"' EXIT

# An explicit window size: the suite asserts on layout, and Chrome's
# headless default of 800x600 is smaller than any desktop viewport.
# The height must clear the sticky gate (52rem / 832px) with room for
# whatever chrome --window-size counts that the viewport does not.
"$CHROME" --headless --disable-gpu --virtual-time-budget=5000 \
  --window-size=1280,1000 \
  --dump-dom "$PAGE" > "$DOM" 2>/dev/null

python3 - "$DOM" <<'PY'
import html
import re
import sys

dom = open(sys.argv[1]).read()


def strip(fragment):
    return html.unescape(re.sub("<[^>]+>", "", fragment)).strip()


items = re.findall(r'<li class="(pass|fail)">(.*?)</li>', dom, re.S)
for kind, text in items:
    print(("PASS  " if kind == "pass" else "FAIL  ") + strip(text))

summary = re.search(r'<p style="font-weight: bold;.*?">(.*?)</p>', dom, re.S)
if not summary:
    print("run-tests: the page threw before finishing — open it in a "
          "browser and read the console.", file=sys.stderr)
    sys.exit(1)

print("---")
print(strip(summary.group(1)))
sys.exit(1 if any(kind == "fail" for kind, _ in items) else 0)
PY
