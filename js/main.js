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
// ページ読み込み時に事前取得し、Blob URL を準備しておく
let editorBlobUrl = null;
fetch("editor.html")
    .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`${res.status}`))))
    .then((html) => {
    const blob = new Blob([html], { type: "application/octet-stream" });
    editorBlobUrl = URL.createObjectURL(blob);
})
    .catch(() => { });
// クリック時は同期処理のみ（ユーザージェスチャーを維持）
const downloadFile = (fileName) => {
    const anchor = document.createElement("a");
    if (editorBlobUrl) {
        anchor.href = editorBlobUrl;
    }
    else {
        anchor.href = "editor.html";
    }
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
};
/* ---- NavBar: Download / Use Now ---- */
const downloadBtn = $("#downloadBtn");
const useNowBtn = $("#useNowBtn");
downloadBtn.addEventListener("click", () => {
    downloadFile("artcsv.html");
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
    downloadFile("artcsv.html");
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
