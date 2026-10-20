// The timeline: one state's people-per-representative across twelve
// censuses. Always one representative's worth of dots — fanning out is
// Section 1's move, and repeating it here would muddle what this shows.
(function (global) {
  'use strict';

  var DotGrid = global.Apportionment.DotGrid;
  var data = global.Apportionment.data;
  var records = global.Apportionment.records;
  var store = global.Apportionment.store;
  var commas = global.Apportionment.format.commas;
  var plural = global.Apportionment.format.plural;

  var SCALE_TOKEN = '--single-scale';

  // Which state the current capacity was drawn for. Capacity depends only
  // on the state, so a year change never rebuilds anything.
  var renderedFor = null;

  var resizePending = false;
  var picker = null;

  // The House reached 435 seats in 1920 and has not moved since. The claim
  // is asserted at build time: tools/build-data.py checks seat totals of
  // 433 for 1910 and 435 for every year after, so this note cannot drift
  // from the dataset without the build failing.
  var ANNOTATION = {
    year: 1920,
    text: 'In 1920, the number of representatives was fixed to 435.'
  };

  // One source of truth for the sentence: the plain string, the live
  // region and the bolded DOM all derive from these parts.
  // { control: true } marks where the state dropdown sits in the sentence,
  // which is why the latest census can lead with the state instead of the
  // year. The pre-statehood case still names no statehood year.
  function partsFor(record) {
    if (!records.hasReps(record)) {
      return [
        { text: 'In ' }, { strong: String(record.year) }, { text: ', ' },
        { control: true },
        { text: ' was not yet a state.' }
      ];
    }

    var noun = plural(record.reps, 'representative');

    // The latest census is not history — it governs until the next one —
    // but it still leads with the year, so the state name does not jump
    // position as the reader steps onto it.
    if (record.year === data.years[data.years.length - 1]) {
      return [
        { text: 'Starting in ' }, { strong: String(record.year) }, { text: ', ' },
        { control: true },
        { text: ' has ' }, { strong: String(record.reps) },
        { text: ' ' + noun + ' until the next census — ' },
        { strong: commas(record.popPerRep) }, { text: ' people each.' }
      ];
    }

    return [
      { text: 'Starting in ' }, { strong: String(record.year) }, { text: ', ' },
      { control: true },
      { text: ' had ' }, { strong: String(record.reps) },
      { text: ' ' + noun + ' — ' },
      { strong: commas(record.popPerRep) }, { text: ' people each.' }
    ];
  }

  function sentenceFor(record) {
    return partsFor(record).map(function (part) {
      return part.control ? record.name : (part.text || part.strong);
    }).join('');
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

  function scale() {
    return parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(SCALE_TOKEN)
    );
  }

  function renderHeadline(record) {
    var before = document.getElementById('timeline-before');
    var rest = document.getElementById('timeline-rest');
    if (!before || !rest) return;
    before.textContent = '';
    rest.textContent = '';

    // Everything before the dropdown goes in one span, everything after in
    // the other, so the sentence can place the state anywhere within it.
    var host = before;
    partsFor(record).forEach(function (part) {
      if (part.control) { host = rest; return; }
      if (part.strong) {
        var el = document.createElement('strong');
        el.textContent = part.strong;
        host.appendChild(el);
      } else {
        host.appendChild(document.createTextNode(part.text));
      }
    });
  }

  function renderGrid(record) {
    var stage = document.getElementById('timeline-stage');
    if (!stage) return;

    if (renderedFor !== record.name) {
      DotGrid.renderCapacity(stage, { dots: records.capacityFor(record.name) });
      renderedFor = record.name;
    }

    // Reserved at the ten-row ceiling so the page does not jump — not when
    // the year changes, and not when playback crosses statehood.
    stage.style.height = DotGrid.stageHeight(scale()) + 'px';
    stage.setAttribute('role', 'img');
    stage.setAttribute('aria-label', gridLabelFor(record));

    if (records.hasReps(record)) {
      DotGrid.setShowing(stage, records.dotsFor(record));
    } else {
      DotGrid.setShowing(stage, { whole: 0, fraction: 0 });
    }
  }

  function renderGap(record) {
    var note = document.getElementById('timeline-gap');
    if (!note) return;
    note.textContent = records.hasReps(record)
      ? ''
      : record.name + ' was not yet a state, so it had no representatives.';
  }

  function yearAt(index) {
    return data.years[index];
  }

  function indexOf(year) {
    return data.years.indexOf(year);
  }

  // Stops at the ends rather than wrapping: manual control should not
  // teleport the reader across a century because they clicked once too
  // often. The chevron that has nowhere to go is disabled, so the limit
  // is visible before it is reached.
  // Announced after the change lands, not armed before it. A flag set
  // ahead of a store write survives a write that changes nothing, and
  // then speaks during some later, unrelated render.
  function announceCurrent() {
    var live = document.getElementById('timeline-live');
    if (!live) return;
    var snapshot = store.get();
    var record = records.recordFor(snapshot.stateName, snapshot.year);
    // Names its own state: "1930: was not yet a state" leaves a
    // screen-reader user asking which one.
    live.textContent = sentenceFor(record);
  }

  function next() {
    var target = indexOf(store.get().year) + 1;
    if (target >= data.years.length) return false;
    if (!store.setYear(yearAt(target))) return false;
    announceCurrent();
    return true;
  }

  function previous() {
    var target = indexOf(store.get().year) - 1;
    if (target < 0) return false;
    if (!store.setYear(yearAt(target))) return false;
    announceCurrent();
    return true;
  }

  // Positioned once, from the year rather than a hardcoded percentage, so
  // it stays correct if the span of censuses ever changes. A native range
  // thumb travels between its own half-widths, which is what --thumb
  // accounts for; alignment is within a pixel or two, not exact, because
  // the real thumb width is not exposed to CSS.
  function renderMark() {
    var mark = document.getElementById('year-mark');
    if (!mark) return;
    var index = indexOf(ANNOTATION.year);
    var last = data.years.length - 1;
    if (index < 0 || last < 1) return;
    mark.style.left =
      'calc(var(--thumb) / 2 + (100% - var(--thumb)) * ' + index + ' / ' + last + ')';
    var note = mark.querySelector('.player__mark-note');
    if (note) note.textContent = ANNOTATION.text;
  }

  function buildPlayer() {
    var root = document.getElementById('player');
    if (!root) return;

    renderMark();

    picker = global.Apportionment.YearPicker.create(root, {
      years: data.years,
      getYear: function () {
        return store.get().year;
      },
      setYear: function (year) {
        if (store.setYear(year)) announceCurrent();
      }
    });
    picker.render();
  }

  function render() {
    var snapshot = store.get();
    var record = records.recordFor(snapshot.stateName, snapshot.year);
    var control = document.getElementById('timeline-state');
    if (control && control.value !== record.name) control.value = record.name;
    renderHeadline(record);
    renderGrid(record);
    renderGap(record);
    if (picker) picker.render();
  }

  // Re-render at the current size. The stage height is an inline pixel
  // value and the dot tokens change at the 30rem breakpoint, so a resize,
  // an orientation change or a browser zoom all leave the old number
  // describing a layout that no longer exists — and the grid then paints
  // over whatever follows it.
  function relayout() {
    if (!document.getElementById('timeline-stage')) return;
    render();
  }

  function buildDropdown() {
    var control = document.getElementById('timeline-state');
    if (!control) return;
    data.stateNames.forEach(function (name) {
      var option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      control.appendChild(option);
    });
    control.value = store.get().stateName;
    control.addEventListener('change', function (event) {
      // Each section announces its own control. Without this the reader
      // changes the state here and hears Section 1's 2020 figures.
      if (store.setStateName(event.target.value)) announceCurrent();
    });
  }

  function init() {
    if (!document.getElementById('timeline-stage')) return;
    buildDropdown();
    buildPlayer();
    store.subscribe(function (snapshot) {
      // compare* and span* belong to Sections 4 and 3; re-rendering here
      // would be waste.
      if (snapshot.changed.indexOf('compare') === 0) return;
      if (snapshot.changed.indexOf('span') === 0) return;
      render();
    });
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

  global.Apportionment.section2 = {
    init: init,
    render: render,
    relayout: relayout,
    partsFor: partsFor,
    sentenceFor: sentenceFor,
    gridLabelFor: gridLabelFor,
    next: next,
    previous: previous,
    yearAt: yearAt,
    indexOf: indexOf
  };
})(window);
