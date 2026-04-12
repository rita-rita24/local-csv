/**
 * LocalCSV Landing Page — Main Script
 */

/* ---- Helper: non-null DOM query ---- */
const $ = <T extends HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  return el;
};

/* ---- Download LocalCSV.html ---- */
// ページ読み込み時に事前取得し、未準備ならクリック時に取得完了を待つ。
// これにより、読み込み直後のクリックでも遷移ではなくダウンロードを優先する。
const EDITOR_FILE_PATH = "LocalCSV.html";
const DOWNLOAD_FILE_NAME = "localcsv.html";

let editorBlobUrl: string | null = null;
let editorBlobLoadPromise: Promise<string | null> | null = null;
const canPrefetchEditor = window.location.protocol !== "file:";

const triggerDownload = (href: string, fileName: string): void => {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

const loadEditorBlobUrl = (): Promise<string | null> => {
  if (!canPrefetchEditor) return Promise.resolve(null);
  if (editorBlobUrl) return Promise.resolve(editorBlobUrl);
  if (editorBlobLoadPromise) return editorBlobLoadPromise;

  editorBlobLoadPromise = fetch(EDITOR_FILE_PATH)
    .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`${res.status}`))))
    .then((html) => {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      editorBlobUrl = URL.createObjectURL(blob);
      return editorBlobUrl;
    })
    .catch(() => null)
    .finally(() => {
      editorBlobLoadPromise = null;
    });

  return editorBlobLoadPromise;
};

const downloadEditorHtml = async (): Promise<void> => {
  const blobUrl = await loadEditorBlobUrl();
  triggerDownload(blobUrl ?? EDITOR_FILE_PATH, DOWNLOAD_FILE_NAME);
};

if (canPrefetchEditor) {
  void loadEditorBlobUrl();
}

/* ---- NavBar: Download / Use Now ---- */
const downloadBtn = $<HTMLButtonElement>("#downloadBtn");
const useNowBtn = $<HTMLButtonElement>("#useNowBtn");

downloadBtn.addEventListener("click", () => {
  void downloadEditorHtml();
});

useNowBtn.addEventListener("click", () => {
  window.location.href = "LocalCSV.html";
});

/* ---- Hero: Use Now on Web / Download HTML ---- */
const heroUseNowBtn = $<HTMLButtonElement>("#heroUseNowBtn");
const heroDownloadBtn = $<HTMLButtonElement>("#heroDownloadBtn");

heroUseNowBtn.addEventListener("click", () => {
  window.location.href = "LocalCSV.html";
});

heroDownloadBtn.addEventListener("click", () => {
  void downloadEditorHtml();
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
