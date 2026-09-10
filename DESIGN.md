# ClearLeaf UI

ClearLeaf UI is a quiet, crisp interface system built from fresh green accents, cool gray surfaces, thin borders, and compact component rhythm.

若葉のようなグリーン、透明感のある白、冷静なグレーを組み合わせた、軽く清潔なUI設計です。装飾で強く見せるのではなく、余白、角丸、境界線、状態色、Material Symbolsのアイコンで一貫した雰囲気を作ります。

## Concept

ClearLeaf UIの印象は、次の5つで作ります。

- Clear: 白い面、細い線、読みやすい文字
- Leaf: エメラルドから若草に寄ったアクセント
- Quiet: 影やグラデーションを抑えた静かな操作感
- Compact: 入力、ボタン、表を30px台の密度で揃える
- Precise: focus、hover、selected、dangerなどの状態を小さく明確に出す

## Visual Identity

| 要素 | 方針 |
| --- | --- |
| Primary color | 若草・エメラルド系 |
| Surface | 白、薄いクールグレー |
| Border | 1pxの薄いクールグレー |
| Radius | 標準6px |
| Shadow | modal/menu/toastだけに使用 |
| Typography | system-ui、やや小さめ、密度優先 |
| Icons | Material Symbols Outlined |

## Anti AI-Slop Guidelines

ClearLeaf UIは、AI生成でよく出るSaaSランディングページ風の見た目に寄せません。ここでいうAIっぽさは、単独のCSSプロパティではなく、紫系グラデーション、大きな角丸、強い影、中央寄せヒーロー、3カラムカード、絵文字、hover scaleが同時に出ることで生まれる量産感です。

LocalCSVは実務ツールなので、表、入力、ツールバーに必要な薄い境界線は使います。一方で、装飾としての境界線、派手なグラデーション、カードを盛るための影は使いません。

### Prohibited Vocabulary

| Pattern | Why | ClearLeaf replacement |
| --- | --- | --- |
| Indigo / purple / violet gradients | Generic AI SaaS visual language | Use flat surfaces and one primary green accent |
| Decorative blobs, glows, radial gradients | Pulls attention away from tool work | Use neutral surfaces, density, and state color |
| Colored `border-left` / `border-top` callouts | Looks like copied template alerts | Use soft state backgrounds and stronger type |
| Border + large radius + strong shadow on the same card | Overdecorated default-card look | Use a 6px radius with either a thin border or a reserved shadow |
| `shadow-lg` style elevation on normal panels | Makes every surface compete | Reserve shadows for modal, menu, toast, tooltip |
| Centered hero + CTA + 3 feature cards | Landing-page template, not a tool surface | Show the real app structure: header, toolbar, search, table, status |
| Emoji headings or emoji bullets | Reads as generated marketing copy | Use plain text, numbers, or Material Symbols for actual actions |
| `transition: all` and hover scale | Noisy interaction default | Change color, underline, or surface state only |
| `backdrop-filter` glass effects | Contrast and performance risk | Use opaque overlays and stable surface tokens |

### ClearLeaf Exceptions

- `1px solid var(--cl-border)` is allowed for tables, inputs, toolbars, search surfaces, and structural dividers.
- `system-ui` is allowed because ClearLeaf is local-first and does not load external font CDNs.
- The `sumire` accent is allowed as a user-selected accent, but it must not become a purple gradient or the default brand look.
- Status colors are allowed for success, warning, danger, and info states when they communicate state, not decoration.
- Material Symbols are allowed for functional controls. Decorative icon rows are not.
- Strong shadows are allowed only for modal, menu, toast, tooltip, and other temporary floating UI.

### Token Discipline

- Use `--cl-*` tokens for color, radius, shadow, spacing, and motion.
- Define colors with `oklch` in CSS, then consume them through semantic tokens.
- Keep radius close to `6px`; use larger radius only when a component spec requires it.
- Use primary color for current action, selection, focus, and important state. Do not use it as a page-wide decoration.
- Prefer surface contrast, spacing, weight, and state color before adding border, shadow, or icon decoration.

## CSS Layers

```css
@layer reset, base, component, utility;
```

ClearLeaf UIのCSSは必ずこの順序のレイヤーに入れます。追加CSSもレイヤー外に書かないでください。

## Setup

```html
<html lang="ja" data-cl-accent="wakakusa">
<head>
  <style>
    @layer reset, base, component, utility;
    /* Paste clearleaf-ui.css here when shipping as a single HTML file. */
  </style>
</head>
<body class="cl-root">
  ...
</body>
</html>
```

`cl-*` は ClearLeaf UI の接頭辞として扱います。

テーマはJavaScriptで制御します。

