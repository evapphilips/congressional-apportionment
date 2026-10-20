// Text formatting. No knowledge of the dataset.
(function (global) {
  'use strict';

  function commas(value) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function plural(count, noun) {
    return count === 1 ? noun : noun + 's';
  }

  global.Apportionment = global.Apportionment || {};
  global.Apportionment.format = { commas: commas, plural: plural };
})(window);
