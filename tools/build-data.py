#!/usr/bin/env python3
"""Build js/data.js from data/apportionment.csv.

Usage, from the repository root:
    python3 tools/build-data.py

Exits non-zero and explains itself if the data does not match what the
design assumes. A wrong number here is invisible in the browser, so every
assumption the page relies on is checked before anything is written.
"""

import csv
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "apportionment.csv"
OUT_PATH = ROOT / "js" / "data.js"

PEOPLE_PER_DOT = 10000
MAX_DOTS = 100

# DC and Puerto Rico appear as state-level rows with population in every
# decade and representatives in none. Out of scope by design decision.
EXCLUDED = {"District of Columbia", "Puerto Rico"}

YEARS = list(range(1910, 2021, 10))

# Rows where a blank representative count is a historical fact, not a
# parsing failure. Arizona and New Mexico reached statehood in 1912;
# Alaska and Hawaii in 1959.
PRE_STATEHOOD = (
    {("Arizona", 1910), ("New Mexico", 1910)}
    | {("Alaska", y) for y in (1910, 1920, 1930, 1940, 1950)}
    | {("Hawaii", y) for y in (1910, 1920, 1930, 1940, 1950)}
)

# The House grew to 435 in 1920 and has not moved since.
SEATS_BY_YEAR = {y: (433 if y == 1910 else 435) for y in YEARS}

SINGLE_REP_STATES_2020 = {
    "Alaska", "Delaware", "North Dakota",
    "South Dakota", "Vermont", "Wyoming",
}


class BuildError(Exception):
    """Raised when the source data contradicts a design assumption."""


def check(condition, message):
    if not condition:
        raise BuildError(message)


def parse_number(raw):
    """Census numbers arrive quoted with thousands separators: "2,138,093"."""
    cleaned = (raw or "").strip().replace(",", "")
    if not cleaned:
        return None
    return int(float(cleaned))


def load_rows():
    with CSV_PATH.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def build(rows):
    states = {}
    for row in rows:
        if row["Geography Type"] != "State":
            continue
        name = row["Name"].strip()
        if name in EXCLUDED:
            continue
        states.setdefault(name, []).append({
            "year": int(row["Year"]),
            "reps": parse_number(row["Number of Representatives"]),
            # Authoritative. Never derived from population / reps.
            "popPerRep": parse_number(
                row["Average Apportionment Population Per Representative"]
            ),
            "population": parse_number(row["Resident Population"]),
        })
    for name in states:
        states[name].sort(key=lambda record: record["year"])
    return states


def verify(states):
    check(len(states) == 50, f"expected 50 states, got {len(states)}")

    for excluded in EXCLUDED:
        check(excluded not in states, f"{excluded} survived the filter")

    total_rows = sum(len(records) for records in states.values())
    check(total_rows == 600, f"expected 600 rows, got {total_rows}")

    for name, records in states.items():
        years = [record["year"] for record in records]
        check(years == YEARS, f"{name} has years {years}, expected all 12")

    # Seats must account for the whole House in every year. If this passes,
    # dropping DC and Puerto Rico cost us nothing.
    for year, expected_seats in SEATS_BY_YEAR.items():
        total = sum(
            record["reps"] or 0
            for records in states.values()
            for record in records
            if record["year"] == year
        )
        check(total == expected_seats,
              f"{year}: seats total {total}, expected {expected_seats}")

    # Nulls are allowed only where a state did not yet exist.
    nulls = {
        (name, record["year"])
        for name, records in states.items()
        for record in records
        if record["reps"] is None
    }
    check(nulls == PRE_STATEHOOD,
          f"unexpected null representative counts: {nulls ^ PRE_STATEHOOD}")

    # Every row that has representatives must also have a population figure
    # per representative, or the page has nothing to draw.
    for name, records in states.items():
        for record in records:
            if record["reps"] is not None:
                check(record["popPerRep"] is not None,
                      f"{name} {record['year']} has reps but no popPerRep")

    # The 10x10 ceiling is the organizing constraint of the whole design.
    worst = max(
        (record["popPerRep"], name, record["year"])
        for name, records in states.items()
        for record in records
        if record["popPerRep"] is not None
    )
    check(worst[0] / PEOPLE_PER_DOT <= MAX_DOTS,
          f"{worst[1]} {worst[2]} needs {worst[0] / PEOPLE_PER_DOT:.1f} dots, "
          f"which breaks the {MAX_DOTS}-dot ceiling")

    # Spot checks against figures quoted in the spec and in the page copy.
    new_york_2020 = states["New York"][-1]
    check(new_york_2020["reps"] == 26, "New York 2020 should have 26 reps")
    check(new_york_2020["popPerRep"] == 777529,
          "New York 2020 should be 777,529 people per representative")

    check(worst[1] == "Montana" and worst[2] == 2010 and worst[0] == 994416,
          "all-time maximum should be Montana 2010 at 994,416")

    lowest = min(
        (record["popPerRep"], name, record["year"])
        for name, records in states.items()
        for record in records
        if record["popPerRep"] is not None
    )
    check(lowest[1] == "Nevada" and lowest[2] == 1920 and lowest[0] == 75820,
          "all-time minimum should be Nevada 1920 at 75,820")

    # Six states have exactly one representative. Copy must read "1
    # representative", so the page needs this to be true, not assumed.
    singles = {
        name for name, records in states.items()
        if records[-1]["reps"] == 1
    }
    check(singles == SINGLE_REP_STATES_2020,
          f"single-representative states are {singles}, "
          f"expected {SINGLE_REP_STATES_2020}")


def write(states):
    payload = {
        "peoplePerDot": PEOPLE_PER_DOT,
        "years": YEARS,
        "stateNames": sorted(states),
        "states": {name: states[name] for name in sorted(states)},
    }
    body = json.dumps(payload, indent=2, sort_keys=False)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        "// Generated by tools/build-data.py. Do not edit by hand.\n"
        "// Source: data/apportionment.csv (U.S. Census Bureau).\n"
        "window.Apportionment = window.Apportionment || {};\n"
        "window.Apportionment.data = " + body + ";\n",
        encoding="utf-8",
    )


def main():
    rows = load_rows()
    states = build(rows)
    try:
        verify(states)
    except BuildError as error:
        print(f"build-data: {error}", file=sys.stderr)
        return 1
    write(states)
    print(f"build-data: wrote {OUT_PATH.relative_to(ROOT)} "
          f"({len(states)} states, "
          f"{sum(len(r) for r in states.values())} rows)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
