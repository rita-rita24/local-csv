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
const downloadFile = async (url, fileName) => {
    // HTTP/HTTPS の場合: fetch + Blob でダウンロード
    if (location.protocol.startsWith("http")) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Download failed: ${res.status}`);
        const html = await res.text();
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
        return;
    }
    // file:// の場合: <a download> を試行
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