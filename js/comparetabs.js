// A strip of tabs over a list of labelled ids. Driven entirely by the
// callbacks it is given, so it knows nothing about presets, the store, or
// which section it serves — the same bargain js/yearpicker.js makes.
(function (global) {
  'use strict';

  function create(root, options) {
    var settings = options || {};
    var tabs = settings.tabs;
    var getActive = settings.getActive;
    var setActive = settings.setActive;

    if (!root) throw new TypeError('CompareTabs needs a root element');
    if (!tabs || !tabs.length) throw new TypeError('CompareTabs needs tabs');

    root.setAttribute('role', 'tablist');

    // Built once and reused. Rebuilding on every render would throw away
    // the reader's focus and silence the aria-selected change — the bug
    // js/section1.js:renderToggle carries a comment about.
    var buttons = tabs.map(function (tab) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'comparetabs__tab';
      button.id = 'comparetab-' + tab.id;
      button.setAttribute('role', 'tab');
      button.setAttribute('data-tab', tab.id);
      button.textContent = tab.label;
      button.addEventListener('click', function () { setActive(tab.id); });
      root.appendChild(button);
      return button;
    });

    function indexOf(id) {
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].id === id) return i;
      }
      return 0;
    }

    function render() {
      var active = indexOf(getActive());
      for (var i = 0; i < buttons.length; i++) {
        var on = i === active;
        buttons[i].setAttribute('aria-selected', String(on));
        // Roving tabindex: the strip is one stop in the page's tab order,
        // and the arrow keys move within it.
        buttons[i].tabIndex = on ? 0 : -1;
      }
    }

    // Holds at the ends rather than wrapping, the same rule
    // YearPicker.stepBy follows: pressing once too often should not throw
    // the reader across the strip.
    function moveTo(index) {
      if (index < 0 || index >= tabs.length) return;
      setActive(tabs[index].id);
      buttons[index].focus();
    }

    root.addEventListener('keydown', function (event) {
      var from = indexOf(getActive());
      if (event.key === 'ArrowRight') moveTo(from + 1);
      else if (event.key === 'ArrowLeft') moveTo(from - 1);
      else if (event.key === 'Home') moveTo(0);
      else if (event.key === 'End') moveTo(tabs.length - 1);
      else return;
      event.preventDefault();
    });

    return {
      render: render,
      // So a panel can name the tab that labels it.
      activeId: function () { return tabs[indexOf(getActive())].id; }
    };
  }

  global.Apportionment = global.Apportionment || {};
  global.Apportionment.CompareTabs = { create: create };
})(window);
