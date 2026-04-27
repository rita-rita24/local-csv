/**
 * LocalCSV LP Redesign — Main Script
 */

/* ---- DOM Helpers (AGENTS.md) ---- */
const qs = (sel: string, root: ParentNode = document): Element | null => root.querySelector(sel);
const qsa = (sel: string, root: ParentNode = document): Element[] => [...root.querySelectorAll(sel)];

/* ---- Download / Copy LocalCSV.html ---- */
const EDITOR_FILE_PATH = "LocalCSV.html";
const DOWNLOAD_FILE_NAME = "localcsv.html";
const COPY_TOAST_MS = 1800;
const COPY_TOAST_REMOVE_DELAY_MS = 280;
const LP_TOAST_VIEWPORT_ID = "lpToastViewport";
const EMBEDDED_EDITOR_BASE64_ID = "editor-html-base64";
const IS_FILE_PROTOCOL = window.location.protocol === "file:";

let _editorBlobUrl: string | null = null;
let _editorBlobLoadPromise: Promise<string | null> | null = null;
let _editorHtmlText: string | null = null;
let _editorHtmlLoadPromise: Promise<string | null> | null = null;

const _triggerDownload = (href: string, fileName: string): void => {
  const $anchor = document.createElement("a");
  $anchor.href = href;
  $anchor.download = fileName;
  document.body.appendChild($anchor);
  $anchor.click();
  $anchor.remove();
};

const _decodeBase64Utf8 = (base64: string): string | null => {
  try {
    const binary = window.atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return null;
  }
};

const _loadEmbeddedEditorHtmlText = (): string | null => {
  const $embedded = qs(`#${EMBEDDED_EDITOR_BASE64_ID}`);
  if (!($embedded instanceof HTMLScriptElement)) return null;

  const base64 = ($embedded.textContent ?? "").replace(/\s+/g, "");
  if (!base64) return null;

  return _decodeBase64Utf8(base64);
};

const _loadEditorHtmlText = (): Promise<string | null> => {
  if (_editorHtmlText !== null) return Promise.resolve(_editorHtmlText);
  if (IS_FILE_PROTOCOL) {
    const embeddedHtml = _loadEmbeddedEditorHtmlText();
    if (embeddedHtml !== null) {
      _editorHtmlText = embeddedHtml;
      return Promise.resolve(embeddedHtml);
    }
    return Promise.resolve(null);
  }

  if (_editorHtmlLoadPromise) return _editorHtmlLoadPromise;

  _editorHtmlLoadPromise = fetch(EDITOR_FILE_PATH)
    .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`${res.status}`))))
    .then((html) => {
      _editorHtmlText = html;
      return html;
    })
    .catch(() => {
      const embeddedHtml = _loadEmbeddedEditorHtmlText();
      if (embeddedHtml !== null) {
        _editorHtmlText = embeddedHtml;
        return embeddedHtml;
      }
      return null;
    })
    .finally(() => {
      _editorHtmlLoadPromise = null;
    });

  return _editorHtmlLoadPromise;
};

const _loadEditorBlobUrl = (): Promise<string | null> => {
  if (_editorBlobUrl) return Promise.resolve(_editorBlobUrl);
  if (_editorBlobLoadPromise) return _editorBlobLoadPromise;

  _editorBlobLoadPromise = _loadEditorHtmlText()
    .then((html) => {
      if (!html) return null;
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      _editorBlobUrl = URL.createObjectURL(blob);
      return _editorBlobUrl;
    })
    .finally(() => {
      _editorBlobLoadPromise = null;
    });

  return _editorBlobLoadPromise;
};

const _copyText = async (text: string): Promise<boolean> => {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back to legacy copy method
    }
  }

  try {
    const $textarea = document.createElement("textarea");
    $textarea.value = text;
    $textarea.setAttribute("readonly", "");
    $textarea.style.position = "fixed";
    $textarea.style.inset = "-1000px";
    document.body.appendChild($textarea);
    $textarea.focus();
    $textarea.select();
    const copied = document.execCommand("copy");
    $textarea.remove();
    return copied;
  } catch {
    return false;
  }
};

