// Applies the saved light/dark theme before the page paints (kept out of the HTML for the Content Security Policy).
try {
  var t = localStorage.getItem('theme');
  if (!t) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
} catch (e) { /* storage blocked */ }