```js
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

const setTheme = (theme) => {
  const normalized = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalized;
  document.documentElement.style.colorScheme = normalized;
};
```

## Tokens

### Color

| Token | Role |
| --- | --- |
| `--cl-primary` | primary action, selected, focus |
| `--cl-primary-hover` | primary hover |
| `--cl-primary-soft` | soft highlight |
| `--cl-primary-faint` | table hover / faint fill |
| `--cl-bg` | page background |
| `--cl-bg-soft` | status bar / muted surface |
| `--cl-surface` | panel, modal, table cell |
| `--cl-header-bg` | header, table head, button bg |
| `--cl-border` | default border |
| `--cl-border-strong` | checkbox/radio border |
| `--cl-text` | main text |
| `--cl-text-muted` | secondary text |

### Radius

| Token | Value | Use |
| --- | ---: | --- |
| `--cl-radius-sm` | `4px` | checkbox |
| `--cl-radius-md` | `6px` | input, select, button, table, modal |
| `--cl-radius-lg` | `8px` | larger surfaces |
| `--cl-radius-pill` | `9999px` | pill |

ClearLeaf UIの標準角丸は `6px` です。角丸を大きくしすぎると、ClearLeafの薄く精密な雰囲気から外れます。

### Spacing

| Token | Value | Use |
| --- | ---: | --- |
| `--cl-space-1` | `2px` | fine adjustment |
| `--cl-space-2` | `4px` | tight gap |
| `--cl-space-3` | `6px` | compact gap |
| `--cl-space-4` | `8px` | default gap |
| `--cl-space-5` | `12px` | toolbar padding |
| `--cl-space-6` | `16px` | header / modal inner gap |
| `--cl-space-7` | `20px` | app shell padding |
| `--cl-space-8` | `24px` | modal padding |
| `--cl-space-10` | `40px` | dropzone padding |

### Density

| Token | Value | Use |
| --- | ---: | --- |
| `--cl-control-shell-padding-block` | `8px` | toolbar/search vertical padding |
| `--cl-control-shell-padding-inline` | `12px` | toolbar/search horizontal padding |
| `--cl-control-shell-gap` | `6px` | toolbar/search inner gap |
| `--cl-control-group-gap` | `4px` | toolbar group gap |
| `--cl-control-btn-padding-block` | `4px` | compact button |
| `--cl-control-btn-padding-inline` | `10px` | compact button |
| `--cl-control-btn-font-size` | `0.8rem` | compact button |
| `--cl-control-btn-min-block-size` | `30px` | compact button/input/select |
| `--cl-control-header-icon-size` | `36px` | icon button |

## Icon System

ClearLeaf UI uses **Material Symbols Outlined**.

Use the bundled local font. Do not load icon fonts from Google Fonts or a CDN.
When shipping a single HTML file, embed this bundled font as a `data:font/woff2` URL inside the `@font-face` rule. `demo.html` already follows that standalone pattern.

```css
@font-face {
  font-family: "Material Symbols Outlined";
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url("public/fonts/material-symbols-outlined-f400.woff2") format("woff2");
}
```

```html
<button class="cl-btn" type="button">
  <span class="material-symbols-outlined" aria-hidden="true">save</span>
  保存
</button>
```

Rules:

- Always use `<span class="material-symbols-outlined">icon_name</span>`.
- Decorative icons use `aria-hidden="true"`.
- Icon-only buttons need `aria-label` on the button.
- Do not use custom SVG for common actions when Material Symbols has a matching icon.
- Icon color usually inherits from the button text.
- Menu and palette icons use muted text color.

| Place | Size | Color |
| --- | ---: | --- |
| Header logo | `2rem` | `var(--cl-primary)` |
| Standard button | `1.15rem` | inherit |
| Compact toolbar button | `1rem` | inherit |
| Icon button | `1.1rem` | inherit |
| Menu item | `1rem` | `var(--cl-text-muted)` |
| Command palette | `18px` | `var(--cl-text-muted)` |
| Dropzone | `2rem` | `var(--cl-primary)` |
| Modal title | `1.2rem` | inherit |

Recommended icons:

| Action | Icon |
| --- | --- |
| Open | `upload_file` |
| Save | `save` |
| Export | `download` |
| Search | `search` |
| Add | `add` |
| Add column | `view_column` |
| Delete | `delete` |
| Settings | `settings` |
| Close | `close` |
| Filter | `filter_alt` |
| Sort | `arrow_upward`, `arrow_downward` |
| Copy | `content_copy` |
| Confirm | `check_circle` |

## Component Specs

### Text Input

