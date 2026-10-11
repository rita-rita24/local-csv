# AGENTS.md

## Repo overview
This repository contains multiple single-file HTML business tools.
Each tool lives in its own subdirectory.
Prioritize small, safe, high-confidence changes.

## Common rules
- Keep each tool self-contained in its own folder.
- Do not move files across tools unless explicitly requested.
- Do not add a build step unless explicitly requested.
- Prefer local-first behavior.
- Do not add telemetry or external network calls unless explicitly requested.

## GitHub Actionsを追加しない
- このリポジトリにはGitHub Actionsを追加・再導入しない。
- `.github/workflows/` にワークフローファイルを作成せず、GitHub側のActionsも有効化しない。
- ビルド・型検査・静的解析・テストはローカルで実行する。`npm run test:static` でもワークフローファイルの再混入を検出する。
- 一般的なCI整備・自動化・本番反映の依頼を、GitHub Actions追加の許可と解釈しない。

## Verification
Before finishing work:
1. Only modify the target tool directory unless explicitly requested.
2. Confirm the target tool opens without console errors.
3. Update that tool's README.md if behavior changed.

## CSS Rules
- Use CSS layers in this order: `reset -> base -> component -> utility`.
- Do not write styles outside declared layers.
- Use CSS nesting when possible.
- Use `oklch` for color definitions.
- Do not import external reset CSS.

## JavaScript Rules
- Prefer JavaScript-based color scheme control.
- Control color mode via `document.documentElement.style.colorScheme`.
- Keep behavior deterministic and easy to maintain.
- Do not introduce unnecessary dependencies.
- Write code that works in a single-file HTML environment when possible.

## DOM Helper Rules
- Use the following DOM helper functions for element selection:
  - `const qs = (sel, root = document) => root.querySelector(sel);`
  - `const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];`

## Naming Rules
- Prefix DOM element variables with `$`.
  - Example: `$button`, `$modal`, `$input`
- Prefix private/internal variables, methods, or fields with `_`.
  - Example: `_state`, `_render()`
- Write constants in `UPPER_SNAKE_CASE`.
  - Example: `MAX_ITEMS`, `DEFAULT_DELAY`

## Event Rules
- Prefer event delegation over direct event binding.
- Direct binding is allowed only for:
  - toolbar buttons
  - other static controls

## Implementation Notes
- Keep CSS and JavaScript consistent with the repository rules.
- Do not introduce alternative naming styles unless already required by existing code.
- Prefer consistency over personal style.

## Modernization checks
- Run `npm run build`, `npm run test:static`, `npm test`, and relevant browser regressions.
- Generated `public/js/main.js` must match `src/main.ts`; edit the source and use the existing compiler.
- New standard APIs must have runtime feature checks until minimum supported environments are specified and verified. Type declarations alone do not prove runtime support.
- The clipboard fallback, IME 229 guard, and embedded encoding dependency have explicit compatibility evidence in `tests/performance-results/modern/REPORT.md`. Review their actual input/output contract before changing them.
- Do not change historical benchmark snapshots. Keep local measurements distinct from production measurements and record unmeasured operations.
- Prefer the LTS development version in `.nvmrc`; verify Node 22/24 compatibility locally. Product HTML remains independent of Node.
- For performance candidates, save the baseline and numerical targets before editing; preserve rejected candidates and distinguish ranges, median direction, and confirmed improvements.

## TSV copy maintenance
- Keep visible row order and ascending selected column order; do not omit off-screen selected cells.
- Preserve quoted single empty fields and all tab/CR/LF/quote content. Test exact full output, not only displayed previews.
- Treat keydown-to-clipboard-API handoff and rendering opportunities as separate proxies; do not report them as OS clipboard completion or GPU presentation.

## Source audit maintenance
- Share AST declaration extraction through `tests/localcsv-source-audit.mjs`; do not copy the old text scanner from regression tests.
- Reconstruct supported Worker template interpolations and parse the generated source. Unknown interpolations must fail the check rather than silently disappear.
- Keep compatibility exceptions explicit and exact. Test mocks, generated artifacts, and historical evidence must be classified separately from handwritten product code.
- Syntax and resource-call inventories do not prove lifecycle correctness. Verify cleanup on success and failure without changing URL cache ownership.
- Development AST parsing requires Node 22.18 or later in the 22 line, or Node 24.11 or later; keep the supported local development versions current.
