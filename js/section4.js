// The comparison: two states in one frame, against their own timeline.
(function (global) {
  'use strict';

  var DotGrid = global.Apportionment.DotGrid;
  var data = global.Apportionment.data;
  var records = global.Apportionment.records;
  var store = global.Apportionment.store;
  var commas = global.Apportionment.format.commas;
  var plural = global.Apportionment.format.plural;

  var SCALE_TOKEN = '--compare-scale';

  // The three prepared comparisons, in tab order, and the Custom tab that
  // closes the strip. Editorial lives here and never in the store: the
  // store is given `a`/`b` values, and Custom — which has none — is
  // filtered out before it goes.
  //
  // Every figure in the copy is computed from the records at call time.
  // 42% and 45% are each one rounding from being wrong, and a rebuilt
  // dataset has to move them rather than quietly disagree with the page.
  var PRESETS = [
    {
      id: 'widest',
      label: '2020 \u2013 Delaware | Montana',
      a: { state: 'Delaware', year: 2020 },
      b: { state: 'Montana', year: 2020 }
    },
    {
      id: 'one-seat',
      label: '2020 \u2013 Delaware | Wyoming',
      a: { state: 'Delaware', year: 2020 },
      b: { state: 'Wyoming', year: 2020 }
    },
    {
      id: 'montana',
      label: '2010 \u2192 2020 \u2013 Montana',
      a: { state: 'Montana', year: 2010 },
      b: { state: 'Montana', year: 2020 }
    },
    { id: 'custom', label: 'Custom Comparison' }
  ];

  // How much smaller one state's population is than another's, as a whole
  // percent. Population, not load: the claim is about how many people
  // stand behind the seat.
  function fewerPeoplePct(smallerState, largerState, year) {
    var small = records.recordFor(smallerState, year);
    var large = records.recordFor(largerState, year);
    return Math.round((1 - small.population / large.population) * 100);
  }

  // How much lighter one seat became between two censuses, as a whole
  // percent of what it carried before.
  function lighterLoadPct(state, fromYear, toYear) {
    var before = records.recordFor(state, fromYear);
    var after = records.recordFor(state, toYear);
    return Math.round((1 - after.popPerRep / before.popPerRep) * 100);
  }

  // Parts, not a string, and the same { text } / { strong } shape partsFor
  // returns — so renderHeadline draws either without knowing which it has.
  function headingPartsFor(presetId) {
    if (presetId === 'widest') {
      return [
        { text: 'Both Delaware & Montana hold about ' },
        { strong: 'one million' },
        { text: ' people, but Delaware gets ' },
        { strong: 'one' },
        { text: ' seat and Montana gets ' },
        { strong: 'two' },
        { text: '.' }
      ];
    }
    if (presetId === 'one-seat') {
      return [
        { text: 'Both Delaware & Wyoming get ' },
        { strong: 'one' },
        { text: ' seat, despite Wyoming having ' },
        { strong: fewerPeoplePct('Wyoming', 'Delaware', 2020) + '%' },
        { text: ' fewer people.' }
      ];
    }
    if (presetId === 'montana') {
      return [
        { text: 'In ' },
        { strong: '2020' },
        { text: ' Montana gained a second seat. Each seat now represents ' },
        { strong: lighterLoadPct('Montana', 2010, 2020) + '%' },
        { text: ' fewer people than it did the decade before.' }
      ];
    }
    // Custom: the reader chose this pair, so there is no argument to make
    // about it. The heading row keeps its height; it just holds nothing.
    return [];
  }

  function headingTextFor(presetId) {
    return headingPartsFor(presetId).map(function (part) {
      return part.text || part.strong;
    }).join('');
  }

  // Capacity depends only on the state, so a year change never rebuilds.
  var renderedFor = { a: null, b: null };
  var resizePending = false;
  var tabs = null;

  var LEAD_PRESET = 'Where the gap is widest';
  var LEAD_CUSTOM = 'Build your own';

  function ratioOf(a, b) {
    if (!records.hasReps(a) || !records.hasReps(b)) return null;
    var high = Math.max(a.popPerRep, b.popPerRep);
    var low = Math.min(a.popPerRep, b.popPerRep);
    return high / low;
  }

  // Built as parts so the plain sentence and the bolded DOM version come
  // from one source and cannot drift apart.
  // Each column carries its own year now, so a sentence naming one year
  // for both sides reports one column's figure under the other's date.
  // Every branch below asks whether the years agree before it speaks.
  function partsFor(a, b) {
    var sameYear = a.year === b.year;

    // Only a true duplicate is "with itself". The same state at two years
    // is the Montana preset, and the difference is the entire point.
    if (a.name === b.name && sameYear) {
      return [{ text: "You're comparing " + a.name + ' with itself.' }];
    }

    var aHas = records.hasReps(a);
    var bHas = records.hasReps(b);

    if (!aHas && !bHas) {
      return [{ text: sameYear
        ? 'Neither ' + a.name + ' nor ' + b.name + ' was a state in ' + a.year + '.'
        : 'Neither ' + a.name + ' in ' + a.year + ' nor ' + b.name + ' in ' +
          b.year + ' was a state yet.' }];
    }
    if (!aHas || !bHas) {
      var missing = aHas ? b : a;
      return [{ text: missing.name + ' was not yet a state in ' + missing.year +
        ', so there is nothing to compare.' }];
    }

    // Always leads with the larger figure, whichever grid holds it.
    // "0.55× as many" is arithmetic the reader has to invert.
    var high = a.popPerRep >= b.popPerRep ? a : b;
    var low = high === a ? b : a;
    var ratio = high.popPerRep / low.popPerRep;
    var tooClose = ratio.toFixed(2) === '1.00';

    // One state across two censuses: name the years, not the state twice.
    if (a.name === b.name) {
      return [
        { text: 'A ' + a.name + ' representative spoke for ' }
      ].concat(
        tooClose ? [{ text: 'almost exactly as many people in ' }]
                 : [{ strong: ratio.toFixed(2) + '×' },
                    { text: ' as many people in ' }]
      ).concat([
        { strong: String(high.year) },
        { text: ' as in ' },
        { strong: String(low.year) },
        { text: '.' }
      ]);
    }

    // Two states in one year: unchanged, and still the common case.
    if (sameYear) {
      return [
        { text: 'In ' },
        { strong: String(a.year) },
        { text: ', a representative spoke for ' }
      ].concat(
        tooClose ? [{ text: 'almost exactly as many people in ' + high.name +
                            ' as in ' + low.name + '.' }]
                 : [{ strong: ratio.toFixed(2) + '×' },
                    { text: ' as many people in ' + high.name +
                            ' as in ' + low.name + '.' }]
      );
    }

    // Two states at two years: each side carries its own date, or one
    // column's figure is reported under the other column's year.
    return [
      { text: 'A ' + high.name + ' representative in ' },
      { strong: String(high.year) },
      { text: ' spoke for ' }
    ].concat(
      tooClose ? [{ text: 'almost exactly as many people as a ' }]
               : [{ strong: ratio.toFixed(2) + '×' },
                  { text: ' as many people as a ' }]
    ).concat([
      { text: low.name + ' one in ' },
      { strong: String(low.year) },
      { text: '.' }
    ]);
  }

  function sentenceFor(a, b) {
    return partsFor(a, b).map(function (part) {
      return part.text || part.strong;
    }).join('');
  }

  function scale() {
    return parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(SCALE_TOKEN)
    );
  }

  function renderHeadline(a, b) {
    var host = document.getElementById('compare-headline');
    if (!host) return;
    host.textContent = '';
    partsFor(a, b).forEach(function (part) {
      if (part.strong) {
        var el = document.createElement('strong');
        el.textContent = part.strong;
        host.appendChild(el);
      } else {
        host.appendChild(document.createTextNode(part.text));
      }
    });
  }

  function gridLabelFor(record) {
    if (!records.hasReps(record)) {
      return record.name + ' was not yet a state in ' + record.year + '.';
    }
    var dots = (record.popPerRep / data.peoplePerDot).toFixed(1);
    return dots + ' dots, each representing ' + commas(data.peoplePerDot) +
      ' people: the ' + commas(record.popPerRep) + ' people one ' +
      record.name + ' representative spoke for in ' + record.year + '.';
  }

  function renderSide(key, record) {
    var stage = document.getElementById('compare-grid-' + key);
    var gap = document.getElementById('compare-gap-' + key);
    var count = document.getElementById('compare-count-' + key);
    if (!stage) return;

    if (renderedFor[key] !== record.name) {
      DotGrid.renderCapacity(stage, { dots: records.capacityFor(record.name) });
      renderedFor[key] = record.name;
    }

    // Both sides reserve the ten-row ceiling, so the two frames match and
    // a gap year does not shrink one of them. A difference between the
    // frames would read as a difference in the data.
    stage.style.height = DotGrid.stageHeight(scale()) + 'px';
    stage.setAttribute('role', 'img');
    stage.setAttribute('aria-label', gridLabelFor(record));

    if (records.hasReps(record)) {
      DotGrid.setShowing(stage, records.dotsFor(record));
      if (gap) gap.textContent = '';
      if (count) {
        // Short, because it is now a caption sitting above the dots rather
        // than a sentence under them: the long form wrapped to two lines
        // and read as a label for the wrong thing.
        count.textContent = '';
        count.appendChild(document.createTextNode(
          commas(record.popPerRep) + ' per representative \u00b7 '));
        var reps = document.createElement('strong');
        reps.textContent = String(record.reps);
        count.appendChild(reps);
        count.appendChild(document.createTextNode(
          ' ' + plural(record.reps, 'seat')));
      }
    } else {
      DotGrid.setShowing(stage, { whole: 0, fraction: 0 });
      if (gap) gap.textContent = record.name + ' was not yet a state.';
      if (count) count.textContent = '';
    }
  }

  function currentRecords() {
    var snapshot = store.get();
    return {
      a: records.recordFor(snapshot.compareA, snapshot.compareYearA),
      b: records.recordFor(snapshot.compareB, snapshot.compareYearB)
    };
  }

  function syncSelect(id, value) {
    var control = document.getElementById(id);
    if (control && control.value !== String(value)) control.value = String(value);
  }

  // On a preset the column names itself, because there is no dropdown to
  // read it off. The year is not decoration: the Montana tab draws the
  // same state twice and the year is the only thing telling the two
  // columns apart.
  function renderHead(key, record, custom) {
    var host = document.getElementById('compare-head-' + key);
    var controls = document.getElementById('compare-controls-' + key);
    if (host) {
      host.hidden = custom;
      host.textContent = custom ? '' : record.name + ' \u00b7 ' + record.year;
    }
    if (controls) controls.hidden = !custom;
    if (custom) {
      syncSelect('compare-state-' + key, record.name);
      syncSelect('compare-year-' + key, record.year);
    }
  }

  function renderParts(host, parts) {
    host.textContent = '';
    parts.forEach(function (part) {
      if (part.strong) {
        var el = document.createElement('strong');
        el.textContent = part.strong;
        host.appendChild(el);
      } else {
        host.appendChild(document.createTextNode(part.text));
      }
    });
  }

  // Custom has no heading, and the three presets do not wrap to the same
  // number of lines, so without a floor the panel jumps by up to 52px as
  // the reader moves along the strip.
  //
  // Measured rather than declared: the headings wrap differently at every
  // width, so a min-height in em would reserve the wrong room everywhere
  // except where it was written. Re-measured on resize for the same
  // reason, which is what relayout() already exists to do.
  // Natural height per preset heading, and the tallest of them. Measured
  // rather than declared: the headings wrap differently at every width,
  // so a figure in em would be right only where it was written.
  var headingHeights = null;

  function measureHeadings() {
    var host = document.getElementById('compare-headline');
    if (!host || !host.parentNode) return;
    var width = host.getBoundingClientRect().width;
    if (!width) return;

    // A hidden twin, so the reader never sees the headings being tried on.
    var probe = host.cloneNode(false);
    probe.removeAttribute('id');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.paddingTop = '0';
    probe.style.width = width + 'px';
    host.parentNode.appendChild(probe);

    var heights = { tallest: 0 };
    PRESETS.forEach(function (preset) {
      renderParts(probe, headingPartsFor(preset.id));
      heights[preset.id] = probe.scrollHeight;
      heights.tallest = Math.max(heights.tallest, probe.scrollHeight);
    });
    probe.remove();
    headingHeights = heights;
  }

  // The row keeps the tallest heading's height so the presets do not
  // shift against each other — but the text hangs at the BOTTOM of it,
  // padded down from the top. Reserving the room above the sentence
  // rather than below it is what keeps a three-line heading from sitting
  // a hundred pixels clear of the columns it introduces.
  //
  // Padding, not flexbox: a flex container would make every <strong> in
  // the sentence its own flex item and break the line into fragments.
  function hangHeadline(host, presetId) {
    if (!headingHeights || !headingHeights[presetId]) {
      host.style.paddingTop = '';
      return;
    }
    host.style.paddingTop =
      Math.max(0, headingHeights.tallest - headingHeights[presetId]) + 'px';
  }

  function render() {
    if (!document.getElementById('compare-grid-a')) return;
    var preset = store.get().comparePreset;
    var pair = currentRecords();

    var lead = document.getElementById('compare-lead');
    if (lead) lead.textContent = preset === 'custom' ? LEAD_CUSTOM : LEAD_PRESET;

    // A preset argues; Custom does not. On Custom the row empties but
    // keeps its height, so switching tabs does not jolt the panel.
    var headline = document.getElementById('compare-headline');
    if (headline) {
      renderParts(headline, headingPartsFor(preset));
      hangHeadline(headline, preset);
      // Custom argues nothing, so its row leaves rather than standing
      // empty. Presets keep the reserved height so they do not shift
      // against each other.
      headline.hidden = preset === 'custom';
    }

    if (tabs) {
      tabs.render();
      var panel = document.getElementById('compare-panel');
      if (panel) panel.setAttribute('aria-labelledby', 'comparetab-' + preset);
    }

    renderHead('a', pair.a, preset === 'custom');
    renderHead('b', pair.b, preset === 'custom');
    renderSide('a', pair.a);
    renderSide('b', pair.b);
  }

  // The heading rewrites below the strip rather than at it, so like
  // Section 1's dropdown the change needs saying out loud. A preset reads
  // its own argument; Custom has none, so it reads the comparison.
  function announceCurrent() {
    var live = document.getElementById('compare-live');
    if (!live) return;
    var preset = store.get().comparePreset;
    if (preset !== 'custom') {
      live.textContent = headingTextFor(preset);
      return;
    }
    var pair = currentRecords();
    live.textContent = sentenceFor(pair.a, pair.b);
  }

  // One builder for both kinds: states are strings, years are numbers, so
  // the setter is handed the parsed value rather than the raw string.
  function buildDropdown(id, values, parse, setter) {
    var control = document.getElementById(id);
    if (!control) return;
    values.forEach(function (value) {
      var option = document.createElement('option');
      option.value = String(value);
      option.textContent = String(value);
      control.appendChild(option);
    });
    control.addEventListener('change', function (event) {
      if (setter(parse(event.target.value))) announceCurrent();
    });
  }

  function asText(value) { return value; }
  function asYear(value) { return Number(value); }

  function init() {
    if (!document.getElementById('compare-grid-a')) return;

    // Values only. A preset with no pair is editorial, and the store has
    // no business knowing the idea exists.
    store.registerComparePresets(PRESETS.filter(function (preset) {
      return preset.a && preset.b;
    }));

    var strip = document.getElementById('compare-tabs');
    if (strip) {
      tabs = global.Apportionment.CompareTabs.create(strip, {
        tabs: PRESETS,
        getActive: function () { return store.get().comparePreset; },
        setActive: function (id) {
          if (store.setComparePreset(id)) announceCurrent();
        }
      });
    }
    var panel = document.getElementById('compare-panel');
    if (panel) panel.setAttribute('role', 'tabpanel');

    buildDropdown('compare-state-a', data.stateNames, asText, store.setCompareA);
    buildDropdown('compare-year-a', data.years, asYear, store.setCompareYearA);
    buildDropdown('compare-state-b', data.stateNames, asText, store.setCompareB);
    buildDropdown('compare-year-b', data.years, asYear, store.setCompareYearB);

    // Unfiltered: the span* keys this used to skip belonged to the
    // one-state-two-years section, which is now a text divider with no
    // state at all. Every key the store still emits is one this section
    // either shows or recomputes from.
    store.subscribe(function () {
      render();
    });
    render();
    // After the first render, so the headings are measured against a
    // laid-out headline rather than an empty one — then re-rendered so
    // the opening tab gets its padding.
    measureHeadings();
    render();
  }

  // Re-render at the current size. The stage height is an inline pixel
  // value and --compare-scale changes at the 30rem breakpoint, so a
  // resize, a rotation or a browser zoom all leave the old number
  // describing a layout that no longer exists — and the grid then paints
  // over its own figure label and the section below.
  function relayout() {
    if (!document.getElementById('compare-grid-a')) return;
    measureHeadings();
    render();
  }

  // Coalesced to one re-render per frame: a drag fires resize continuously.
  global.addEventListener('resize', function () {
    if (resizePending) return;
    resizePending = true;
    requestAnimationFrame(function () {
      resizePending = false;
      relayout();
    });
  });

  global.Apportionment.section4 = {
    PRESETS: PRESETS,
    headingPartsFor: headingPartsFor,
    headingTextFor: headingTextFor,
    init: init,
    render: render,
    relayout: relayout,
    ratioOf: ratioOf,
    partsFor: partsFor,
    sentenceFor: sentenceFor
  };
})(window);