| Property | Value |
| --- | --- |
| height | `30px` |
| padding | `4px 10px` |
| border | `1px solid var(--cl-border)` |
| radius | `6px` |
| font-size | `0.82rem` |
| background | `var(--cl-bg)` |
| focus | primary border + focus ring |

```html
<input class="cl-input" type="search" placeholder="検索">
```

### Select

Select uses a custom chevron. Native arrows must be hidden.

| Property | Value |
| --- | --- |
| height | `30px` |
| padding | `4px 10px` |
| padding-right | `2.5rem` |
| border | `1px solid var(--cl-border)` |
| radius | `6px` |
| font-size | `0.82rem` |
| chevron | `12px x 8px`, right `14px` center |

```html
<select class="cl-select">
  <option>全列</option>
  <option>選択列</option>
</select>
```

Variants:

| Class | Padding | Font size | Use |
| --- | --- | ---: | --- |
| `.cl-select` | `4px 10px` | `0.82rem` | default |
| `.cl-control--settings` | `8px 12px` | `0.9rem` | settings form |
| `.cl-control--chip` | `0 0.7em` | `0.72rem` | compact header chip |
| `.cl-control--filter` | `4px 8px` | `0.82rem` | filter condition |

### Textarea

| Property | Value |
| --- | --- |
| min-height | `96px` |
| padding | `8px 10px` |
| border | `1px solid var(--cl-border)` |
| radius | `6px` |
| font-size | `0.82rem` |
| resize | `vertical` |

### Checkbox

| Property | Value |
| --- | --- |
| size | `16px x 16px` |
| border | `1.5px solid var(--cl-border-strong)` |
| radius | `4px` |
| checked bg | `var(--cl-primary)` |
| check mark | white SVG, `11px x 11px` |
| focus | `0 0 0 3px var(--cl-focus-ring)` |

```html
<label class="cl-checkbox">
  <input type="checkbox">
  完全一致
</label>
```

### Radio

| Property | Value |
| --- | --- |
| size | `16px x 16px` |
| border | `1.5px solid var(--cl-border-strong)` |
| radius | `50%` |
| checked bg | `var(--cl-primary)` |
| inner dot | `inset 0 0 0 2.5px var(--cl-surface)` |

### Button

ClearLeaf buttons are flat, compact, and quiet. They should feel like tool controls, not marketing CTAs.

#### Standard Button

| Property | Value |
| --- | --- |
| display | `inline-flex` |
| align-items | `center` |
| gap | `6px` |
| padding | `6px 14px` |
| min-height | `36px` |
| radius | `6px` |
| font-size | `0.85rem` |
| font-weight | `500` |
| background | `var(--cl-header-bg)` |
| hover | `var(--cl-border)` |
| icon size | `1.15rem` |

```html
<button class="cl-btn" type="button">
  <span class="material-symbols-outlined" aria-hidden="true">save</span>
  保存
</button>
```

#### Primary Button

| Property | Value |
| --- | --- |
| background | `var(--cl-primary)` |
| color | `var(--cl-text-on-primary)` |
| hover | `var(--cl-primary-hover)` |

Use primary only for the main action in the current group.

#### Danger Button

| Property | Value |
| --- | --- |
| background | `var(--cl-color-danger)` |
| color | white |
| hover | `var(--cl-color-danger-hover)` |

#### Compact Toolbar Button

| Property | Value |
| --- | --- |
| padding | `4px 10px` |
| min-height | `30px` |
| font-size | `0.8rem` |
| gap | `4px` |
| icon size | `1rem` |

```html
<button class="cl-btn cl-btn--compact" type="button">
  <span class="material-symbols-outlined" aria-hidden="true">add</span>
  行追加
</button>
```

### Icon Button

| Property | Value |
| --- | --- |
| size | `36px x 36px` |
| border | `1px solid var(--cl-border)` |
| radius | `6px` |
| background | `var(--cl-surface)` |
| hover | `var(--cl-header-bg)` |
| icon size | `1.1rem` |

```html
<button class="cl-icon-btn" type="button" aria-label="設定">
  <span class="material-symbols-outlined" aria-hidden="true">settings</span>
</button>
```

### Toolbar

| Property | Value |
| --- | --- |
| display | flex, wrap |
| gap | `6px` |
| padding | `8px 12px` |
| background | `var(--cl-surface)` |
| border | `1px solid var(--cl-border)` |
| radius | `6px` |
| group gap | `4px` |
| divider | `1px x 18px` |

### Search Bar

| Property | Value |
| --- | --- |
| display | column |
| padding | `8px 12px` |
| gap | `6px` |
| border | `1px solid var(--cl-border)` |
| radius | `6px` |
| row gap | `8px` |

### Table

