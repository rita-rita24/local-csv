(function () {
  "use strict";

  /* ---- Mobile nav toggle ---- */
  var navToggle = document.getElementById("navToggle");
  var nav = document.getElementById("nav");
  navToggle.addEventListener("click", function () {
    nav.classList.toggle("is-open");
  });
  nav.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      nav.classList.remove("is-open");
    });
  });

  /* ---- Download editor.html ---- */
  document.getElementById("downloadBtn").addEventListener("click", function (e) {
    e.preventDefault();
    fetch("editor.html")
      .then(function (res) { return res.text(); })
      .then(function (html) {
        var blob = new Blob([html], { type: "text/html;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "artcsv.html";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
  });

  /* ---- Scroll fade-in observer ---- */
  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
        }
      });
    },
    { threshold: 0.1 }
  );

  document.querySelectorAll(".fade-in").forEach(function (el) {
    observer.observe(el);
  });
})();
