// Dataset lookup and dot arithmetic. The one place that knows a record's
// shape, so both sections agree about what a year means.
(function (global) {
  'use strict';

  var data = global.Apportionment.data;
  var DotGrid = global.Apportionment.DotGrid;

  function recordFor(stateName, year) {
    var rows = data.states[stateName];
    if (!rows) throw new RangeError('unknown state: ' + stateName);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].year === year) {
        return {
          name: stateName,
          year: rows[i].year,
          reps: rows[i].reps,
          popPerRep: rows[i].popPerRep,
          population: rows[i].population
        };
      }
    }
    throw new RangeError('no ' + year + ' row for ' + stateName);
  }

  // The 12 pre-statehood rows carry a null rather than a zero: the state
  // did not exist, which is not the same as having no one to represent.
  function hasReps(record) {
    return typeof record.reps === 'number' && typeof record.popPerRep === 'number';
  }

  function dotsFor(record) {
    if (typeof record.popPerRep !== 'number') {
      // null / 10000 === 0 in JS. Without this guard a pre-statehood row
      // silently renders as an empty grid, which reads as a measurement.
      throw new TypeError(
        'no popPerRep for ' + record.name + ' ' + record.year +
        ' — check hasReps() before asking for dots'
      );
    }
    return DotGrid.split(record.popPerRep / data.peoplePerDot);
  }

  function elementsFor(record) {
    var dots = dotsFor(record);
    return dots.whole + (dots.fraction > 0 ? 1 : 0);
  }

  // Sized to the busiest year, not the last one: Mississippi, Montana and
  // Oregon all peak in 2010 and fall by 2020.
  function capacityFor(stateName) {
    var rows = data.states[stateName];
    if (!rows) throw new RangeError('unknown state: ' + stateName);
    var most = 0;
    for (var i = 0; i < rows.length; i++) {
      var record = recordFor(stateName, rows[i].year);
      if (!hasReps(record)) continue;
      var count = elementsFor(record);
      if (count > most) most = count;
    }
    return most;
  }

  global.Apportionment.records = {
    recordFor: recordFor,
    hasReps: hasReps,
    dotsFor: dotsFor,
    elementsFor: elementsFor,
    capacityFor: capacityFor
  };
})(window);