| Property | Value |
| --- | --- |
| container border | `1px solid var(--cl-border)` |
| container radius | `6px` |
| font-size | `0.9rem` |
| layout | `fixed` |
| border-collapse | `collapse` |
| cell padding | `10px 12px` |
| cell border | `1px solid var(--cl-border)` |
| th background | `var(--cl-header-bg)` |
| th weight | `600` |
| selected/focus | `var(--cl-cell-focus-bg)` + inset primary ring |

### Modal

ClearLeaf modals are small, centered, and precise. The shape stays consistent with the rest of the UI: 6px radius, 24px padding, strong but clean shadow.

| Property | Value |
| --- | --- |
| overlay bg | `oklch(0 0 0 / 0.5)` |
| overlay padding | `20px` |
| modal bg | `var(--cl-surface)` |
| modal radius | `6px` |
| default max-width | `400px` |
| settings max-width | `680px` |
| wizard max-width | `720px` to `760px` |
| padding | `24px` |
| shadow | `0 20px 60px oklch(0 0 0 / 0.3)` |
| title size | `1.1rem` |
| text size | `0.9rem` |
| actions | right aligned, `8px` gap |

```html
<div class="cl-overlay" data-open="true">
  <section class="cl-modal" role="dialog" aria-modal="true" aria-labelledby="dialogTitle">
    <div class="cl-modal-header">
      <h2 class="cl-modal-title" id="dialogTitle">
        <span class="material-symbols-outlined" aria-hidden="true">settings</span>
        設定
      </h2>
      <button class="cl-icon-btn" type="button" aria-label="閉じる">
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
    </div>
    <div class="cl-modal-body">設定内容を確認してください。</div>
    <div class="cl-modal-actions">
      <button class="cl-btn" type="button">キャンセル</button>
      <button class="cl-btn cl-btn--primary" type="button">適用</button>
    </div>
  </section>
</div>
```

### Command Palette

| Property | Value |
| --- | --- |
| overlay align | top, `10vh` |
| width | `min(560px, 92vw)` |
| max-height | `70vh` |
| padding | `0` |
| radius | `6px` |
| search padding | `12px 14px` |
| item padding | `8px 14px` |
| item gap | `10px` |
| icon size | `18px` |
| title size | `0.92rem` |
| hint size | `0.75rem` |
| shortcut size | `0.72rem` |
| hover | `var(--cl-accent-soft)` |

### Toast

| Property | Value |
| --- | --- |
| position | fixed bottom center |
| bottom | `24px` |
| padding | `14px 24px` |
| radius | `6px` |
| font-size | `0.9rem` |
| shadow | `0 4px 20px oklch(0 0 0 / 0.2)` |
| success bg | `var(--cl-color-success)` |
| error bg | `var(--cl-color-danger)` |

## Demo Files

- `demo.html`: standalone ClearLeaf UI component demo. CSS and the Material Symbols font are embedded, so it can be opened directly as a single HTML file.
- `clearleaf-ui.css`: reusable stylesheet source for the `cl-*` classes. Copy it into `<style>` when another system needs a single-file page.

## Do / Don't

Do:

- Use Material Symbols for common icons.
- Keep standard radius at 6px.
- Use compact 30px controls in toolbar/search surfaces.
- Use primary green sparingly.
- Use 1px borders to define structure.
- Keep modal actions right aligned.
- Use surface color, density, and state changes to guide attention.
- Keep hover feedback limited to color, underline, or subtle surface changes.

Don't:

- Add external icon/font CDNs.
- Make buttons oversized or pill-shaped by default.
- Use gradients or decorative blobs.
- Put multiple primary buttons in one small action group.
- Mix native select arrows with custom chevrons.
- Use large card-heavy layouts for tool surfaces.
- Use purple/indigo/violet gradients or glow backgrounds.
- Use colored left/top borders as callout decoration.
- Add `transition: all`, hover scale, or bouncing motion to standard controls.
- Use emoji headings, emoji bullets, or decorative icon rows.
- Use glassmorphism or `backdrop-filter` for ordinary panels.

## 30-second Review Checklist

Before shipping a ClearLeaf screen, check these points:

- No indigo, purple, or violet gradient is used as a background, CTA, or icon fill.
- No decorative blob, glow, glass panel, or radial gradient is present.
- No colored `border-left` or `border-top` is used for emphasis.
- Normal panels do not combine border, large radius, and strong shadow.
- Shadows appear only on floating UI such as modal, menu, toast, or tooltip.
- Hover effects do not scale the element or use `transition: all`.
- Headings and lists do not use emoji as decoration.
- Icons communicate actions or navigation, not generic feature decoration.
- Primary color appears only where the user can act, select, focus, or read state.
- The first screen looks like a usable tool surface, not a marketing hero.
