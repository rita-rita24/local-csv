/**
 * ArtCSV Landing Page — Main Script
 */

/* ---- Helper: non-null DOM query ---- */
const $ = <T extends HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  return el;
};

/* ---- Mobile nav toggle ---- */
const navToggle = $<HTMLButtonElement>("#navToggle");
const nav = $<HTMLElement>("#nav");

navToggle.addEventListener("click", () => {
  nav.classList.toggle("is-open");
});

for (const link of nav.querySelectorAll("a")) {
  link.addEventListener("click", () => {
    nav.classList.remove("is-open");
  });
}

/* ---- Download editor.html ---- */
const downloadBtn = $<HTMLAnchorElement>("#downloadBtn");

const downloadFile = async (url: string, fileName: string): Promise<void> => {
  const res = await fetch(url);
  const html = await res.text();
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
};

downloadBtn.addEventListener("click", (e: Event) => {
  e.preventDefault();
  downloadFile("editor.html", "artcsv.html");
});

/* ---- Scroll fade-in observer ---- */
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
      }
    }
  },
  { threshold: 0.1 },
);

for (const el of document.querySelectorAll<HTMLElement>(".fade-in")) {
  observer.observe(el);
}
