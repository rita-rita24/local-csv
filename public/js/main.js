"use strict";
/**
 * LocalCSV Landing Page — Main Script
 */
/* ---- Helper: non-null DOM query ---- */
const $ = (selector) => {
    const el = document.querySelector(selector);
    if (!el)
        throw new Error(`Element not found: ${selector}`);
    return el;
};
/* ---- Download LocalCSV_pro.html ---- */
// ページ読み込み時に事前取得し Blob URL を準備する。
// クリック時に同期的に使うことでユーザージェスチャーを維持し、
// download 属性が確実に尊重されるようにする。
let editorBlobUrl = null;
fetch("LocalCSV_pro.html")
    .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`${res.status}`))))
    .then((html) => {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    editorBlobUrl = URL.createObjectURL(blob);
})
    .catch(() => { });
const triggerDownload = (href, fileName) => {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
};
/* ---- NavBar: Download / Use Now ---- */
const downloadBtn = $("#downloadBtn");
const useNowBtn = $("#useNowBtn");
downloadBtn.addEventListener("click", () => {
    triggerDownload(editorBlobUrl ?? "LocalCSV_pro.html", "localcsv.html");
});
useNowBtn.addEventListener("click", () => {
    window.location.href = "LocalCSV_pro.html";
});
/* ---- Hero: Use Now on Web / Download HTML ---- */
const heroUseNowBtn = $("#heroUseNowBtn");
const heroDownloadBtn = $("#heroDownloadBtn");
heroUseNowBtn.addEventListener("click", () => {
    window.location.href = "LocalCSV_pro.html";
});
heroDownloadBtn.addEventListener("click", () => {
    triggerDownload(editorBlobUrl ?? "LocalCSV_pro.html", "localcsv.html");
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