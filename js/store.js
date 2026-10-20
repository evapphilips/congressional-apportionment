// The one place the selected state and year live. Sections subscribe;
// they never call each other.
(function (global) {
  'use strict';

  var listeners = [];
  // 1920, not 1910: the House was fixed at 435 that year, so it is the
  // year every later figure on this page is a consequence of. 1910 is one
  // step back for a reader who wants the before.
  var current = { stateName: 'New York', year: 1920 };

  // Section 4 owns its four comparison values outright. It used to mirror
  // the state selected above until the reader touched a control; that is
  // gone, because a prepared comparison that changes with a dropdown three
  // screens up is not prepared.
  //
  // A bootstrap pair, not editorial: section4 registers the real presets at
  // init and the first of them overwrites these. They exist so that a
  // get() before registration returns a usable pair rather than nulls.
  var compare = {
    a: 'Delaware', yearA: 2020,
    b: 'Montana',  yearB: 2020,
    preset: 'widest'
  };

  // Values only — { id, a: {state, year}, b: {state, year} }. The store
  // knows what a preset IS and never what it MEANS; the labels and the
  // copy stay in section4.js. Entries without values (the Custom tab)
  // are filtered out by the caller.
  var presets = [];

  // Custom borrows the preset a reader arrives from, but only until they
  // express a preference of their own. After that it is theirs and no
  // preset overwrites it.
  //
  // This is NOT the mirroring that was removed. Mirroring followed a
  // control in another section, so a comparison could change meaning while
  // nobody was looking. This only ever carries a pair the reader saw on
  // screen a moment earlier, and stops the first time they touch a control.
  var customTouched = false;
  var ownCustom = null;

  function presetById(id) {
    for (var i = 0; i < presets.length; i++) {
      if (presets[i].id === id) return presets[i];
    }
    return null;
  }

  function registerComparePresets(list) {
    presets = list || [];
    // Registering is configuring the section from scratch, so a custom pair
    // remembered against the OLD list is stale and goes with it. In
    // production this runs once at init and there is nothing to clear; it
    // is also the only honest way to exercise the untouched branch twice.
    customTouched = false;
    ownCustom = null;
    if (!presets.length) return false;
    // The opening pair is the first preset's, so the tab the page opens on
    // and the values it opens with cannot disagree.
    var first = presets[0];
    compare.preset = first.id;
    compare.a = first.a.state;
    compare.yearA = first.a.year;
    compare.b = first.b.state;
    compare.yearB = first.b.year;
    return true;
  }

  function get() {
    return {
      stateName: current.stateName,
      year: current.year,
      compareA: compare.a,
      compareYearA: compare.yearA,
      compareB: compare.b,
      compareYearB: compare.yearB,
      comparePreset: compare.preset,
      customTouched: customTouched
    };
  }

  function notify(changed) {
    var snapshot = get();
    snapshot.changed = changed;
    // Copy first: a subscriber may unsubscribe during the loop.
    var targets = listeners.slice();
    for (var i = 0; i < targets.length; i++) targets[i](snapshot);
  }

  // Returning early on a redundant set is what makes two-way binding safe.
  // Without it, a dropdown echoing its own change back would loop forever,
  // and the usual fix — a suppression flag per direction — is a bug farm.
  function setStateName(name) {
    if (name === current.stateName) return false;
    current.stateName = name;
    notify('stateName');
    return true;
  }

  function setYear(year) {
    if (year === current.year) return false;
    current.year = year;
    notify('year');
    return true;
  }

  // Every edit made while Custom is active is the reader's own, and is
  // remembered against their next visit.
  function rememberCustom() {
    if (compare.preset !== 'custom') return;
    customTouched = true;
    ownCustom = {
      a: compare.a, yearA: compare.yearA,
      b: compare.b, yearB: compare.yearB
    };
  }

  function setComparePreset(id) {
    var changed = id !== compare.preset;
    compare.preset = id;

    if (id === 'custom') {
      // Untouched, the four values are left exactly as the preset being
      // left set them — that IS the inheritance. Touched, the reader's own
      // pair comes back.
      if (customTouched && ownCustom) {
        changed = changed ||
          ownCustom.a !== compare.a || ownCustom.yearA !== compare.yearA ||
          ownCustom.b !== compare.b || ownCustom.yearB !== compare.yearB;
        compare.a = ownCustom.a;
        compare.yearA = ownCustom.yearA;
        compare.b = ownCustom.b;
        compare.yearB = ownCustom.yearB;
      }
    } else {
      var preset = presetById(id);
      if (!preset) return false;
      changed = changed ||
        preset.a.state !== compare.a || preset.a.year !== compare.yearA ||
        preset.b.state !== compare.b || preset.b.year !== compare.yearB;
      compare.a = preset.a.state;
      compare.yearA = preset.a.year;
      compare.b = preset.b.state;
      compare.yearB = preset.b.year;
    }

    if (!changed) return false;
    notify('comparePreset');
    return true;
  }

  function setCompareA(name) {
    if (name === compare.a) return false;
    compare.a = name;
    rememberCustom();
    notify('compareA');
    return true;
  }

  function setCompareB(name) {
    if (name === compare.b) return false;
    compare.b = name;
    rememberCustom();
    notify('compareB');
    return true;
  }

  function setCompareYearA(year) {
    if (year === compare.yearA) return false;
    compare.yearA = year;
    rememberCustom();
    notify('compareYearA');
    return true;
  }

  function setCompareYearB(year) {
    if (year === compare.yearB) return false;
    compare.yearB = year;
    rememberCustom();
    notify('compareYearB');
    return true;
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function unsubscribe() {
      var i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    };
  }

  global.Apportionment = global.Apportionment || {};
  global.Apportionment.store = {
    get: get,
    setStateName: setStateName,
    setYear: setYear,
    registerComparePresets: registerComparePresets,
    setComparePreset: setComparePreset,
    setCompareA: setCompareA,
    setCompareB: setCompareB,
    setCompareYearA: setCompareYearA,
    setCompareYearB: setCompareYearB,
    subscribe: subscribe
  };
})(window);
