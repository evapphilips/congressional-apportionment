// Section 1: what one representative carries today. Classic script, no
// modules — ES modules are blocked by CORS over file://, and this page
// must open by double-click.
(function (global) {
  'use strict';

  var DotGrid = global.Apportionment.DotGrid;
  var data = global.Apportionment.data;
  var records = global.Apportionment.records;
  var store = global.Apportionment.store;
  var commas = global.Apportionment.format.commas;
  var plural = global.Apportionment.format.plural;
  var dotsFor = records.dotsFor;
  var CURRENT_YEAR = 2020;

  // Total stagger across all clusters, in ms. Divided by the cluster count
  // so California's 52 clusters do not take five times longer to fan out
  // than Wyoming's one.
  var STAGGER_BUDGET_MS = 300;
  var MAX_STAGGER_MS = 10;

  // The year the House was fixed at 435, and so the year every later
  // figure is a consequence of. CURRENT_YEAR - BASELINE_YEAR is the span
  // the note names; neither is written into the copy by hand.
  var BASELINE_YEAR = 1920;

  var isExpanded = false;
  var expandedHeight = 0;
  // Which view the gain note was last rendered against, so the arrival
  // can fire on the fan-in and nowhere else.
  var gainWasExpanded = false;

  function recordFor(stateName) {
    return records.recordFor(stateName, CURRENT_YEAR);
  }

  // Six states have exactly one representative, so the noun must agree.
  function headlineFor(record) {
    return 'Today, ' + record.name + ' has ' + record.reps + ' ' +
      plural(record.reps, 'representative') + '.' +
      " That's " + commas(record.popPerRep) + ' people per representative.';
  }

  // Ten rows is the dataset-wide ceiling, so reserving it means the stage
  // never resizes when the reader changes state.
  function singleStageHeight() {
    var styles = getComputedStyle(document.documentElement);
    var dot = parseFloat(styles.getPropertyValue('--dot-size'));
    var gap = parseFloat(styles.getPropertyValue('--dot-gap'));
    var scale = parseFloat(styles.getPropertyValue('--single-scale'));
    return (10 * dot + 9 * gap) * scale;
  }

  // Measure each cluster's offset from cluster 0 once per render, so the
  // collapsed view can pull the siblings back to its origin with a pure
  // transform. Reads are batched before any write to avoid layout thrash.
  function measureOffsets(stage) {
    var clusters = stage.querySelectorAll('.cluster');
    if (!clusters.length) return;
    var origin = clusters[0].getBoundingClientRect();
    var offsets = [];
    for (var i = 0; i < clusters.length; i++) {
      var box = clusters[i].getBoundingClientRect();
      offsets.push([box.left - origin.left, box.top - origin.top]);
    }
    for (var j = 0; j < clusters.length; j++) {
      clusters[j].style.setProperty('--dx', offsets[j][0] + 'px');
      clusters[j].style.setProperty('--dy', offsets[j][1] + 'px');
    }
  }

  // Pure, and takes the view explicitly, so the number agreement can be
  // tested without driving the page into that view.
  function gridLabelFor(record, expanded) {
    var perRep = (record.popPerRep / data.peoplePerDot).toFixed(1);
    var each = ' dots, each representing ' + commas(data.peoplePerDot) + ' people';
    if (!expanded) {
      return perRep + each + ': the ' + commas(record.popPerRep) +
        ' people one ' + record.name + ' representative speaks for.';
    }
    // Noun and verb disagree in opposite directions here: one group, one
    // representative, but "speaks" — so the verb cannot reuse plural().
    return record.reps + ' ' + plural(record.reps, 'group') + ' of ' + perRep + each +
      ': everyone ' + record.name + "'s " + record.reps + ' ' +
      plural(record.reps, 'representative') + ' ' +
      (record.reps === 1 ? 'speaks' : 'speak') + ' for.';
  }

  // A one-representative state has nothing to fan out into: both views
  // would draw the same single cluster, differing only in size. Its toggle
  // is disabled, so the large view is the one that must render — otherwise
  // a preference carried in from another state strands the reader on a
  // quarter-size grid with no control to escape it.
  function showsAllReps(record) {
    return isExpanded && record.reps > 1;
  }

  function buildToggleOption(id, onClick) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'viewtoggle__option';
    button.id = id;
    button.addEventListener('click', onClick);
    return button;
  }

  function renderToggle(record) {
    var host = document.getElementById('view-toggle');
    if (!host) return;

    // Built once and reused. This runs on every view change, including the
    // one a click on these buttons starts — replacing the nodes there would
    // throw away the reader's focus and silence the aria-pressed change.
    var one = document.getElementById('view-one');
    var all = document.getElementById('view-all');
    if (!one || !all) {
      host.textContent = '';
      one = buildToggleOption('view-one', function () {
        global.Apportionment.app.setExpanded(false);
      });
      all = buildToggleOption('view-all', function () {
        global.Apportionment.app.setExpanded(true);
      });
      host.appendChild(one);
      host.appendChild(all);
    }

    var showingAll = showsAllReps(record);
    one.textContent = '1 rep';
    all.textContent = 'All ' + record.reps + ' ' + plural(record.reps, 'rep');
    one.setAttribute('aria-pressed', String(!showingAll));
    all.setAttribute('aria-pressed', String(showingAll));

    var locked = record.reps === 1;
    one.disabled = locked;
    all.disabled = locked;
    host.classList.toggle('viewtoggle--disabled', locked);
    host.title = locked
      ? record.name + ' has only one representative, so there is nothing to fan out.'
      : '';
  }

  // Swap between the two views. Transitions are live here: this is the
  // fan-out the reader asked for.
  function applyView(record) {
    var stage = document.getElementById('grid-stage');
    if (!stage) return;
    var showingAll = showsAllReps(record);
    stage.classList.toggle('grid-stage--expanded', showingAll);
    stage.classList.toggle('grid-stage--single', !showingAll);
    stage.style.height = (showingAll ? expandedHeight : singleStageHeight()) + 'px';
    stage.setAttribute('role', 'img');
    stage.setAttribute('aria-label', gridLabelFor(record, showingAll));
    renderToggle(record);
    renderGain(record, showingAll);
  }

  // Rebuild the grid from scratch. Always renders every cluster: the two
  // views differ only in transform, so changing state mid-transition
  // cannot leave stale clusters behind.
  function renderGrid(record) {
    var stage = document.getElementById('grid-stage');
    if (!stage) return;
    var dots = dotsFor(record);

    // Measuring flushes style, which would otherwise make the new grid
    // animate in from wherever the old one happened to be.
    stage.classList.add('is-measuring');

    DotGrid.render(stage, {
      clusters: record.reps,
      dotsPerCluster: dots.whole,
      fraction: dots.fraction
    });

    stage.style.setProperty('--stagger',
      Math.min(MAX_STAGGER_MS, STAGGER_BUDGET_MS / record.reps) + 'ms');

    // Measure in the expanded layout, which is the ground truth.
    stage.style.height = '';
    stage.classList.remove('grid-stage--single');
    stage.classList.add('grid-stage--expanded');
    measureOffsets(stage);
    expandedHeight = stage.scrollHeight;

    applyView(record);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        stage.classList.remove('is-measuring');
      });
    });
  }

  // Built from parts rather than sliced out of the composed sentence: the
  // numbers need their own elements to be bold, and composing is safe by
  // construction where string surgery on a state name is not.
  function renderHeadline(record) {
    var host = document.getElementById('headline-rest');
    if (!host) return;
    host.textContent = '';

    function text(value) { host.appendChild(document.createTextNode(value)); }
    function strong(value) {
      var el = document.createElement('strong');
      el.textContent = value;
      host.appendChild(el);
    }

    // The select already carries the state name, so this picks up after it.
    text(' has ');
    strong(String(record.reps));
    text(' ' + plural(record.reps, 'representative') + ". That's ");
    strong(commas(record.popPerRep));
    text(' people per representative.');
  }

  // What one representative carries now against what one carried when the
  // House was fixed. Null where there is no baseline row to count from:
  // Alaska and Hawaii carry a null popPerRep until 1960, and in JavaScript
  // subtracting that yields a number, so the guard has to be explicit.
  function gainSince(record) {
    var then = records.recordFor(record.name, BASELINE_YEAR);
    if (!records.hasReps(then)) return null;
    return record.popPerRep - then.popPerRep;
  }

  // So the pre-statehood case can say when a state does start, rather
  // than only that it does not start in 1920.
  function firstYearWithReps(stateName) {
    for (var i = 0; i < data.years.length; i++) {
      if (records.hasReps(records.recordFor(stateName, data.years[i]))) {
        return data.years[i];
      }
    }
    return null;
  }

  // How long the clusters take to settle between the two views: the
  // transform's own duration, plus the stagger carried by the last
  // cluster to start. Both halves come from the values that actually
  // drive the animation -- the duration from the --fan-duration token
  // the CSS transition reads, the stagger from the same expression
  // renderGrid writes -- so the note cannot drift out of step with the
  // fan it is waiting for.
  function fanDurationMs(record) {
    var declared = getComputedStyle(document.documentElement)
      .getPropertyValue('--fan-duration');
    var transform = parseFloat(declared) || 600;
    var stagger = Math.min(MAX_STAGGER_MS, STAGGER_BUDGET_MS / record.reps);
    return transform + stagger * (record.reps - 1);
  }

  // Composed from parts rather than one string, for the same reason the
  // headline is: the figure needs its own element to be bold.
  function renderGain(record, showingAll) {
    var host = document.getElementById('single-gain');
    if (!host) return;

    var cameFromFan = gainWasExpanded && !showingAll;
    gainWasExpanded = showingAll;

    host.textContent = '';

    var gain = gainSince(record);

    // Hidden in two cases that are not the same thing. Fanned out, the
    // grid shows every representative and a sentence about what ONE
    // carries does not describe it. Null gain means there is no 1920 row
    // to count from -- Alaska and Hawaii until 1960 -- and the answer
    // there is silence, not a sentence about the silence.
    host.hidden = showingAll || gain === null;
    if (host.hidden) {
      host.classList.remove('single-gain--arriving');
      return;
    }

    host.appendChild(document.createTextNode('This is '));
    var figure = document.createElement('strong');
    figure.textContent = commas(gain);
    host.appendChild(figure);
    host.appendChild(document.createTextNode(
      ' more people per representative than ' +
      (CURRENT_YEAR - BASELINE_YEAR) + ' years prior, in ' +
      BASELINE_YEAR + '.'
    ));

    // Only on the way back from the fan. A state change inside the single
    // view rebuilds the grid with transitions suppressed, so there is
    // nothing to wait for and holding the sentence back would just read
    // as lag.
    host.classList.remove('single-gain--arriving');
    if (!cameFromFan) {
      host.style.removeProperty('--gain-delay');
      return;
    }
    // Removing and re-adding in the same task does not restart an
    // animation; the layout read between them is what does.
    void host.offsetWidth;
    host.style.setProperty('--gain-delay', fanDurationMs(record) + 'ms');
    host.classList.add('single-gain--arriving');
  }

  function announceText(message) {
    var live = document.getElementById('live-region');
    if (live) live.textContent = message;
  }

  function announce(record) {
    announceText(headlineFor(record));
  }

  // Public entry point and the dropdown handler both route through the
  // store, so there is exactly one path by which the selection changes.
  // isExpanded is the reader's remembered preference and deliberately
  // survives a state change in both directions; what actually renders is
  // showsAllReps(), which keeps a one-representative state readable
  // without discarding the preference on the way through.
  function select(stateName) {
    records.recordFor(stateName, CURRENT_YEAR);  // throws RangeError if unknown
    // A redundant set does not notify, so re-select of the current state
    // has to draw itself.
    if (!store.setStateName(stateName)) render();
    announceCurrent();
  }

  function render() {
    var record = current();
    // The dropdown supplies the state name inside the headline sentence, so
    // it must move too or the sentence contradicts the numbers beside it.
    var control = document.getElementById('state-select');
    if (control && control.value !== record.name) control.value = record.name;
    renderHeadline(record);
    renderGrid(record);
  }

  function announceCurrent() {
    announce(current());
  }

  function setExpanded(flag) {
    isExpanded = Boolean(flag);
    var record = current();
    applyView(record);
    // The grid is role="img", so its changing label is not announced on
    // its own. Without this, toggling the view is silent.
    announceText(showsAllReps(record)
      ? 'Showing all ' + record.reps + ' ' + record.name + ' representatives.'
      : 'Showing one ' + record.name + ' representative.');
  }

  // Re-render at the current size. The stage height is an inline pixel
  // value and the dot tokens change at the 30rem breakpoint, so a resize,
  // an orientation change or a browser zoom all leave the old numbers
  // describing a layout that no longer exists.
  function relayout() {
    if (!document.getElementById('grid-stage')) return;
    renderGrid(current());
  }

  function expanded() {
    return isExpanded;
  }

  function current() {
    return recordFor(store.get().stateName);
  }

  function buildDropdown() {
    var control = document.getElementById('state-select');
    if (!control) return;
    data.stateNames.forEach(function (name) {
      var option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      control.appendChild(option);
    });
    control.value = store.get().stateName;
    control.addEventListener('change', function (event) {
      // Each section announces its own control, so a change made in
      // Section 2 does not speak Section 1's figures at the reader.
      if (store.setStateName(event.target.value)) announceCurrent();
    });
  }

  function renderKeySwatch() {
    var swatch = document.getElementById('key-swatch');
    if (!swatch) return;
    DotGrid.render(swatch, { clusters: 1, dotsPerCluster: 1, fraction: 0 });
  }

  function init() {
    renderKeySwatch();
    if (!document.getElementById('state-select')) return;
    buildDropdown();
    store.subscribe(function (snapshot) {
      // Section 1 is always 2020; a year change is Section 2's business,
      // and redrawing twelve times during playback would be waste.
      if (snapshot.changed === 'stateName') render();
    });
    render();
  }

  // Coalesced to one re-render per frame: a drag fires resize continuously
  // and each relayout rebuilds up to 4,000 elements.
  var resizePending = false;
  global.addEventListener('resize', function () {
    if (resizePending) return;
    resizePending = true;
    requestAnimationFrame(function () {
      resizePending = false;
      relayout();
    });
  });

  global.Apportionment.section1 = { init: init };

  // Kept for the existing test surface and for console use.
  global.Apportionment.app = {
    init: init,
    select: select,
    current: current,
    headlineFor: headlineFor,
    gridLabelFor: gridLabelFor,
    dotsFor: dotsFor,
    setExpanded: setExpanded,
    expanded: expanded,
    relayout: relayout
  };
})(window);
