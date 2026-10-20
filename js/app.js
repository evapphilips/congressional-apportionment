// Bootstrap. Each section owns its own wiring; this only starts them.
(function (global) {
  'use strict';

  function init() {
    global.Apportionment.section1.init();
    if (global.Apportionment.section2) global.Apportionment.section2.init();
    if (global.Apportionment.section4) global.Apportionment.section4.init();
  }

  // A pinned section never unsticks — it just gets painted over by the
  // next card. So Shift-Tab backwards can land on a control that is fully
  // covered and, with the house no-focus-ring rule, invisible with no
  // indicator anywhere on screen. Scroll its section back into view.
  document.addEventListener('focusin', function (event) {
    var section = event.target.closest && event.target.closest('.section');
    if (!section) return;
    var box = event.target.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) return;
    var onTop = document.elementFromPoint(
      box.left + box.width / 2, box.top + box.height / 2);
    // If something else paints at the control's own centre, it is buried.
    if (onTop && (onTop === event.target || event.target.contains(onTop))) return;
    section.scrollIntoView({ block: 'start' });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