const _getLpToastViewport = (): HTMLElement => {
  const $existing = qs(`#${LP_TOAST_VIEWPORT_ID}`);
  if ($existing instanceof HTMLElement) return $existing;

  const $viewport = document.createElement("div");
  $viewport.id = LP_TOAST_VIEWPORT_ID;
  $viewport.className = "lp-toast-viewport";
  document.body.appendChild($viewport);
  return $viewport;
};

const _showCopyToast = (message: string, tone: "success" | "error"): void => {
  const $viewport = _getLpToastViewport();
  const $toast = document.createElement("div");
  $toast.className = `lp-toast lp-toast--${tone}`;
  $toast.textContent = message;
  $toast.setAttribute("aria-atomic", "true");

  if (tone === "error") {
    $toast.setAttribute("role", "alert");
    $toast.setAttribute("aria-live", "assertive");
  } else {
    $toast.setAttribute("role", "status");
    $toast.setAttribute("aria-live", "polite");
  }

  $viewport.appendChild($toast);

  window.requestAnimationFrame(() => {
    if ($toast.isConnected) $toast.classList.add("is-visible");
  });

  window.setTimeout(() => {
    if (!$toast.isConnected) return;
    $toast.classList.add("is-leaving");
  }, COPY_TOAST_MS);

  window.setTimeout(() => {
    if ($toast.isConnected) $toast.remove();
  }, COPY_TOAST_MS + COPY_TOAST_REMOVE_DELAY_MS);
};

/* prefetch removed — fetch only on user action */

document.addEventListener("click", async (event) => {
  const $target = event.target instanceof Element ? event.target : null;
  if (!$target) return;

  const $downloadTrigger = $target.closest("[data-download-editor]");
  if ($downloadTrigger instanceof HTMLElement) {
    event.preventDefault();
    const blobUrl = await _loadEditorBlobUrl();
    _triggerDownload(blobUrl ?? EDITOR_FILE_PATH, DOWNLOAD_FILE_NAME);
    return;
  }

  const $copyTrigger = $target.closest("[data-copy-editor]");
  if (!($copyTrigger instanceof HTMLElement)) return;

  event.preventDefault();
  const html = await _loadEditorHtmlText();
  if (html === null) {
    _showCopyToast("コードの取得に失敗しました", "error");
    return;
  }

  const copied = await _copyText(html);
  _showCopyToast(copied ? "コードをコピーしました" : "コピーに失敗しました", copied ? "success" : "error");
});

/* ---- Mobile Nav Toggle ---- */
const $navToggle = qs("#navToggle");
const $navLinks = qs("#navLinks");

if ($navToggle instanceof HTMLButtonElement && $navLinks instanceof HTMLElement) {
  $navToggle.addEventListener("click", () => {
    $navLinks.classList.toggle("is-open");
    const $icon = qs(".material-symbols-outlined", $navToggle);
    if ($icon instanceof HTMLElement) {
      $icon.textContent = $navLinks.classList.contains("is-open") ? "close" : "menu";
    }
  });

  /* Close mobile nav on link click */
  qsa(".glass-nav-link").forEach(($link) => {
    $link.addEventListener("click", () => {
      $navLinks.classList.remove("is-open");
      const $icon = qs(".material-symbols-outlined", $navToggle);
      if ($icon instanceof HTMLElement) $icon.textContent = "menu";
    });
  });
}

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

const _handleNavScroll = (): void => {
  if (!($nav instanceof HTMLElement)) return;
  if (window.scrollY > NAV_SCROLL_THRESHOLD) {
    $nav.style.background = "oklch(1 0 0 / 0.7)";
  } else {
    $nav.style.background = "";
  }
};

window.addEventListener("scroll", _handleNavScroll, { passive: true });
