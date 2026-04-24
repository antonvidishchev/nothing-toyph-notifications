# Copilot instructions for Toyph Glyph Generator

## Build, test, and lint commands

- Install dependencies: `npm ci`
- Run locally: `npm run dev` (Vite serves on `http://localhost:3101`)
- Build production assets: `npm run build` (outputs to `dist/`)
- Lint: `npx eslint .`
- Run all tests: `npm test`
- Run one test file: `npm test -- client/src/components/__tests__/GlyphGrid.test.jsx`
- Run one test by name: `npx vitest run client/src/components/__tests__/GlyphGrid.test.jsx -t "in 2 Colors mode, clicking an active pixel toggles between 0 and 4095"`

Before opening a PR, follow the repo checklist from `.github/pull_request_template.md`: run lint, build, and tests.

## High-level architecture

- This repo is a frontend-only React SPA (no backend/auth/database), designed for static hosting on GitHub Pages.
- `client/src/main.jsx` mounts `App`.
- `client/src/App.jsx` owns the top-level `grid` state and applies URL imports (`?pattern=...`) through `decodeInput`.
- `client/src/components/GlyphGrid.jsx` is the main editor and orchestrates manual painting, color mode switching, JSON import/export, pattern-code copy, and both modals.
- Image flow is split:
  - `CropModal.jsx` owns crop state (zoom/pan/brightness/invert/mode) and preview generation.
  - `CropArea.jsx` owns pointer/wheel interaction details and pan/zoom constraints.
  - `utils/cropUtils.js` + `utils/imageProcessing.js` perform the crop-to-13x13 brightness pipeline.
- Sharing flow is split:
  - `utils/qrPayload.js` handles payload encode/decode and legacy format compatibility.
  - `QRCodeModal.jsx` renders the QR from `glyphtoy://pattern/<encoded>`.
  - `utils/jsonIO.js` handles JSON export/import validation and normalization.
- Build/deploy shape is important: `vite.config.js` uses `root: 'client'`, `base: './'`, and emits to `../dist`; `.github/workflows/deploy-pages.yml` uploads `dist/`.
- MCP setup for browser automation is tracked in `.vscode/mcp.json` (Playwright MCP server via `npx -y @microsoft/mcp-server-playwright`).

## Key conventions

- **Core data contract:** glyph state is always a 169-item row-major brightness array (`13x13`). Keep inactive mask positions (`CIRCULAR_MASK`) at `0`.
- **Brightness semantics:** canonical levels are `0, 1024, 2048, 3072, 4095`; 2-color mode is strictly `0`/`4095` with threshold behavior around `2048`.
- **Encoding constraint:** `encodePattern` accepts only canonical palette levels. Non-canonical values can exist in import/crop/edit paths, but share-code generation will fail until values are canonicalized.
- **Color mode persistence:** both grid and crop modal persist/read `glyph_color_mode` cookie (`'5'` or `'2'`), and their toggles are expected to stay in sync.
- **Crop confirm guard:** crop preview updates are debounced, but Confirm recomputes brightness synchronously before applying to avoid stale preview state.
- **Test coupling to UI hooks:** tests rely heavily on existing `data-testid` values and some inline style colors/states; preserve those hooks or update tests alongside UI changes.
- **Vitest behavior:** test order is shuffled (`vitest.config.js`), so avoid order-dependent tests or shared mutable global state.
- **Shared MCP config:** keep repository-level MCP servers in `.vscode/mcp.json` so teammates can use the same tool set.
