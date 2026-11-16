// Apply the stored theme before first paint to avoid a flash.
try {
  var t = localStorage.getItem('sapia.theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {}
