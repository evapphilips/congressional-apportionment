// Draws grids of dots. Deliberately knows nothing about states, years, or
// apportionment, so Sections 2 and 3 can reuse it unchanged.
(function (global) {
  'use strict';

  var COLUMNS = 10;

  function split(dotValue) {
    if (typeof dotValue !== 'number' || !isFinite(dotValue) || dotValue < 0) {
      throw new RangeError('dotValue must be a finite number >= 0, got ' + dotValue);
    }
    var whole = Math.floor(dotValue);
    return { whole: whole, fraction: dotValue - whole };
  }

  function buildCluster(index, dotsPerCluster, fraction) {
    var cluster = document.createElement('div');
    cluster.className = 'cluster';
    // Consumed by CSS as a transition-delay multiplier when clusters fan out.
    cluster.style.setProperty('--i', String(index));

    for (var i = 0; i < dotsPerCluster; i++) {
      var dot = document.createElement('span');
      dot.className = 'dot';
      cluster.appendChild(dot);
    }

    if (fraction > 0) {
      var partial = document.createElement('span');
      partial.className = 'dot dot--partial';
      // A literal fraction of a dot, drawn as a pie fill rather than a
      // faded one — a faded dot reads as uncertainty, not as a remainder.
      partial.style.setProperty('--fill', (fraction * 100).toFixed(2) + '%');
      cluster.appendChild(partial);
    }

    return cluster;
  }

  function render(container, options) {
    var settings = options || {};
    var clusters = settings.clusters;
    var dotsPerCluster = settings.dotsPerCluster;
    var fraction = settings.fraction || 0;

    if (!(clusters >= 1)) {
      throw new RangeError('clusters must be >= 1, got ' + clusters);
    }
    if (!(dotsPerCluster >= 0)) {
      throw new RangeError('dotsPerCluster must be >= 0, got ' + dotsPerCluster);
    }
    if (!(fraction >= 0 && fraction < 1)) {
      throw new RangeError('fraction must be in [0, 1), got ' + fraction);
    }

    container.textContent = '';
    var fragment = document.createDocumentFragment();
    for (var i = 0; i < clusters; i++) {
      fragment.appendChild(buildCluster(i, dotsPerCluster, fraction));
    }
    container.appendChild(fragment);
    return container;
  }

  // A second mode, for grids whose value changes over time. The dots are
  // drawn once at the capacity the caller asks for; changing the value
  // afterwards only toggles classes, so dots can arrive and leave without
  // any node being created or destroyed.
  function renderCapacity(container, options) {
    var dots = (options || {}).dots;
    if (!(dots >= 1)) {
      throw new RangeError('dots must be >= 1, got ' + dots);
    }
    container.textContent = '';
    var cluster = document.createElement('div');
    cluster.className = 'cluster';
    cluster.style.setProperty('--i', '0');
    for (var i = 0; i < dots; i++) {
      var dot = document.createElement('span');
      dot.className = 'dot';
      // Index drives the stagger, so a row fills left to right.
      dot.style.setProperty('--i', String(i));
      cluster.appendChild(dot);
    }
    container.appendChild(cluster);
    return container;
  }

  function setShowing(container, options) {
    var settings = options || {};
    var whole = settings.whole;
    var fraction = settings.fraction || 0;
    var dots = container.querySelectorAll('.dot');

    if (!(whole >= 0)) {
      throw new RangeError('whole must be >= 0, got ' + whole);
    }
    if (!(fraction >= 0 && fraction < 1)) {
      throw new RangeError('fraction must be in [0, 1), got ' + fraction);
    }
    var needed = whole + (fraction > 0 ? 1 : 0);
    if (needed > dots.length) {
      throw new RangeError(
        'need ' + needed + ' dots but only ' + dots.length + ' were rendered'
      );
    }

    for (var i = 0; i < dots.length; i++) {
      var dot = dots[i];
      if (i < whole) {
        dot.classList.add('dot--on');
        dot.classList.remove('dot--partial');
        dot.style.removeProperty('--fill');
      } else if (i === whole && fraction > 0) {
        dot.classList.add('dot--on');
        dot.classList.add('dot--partial');
        dot.style.setProperty('--fill', (fraction * 100).toFixed(2) + '%');
      } else {
        dot.classList.remove('dot--on');
        dot.classList.remove('dot--partial');
        dot.style.removeProperty('--fill');
      }
    }
    return container;
  }

  // Ten rows is the dataset-wide ceiling, so this is the tallest a grid
  // can ever be — which is what callers reserve so the page never jumps.
  function stageHeight(scale) {
    var styles = getComputedStyle(document.documentElement);
    var dot = parseFloat(styles.getPropertyValue('--dot-size'));
    var gap = parseFloat(styles.getPropertyValue('--dot-gap'));
    return (COLUMNS * dot + (COLUMNS - 1) * gap) * (scale || 1);
  }

  global.Apportionment = global.Apportionment || {};
  global.Apportionment.DotGrid = {
    COLUMNS: COLUMNS,
    split: split,
    render: render,
    renderCapacity: renderCapacity,
    setShowing: setShowing,
    stageHeight: stageHeight
  };
})(window);
