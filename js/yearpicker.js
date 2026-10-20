// Chevrons and a slider over a list of years. Driven entirely by the
// callbacks it is given, so it knows nothing about which section it
// serves or where the year it shows is stored.
(function (global) {
  'use strict';

  function create(root, options) {
    var settings = options || {};
    var years = settings.years;
    var getYear = settings.getYear;
    var setYear = settings.setYear;

    if (!root) throw new TypeError('YearPicker needs a root element');
    if (!years || !years.length) throw new TypeError('YearPicker needs years');

    // Data attributes, not ids: a page can hold more than one of these,
    // and the sections keep their own ids for their own purposes.
    var prev = root.querySelector('[data-yearpicker="prev"]');
    var next = root.querySelector('[data-yearpicker="next"]');
    var slider = root.querySelector('[data-yearpicker="slider"]');

    function indexOf(year) {
      return years.indexOf(year);
    }

    // Holds at the ends rather than wrapping: a reader clicking once too
    // often should not be teleported across a century.
    function stepBy(offset) {
      var target = indexOf(getYear()) + offset;
      if (target < 0 || target >= years.length) return;
      setYear(years[target]);
    }

    function render() {
      var index = indexOf(getYear());
      if (slider) {
        var value = String(index);
        if (slider.value !== value) slider.value = value;
        // Without this a screen reader reads the index: "7 of 11".
        slider.setAttribute('aria-valuetext', String(getYear()));
      }
      if (prev) prev.disabled = index <= 0;
      if (next) next.disabled = index >= years.length - 1;
    }

    if (prev) prev.addEventListener('click', function () { stepBy(-1); });
    if (next) next.addEventListener('click', function () { stepBy(1); });
    if (slider) {
      slider.addEventListener('input', function (event) {
        setYear(years[Number(event.target.value)]);
      });
    }

    return { render: render };
  }

  global.Apportionment = global.Apportionment || {};
  global.Apportionment.YearPicker = { create: create };
})(window);
