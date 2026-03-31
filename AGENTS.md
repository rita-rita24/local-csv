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
