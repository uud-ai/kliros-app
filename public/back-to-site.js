// Кнопка «‹ Назад на сайт», если сюда пришли со страницы того же сайта.
// Отдельный файл, а не встроенный скрипт, — чтобы Content-Security-Policy
// могла запретить любые встроенные скрипты.
(function () {
  var ref;
  try { ref = new URL(document.referrer); } catch (e) { return; }
  if (ref.origin !== location.origin || ref.href === location.href) return;
  var bar = document.createElement("a");
  bar.href = ref.href;
  bar.textContent = "‹ Назад на сайт";
  bar.style.cssText = "display:block;padding:10px 20px;" +
    "font:500 0.95rem var(--font-ui,Bitter,system-ui,sans-serif);" +
    "color:var(--red,#9c1c1c);background:var(--bg-panel,#fbf7ec);" +
    "border-bottom:1px solid var(--rule,#d9cfb8);text-decoration:none;";
  document.body.insertBefore(bar, document.body.firstChild);
})();
