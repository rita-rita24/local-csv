"use strict";
/**
 * LocalCSV LP Redesign — Main Script
 */
/* ---- DOM Helpers (AGENTS.md) ---- */
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
/* ---- Download / Copy LocalCSV.html ---- */
const DOWNLOAD_FILE_NAME = "localcsv.html";
const COPY_TOAST_MS = 1800;
const COPY_TOAST_REMOVE_DELAY_MS = 280;
const LP_TOAST_VIEWPORT_ID = "lpToastViewport";
const EMBEDDED_EDITOR_BASE64_ID = "editor-html-base64";
const EDITOR_ACTION_DISABLED_CLASS = "editor-action-disabled";
const EDITOR_VERIFY_FAILED_MESSAGE = "エディタHTMLの検証に失敗したため、保存/コピーを停止しました";
const LEGAL_MODAL_ID = "legalModal";
const LEGAL_MODAL_TITLE_ID = "legalModalTitle";
const LEGAL_MODAL_BODY_ID = "legalModalBody";
const LEGAL_MODAL_ITEMS = {
    runtime: { title: "動作環境", templateId: "legalTemplateRuntime" },
    terms: { title: "利用規約", templateId: "legalTemplateTerms" },
    privacy: { title: "プライバシーポリシー", templateId: "legalTemplatePrivacy" },
};
let _editorBlobUrl = null;
let _editorBlobLoadPromise = null;
let _editorHtmlText = null;
let _editorIntegrityMessage = "";
let _lastLegalModalTrigger = null;
const _triggerDownload = (href, fileName) => {
    const $anchor = document.createElement("a");
    $anchor.href = href;
    $anchor.download = fileName;
    document.body.appendChild($anchor);
    $anchor.click();
    $anchor.remove();
};
const _decodeBase64Utf8 = (base64) => {
    try {
        const binary = window.atob(base64);
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        return new TextDecoder("utf-8").decode(bytes);
    }
    catch {
        return null;
    }
};
const _loadEmbeddedEditorHtmlText = () => {
    const $embedded = qs(`#${EMBEDDED_EDITOR_BASE64_ID}`);
    if (!($embedded instanceof HTMLScriptElement))
        return null;
    const base64 = ($embedded.textContent ?? "").replace(/\s+/g, "");
    if (!base64)
        return null;
    return _decodeBase64Utf8(base64);
};
const _setEditorActionsDisabled = (disabled, message = "") => {
    qsa("[data-download-editor], [data-copy-editor]").forEach(($action) => {
        if (!($action instanceof HTMLElement))
            return;
        $action.classList.toggle(EDITOR_ACTION_DISABLED_CLASS, disabled);
        $action.setAttribute("aria-disabled", disabled ? "true" : "false");
        if (disabled) {
            if (!$action.dataset.originalTitle)
                $action.dataset.originalTitle = $action.getAttribute("title") ?? "";
            $action.setAttribute("title", message);
            return;
        }
        const originalTitle = $action.dataset.originalTitle;
        if (originalTitle === undefined)
            return;
        if (originalTitle)
            $action.setAttribute("title", originalTitle);
        else
            $action.removeAttribute("title");
        delete $action.dataset.originalTitle;
    });
};
const _failEditorIntegrity = (message) => {
    _editorIntegrityMessage = message;
    _editorHtmlText = null;
    if (_editorBlobUrl) {
        URL.revokeObjectURL(_editorBlobUrl);
        _editorBlobUrl = null;
    }
    _setEditorActionsDisabled(true, message);
    return null;
};
const _loadEditorHtmlText = () => {
    if (_editorHtmlText !== null)
        return Promise.resolve(_editorHtmlText);
    if (_editorIntegrityMessage)
        return Promise.resolve(null);
    const embeddedHtml = _loadEmbeddedEditorHtmlText();
    if (embeddedHtml !== null) {
        _editorIntegrityMessage = "";
        _editorHtmlText = embeddedHtml;
        _setEditorActionsDisabled(false);
        return Promise.resolve(embeddedHtml);
    }
    return Promise.resolve(_failEditorIntegrity(EDITOR_VERIFY_FAILED_MESSAGE));
};
const _loadEditorBlobUrl = () => {
    if (_editorBlobUrl)
        return Promise.resolve(_editorBlobUrl);
    if (_editorBlobLoadPromise)
        return _editorBlobLoadPromise;
    _editorBlobLoadPromise = _loadEditorHtmlText()
        .then((html) => {
        if (!html)
            return null;
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        _editorBlobUrl = URL.createObjectURL(blob);
        return _editorBlobUrl;
    })
        .finally(() => {
        _editorBlobLoadPromise = null;
    });
    return _editorBlobLoadPromise;
};
const _copyText = async (text) => {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        }
        catch {
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
    }
    catch {
        return false;
    }
};
const _getLpToastViewport = () => {
    const $existing = qs(`#${LP_TOAST_VIEWPORT_ID}`);
    if ($existing instanceof HTMLElement)
        return $existing;
    const $viewport = document.createElement("div");
    $viewport.id = LP_TOAST_VIEWPORT_ID;
    $viewport.className = "lp-toast-viewport";
    document.body.appendChild($viewport);
    return $viewport;
};
const _showCopyToast = (message, tone) => {
    const $viewport = _getLpToastViewport();
    const $toast = document.createElement("div");
    $toast.className = `lp-toast lp-toast--${tone}`;
    $toast.textContent = message;
    $toast.setAttribute("aria-atomic", "true");
    if (tone === "error") {
        $toast.setAttribute("role", "alert");
        $toast.setAttribute("aria-live", "assertive");
    }
    else {
        $toast.setAttribute("role", "status");
        $toast.setAttribute("aria-live", "polite");
    }
    $viewport.appendChild($toast);
    window.requestAnimationFrame(() => {
        if ($toast.isConnected)
            $toast.classList.add("is-visible");
    });
    window.setTimeout(() => {
        if (!$toast.isConnected)
            return;
        $toast.classList.add("is-leaving");
    }, COPY_TOAST_MS);
    window.setTimeout(() => {
        if ($toast.isConnected)
            $toast.remove();
    }, COPY_TOAST_MS + COPY_TOAST_REMOVE_DELAY_MS);
};
const _openLegalModal = (key, $trigger = null) => {
    const item = LEGAL_MODAL_ITEMS[key];
    if (!item)
        return;
    const $modal = qs(`#${LEGAL_MODAL_ID}`);
    if (!($modal instanceof HTMLElement))
        return;
    const $title = qs(`#${LEGAL_MODAL_TITLE_ID}`, $modal);
    const $body = qs(`#${LEGAL_MODAL_BODY_ID}`, $modal);
    const $template = qs(`#${item.templateId}`);
    if (!($title instanceof HTMLElement) || !($body instanceof HTMLElement) || !($template instanceof HTMLTemplateElement))
        return;
    $title.textContent = item.title;
    $body.replaceChildren($template.content.cloneNode(true));
    _lastLegalModalTrigger = $trigger instanceof HTMLElement ? $trigger : null;
    $modal.hidden = false;
    $modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("legal-modal-open");
    const $close = qs("[data-legal-close-button]", $modal);
    if ($close instanceof HTMLElement)
        $close.focus();
};
const _closeLegalModal = () => {
    const $modal = qs(`#${LEGAL_MODAL_ID}`);
    if (!($modal instanceof HTMLElement) || $modal.hidden)
        return;
    $modal.hidden = true;
    $modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("legal-modal-open");
    if (_lastLegalModalTrigger instanceof HTMLElement)
        _lastLegalModalTrigger.focus();
    _lastLegalModalTrigger = null;
};
/* Runtime fetch is intentionally avoided so the LP can enforce connect-src 'none'. */
document.addEventListener("click", async (event) => {
    const $target = event.target instanceof Element ? event.target : null;
    if (!$target)
        return;
    const $legalTrigger = $target.closest("[data-legal-modal]");
    if ($legalTrigger instanceof HTMLElement) {
        event.preventDefault();
        _openLegalModal($legalTrigger.dataset.legalModal ?? "", $legalTrigger);
        return;
    }
    const $legalClose = $target.closest("[data-legal-close]");
    if ($legalClose instanceof HTMLElement) {
        event.preventDefault();
        _closeLegalModal();
        return;
    }
    const $downloadTrigger = $target.closest("[data-download-editor]");
    if ($downloadTrigger instanceof HTMLElement) {
        event.preventDefault();
        const blobUrl = await _loadEditorBlobUrl();
        if (!blobUrl) {
            _showCopyToast(_editorIntegrityMessage || EDITOR_VERIFY_FAILED_MESSAGE, "error");
            return;
        }
        _triggerDownload(blobUrl, DOWNLOAD_FILE_NAME);
        return;
    }
    const $copyTrigger = $target.closest("[data-copy-editor]");
    if (!($copyTrigger instanceof HTMLElement))
        return;
    event.preventDefault();
    const html = await _loadEditorHtmlText();
    if (html === null) {
        _showCopyToast(_editorIntegrityMessage || "エディタHTMLの取得に失敗しました", "error");
        return;
    }
    const copied = await _copyText(html);
    _showCopyToast(copied ? "本体HTMLソースをコピーしました" : "コピーに失敗しました", copied ? "success" : "error");
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape")
        _closeLegalModal();
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
            if ($icon instanceof HTMLElement)
                $icon.textContent = "menu";
        });
    });
}
/* ---- Scroll Fade-In Observer ---- */
const _observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
        if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
        }
    }
}, { threshold: 0.1 });
qsa(".fade-in").forEach((el) => _observer.observe(el));
/* ---- Nav scroll effect (add bg on scroll) ---- */
const $nav = qs("#glass-nav");
const NAV_SCROLL_THRESHOLD = 60;
const _handleNavScroll = () => {
    if (!($nav instanceof HTMLElement))
        return;
    if (window.scrollY > NAV_SCROLL_THRESHOLD) {
        $nav.style.background = "oklch(1 0 0 / 0.7)";
    }
    else {
        $nav.style.background = "";
    }
};
window.addEventListener("scroll", _handleNavScroll, { passive: true });
