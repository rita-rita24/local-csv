"use strict";
/**
 * ArtCSV Landing Page — Main Script
 */
/* ---- Helper: non-null DOM query ---- */
const $ = (selector) => {
    const el = document.querySelector(selector);
    if (!el)
        throw new Error(`Element not found: ${selector}`);
    return el;
};
/* ---- Download editor.html ---- */
const downloadFile = (url, fileName) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
};
/* ---- NavBar: Download / Use Now ---- */
const downloadBtn = $("#downloadBtn");
const useNowBtn = $("#useNowBtn");
downloadBtn.addEventListener("click", () => {
    downloadFile("editor.html", "artcsv.html");
});
useNowBtn.addEventListener("click", () => {
    window.location.href = "editor.html";
});
/* ---- Hero: Use Now on Web / Download HTML ---- */
const heroUseNowBtn = $("#heroUseNowBtn");
const heroDownloadBtn = $("#heroDownloadBtn");
heroUseNowBtn.addEventListener("click", () => {
    window.location.href = "editor.html";
});
heroDownloadBtn.addEventListener("click", () => {
    downloadFile("editor.html", "artcsv.html");
});
/* ---- Scroll fade-in observer ---- */
const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
        if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
        }
    }
}, { threshold: 0.1 });
for (const el of document.querySelectorAll(".fade-in")) {
    observer.observe(el);
}
//# sourceMappingURL=main.js.map