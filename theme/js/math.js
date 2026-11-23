/* Loads KaTeX from a CDN (with SRI) only on pages that contain math. */
(function () {
'use strict';
var els = document.querySelectorAll('.math');
if (!els.length) return;
var base = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/';
var css = document.createElement('link');
css.rel = 'stylesheet';
css.href = base + 'katex.min.css';
css.integrity = 'sha384-nB0miv6/jRmo5UMMR1wu3Gz6NLsoTkbqJghGIsx//Rlm+ZU03BU6SQNC66uf4l5+';
css.crossOrigin = 'anonymous';
document.head.appendChild(css);
var js = document.createElement('script');
js.src = base + 'katex.min.js';
js.integrity = 'sha384-7zkQWkzuo3B5mTepMUcHkMB5jZaolc2xDwL6VFqjFALcbeS9Ggm/Yr2r3Dy4lfFg';
js.crossOrigin = 'anonymous';
js.onload = function () {
  Array.prototype.forEach.call(els, function (el) {
    try {
      window.katex.render(el.textContent, el, { displayMode: el.classList.contains('math-display'), throwOnError: false });
    } catch (e) { /* leave the TeX source visible */ }
  });
};
document.head.appendChild(js);
})();
