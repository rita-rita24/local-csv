"use strict";
/**
 * LocalCSV LP Redesign — Main Script
 */

/* ---- DOM Helpers (AGENTS.md) ---- */
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---- Download LocalCSV.html ---- */
const EDITOR_FILE_PATH = "LocalCSV.html";
const DOWNLOAD_FILE_NAME = "localcsv.html";

let _editorBlobUrl = null;
let _editorBlobLoadPromise = null;
const CAN_PREFETCH_EDITOR = window.location.protocol !== "file:";

const _triggerDownload = (href, fileName) => {
  const $anchor = document.createElement("a");
  $anchor.href = href;
  $anchor.download = fileName;
  document.body.appendChild($anchor);
  $anchor.click();
  $anchor.remove();
};

const _loadEditorBlobUrl = () => {
  if (!CAN_PREFETCH_EDITOR) return Promise.resolve(null);
  if (_editorBlobUrl) return Promise.resolve(_editorBlobUrl);
  if (_editorBlobLoadPromise) return _editorBlobLoadPromise;

  _editorBlobLoadPromise = fetch(EDITOR_FILE_PATH)
    .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`${res.status}`))))
    .then((html) => {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      _editorBlobUrl = URL.createObjectURL(blob);
      return _editorBlobUrl;
    })
    .catch(() => null)
    .finally(() => {
      _editorBlobLoadPromise = null;
    });

  return _editorBlobLoadPromise;
};

if (CAN_PREFETCH_EDITOR) {
  void _loadEditorBlobUrl();
}

document.addEventListener("click", async (event) => {
  const $downloadTrigger =
    event.target instanceof Element
      ? event.target.closest("[data-download-editor]")
      : null;

  if (!$downloadTrigger) return;

  event.preventDefault();
  const blobUrl = await _loadEditorBlobUrl();
  _triggerDownload(blobUrl ?? EDITOR_FILE_PATH, DOWNLOAD_FILE_NAME);
});

/* ---- Mobile Nav Toggle ---- */
const $navToggle = qs("#navToggle");
const $navLinks = qs("#navLinks");

$navToggle.addEventListener("click", () => {
  $navLinks.classList.toggle("is-open");
  const $icon = qs(".material-symbols-outlined", $navToggle);
  $icon.textContent = $navLinks.classList.contains("is-open") ? "close" : "menu";
});

/* Close mobile nav on link click */
qsa(".glass-nav-link").forEach(($link) => {
  $link.addEventListener("click", () => {
    $navLinks.classList.remove("is-open");
    const $icon = qs(".material-symbols-outlined", $navToggle);
    $icon.textContent = "menu";
  });
});

/* ---- Scroll Fade-In Observer ---- */
const _observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
      }
    }
  },
  { threshold: 0.1 }
);

qsa(".fade-in").forEach((el) => _observer.observe(el));

/* ---- Nav scroll effect (add bg on scroll) ---- */
const $nav = qs("#glass-nav");
const NAV_SCROLL_THRESHOLD = 60;

const _handleNavScroll = () => {
  if (window.scrollY > NAV_SCROLL_THRESHOLD) {
    $nav.style.background = "oklch(1 0 0 / 0.7)";
  } else {
    $nav.style.background = "";
  }
};

window.addEventListener("scroll", _handleNavScroll, { passive: true });
