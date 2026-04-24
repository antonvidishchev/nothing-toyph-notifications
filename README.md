# Toyph Glyph Generator

https://antonvidishchev.github.io/nothing-toyph-notifications/

As a Nothing Phone 4(a) Pro owner, I am excited to have the glyph interface on the back of my phone.
The functionality to create new notifications is, however, not ideal. I can't draw my own glyph (my teenager son has ideas of what to draw, they will never pass the marketplace rules), and while I can create a glyph from a picture - I sometimes want to change a few pixels to make it perfect, but there's no interface for that.

I implemented the drawing functionality, ability to upload an image and then modify that. As it is a 13x13 image, I also implemented a QR code generation with reasonable compression, as well as a string to copy. None of it is supported today, so I will let Nothing tech guys use any of those, or will modify the algorythm to comply with whatever format Nothing tech guys make available.
All open source, community driven, no hassle.

The export/import JSON is the functionality needed for my other project that I will opensource soon - animations, effects, scrolling text - any glyph would be a frame in that.

## Technical Overview

A frontend-only React SPA for designing and sharing Toyph glyph patterns for **Nothing Phone (4a) Pro** on a **13×13 matrix** (169 cells, 137 active LEDs).

Paint manually, convert images with crop/zoom controls, and share patterns through QR code or compact text payloads.

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Usage Guide](#usage-guide)
- [Project Structure](#project-structure)
- [Scripts](#scripts)
- [Quality and Testing](#quality-and-testing)
- [Deployment (GitHub Pages)](#deployment-github-pages)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Features

### Core editor

- 13×13 circular matrix editor (137 active LEDs, 32 inactive corners)
- Five canonical brightness levels: `0`, `1024`, `2048`, `3072`, `4095`
- **2 Colors / 5 Colors** mode switch with cookie persistence
- Advanced mouse interaction:
  - left click = forward action
  - right click = opposite action
  - click-and-drag paints with a locked value across cells
  - context menu blocked on drawable cells
- Invert and Clear controls

### Image upload and crop

- Upload PNG/JPEG/GIF/WebP
- Crop modal with circular mask preview
- Pan + zoom (including zoom-out to fit)
- Brightness slider + numeric input
- Invert colors checkbox
- Confirm to apply generated pattern to main grid

### Sharing and import/export

- Export and import full-grid JSON patterns
- Live pattern code display with one-click **Copy**
- QR code modal with encoded payload copy support
- URL import support: `?pattern=<payload>`

### Frontend-only by design

- No backend runtime
- No database
- No auth
- Runs as static assets (ideal for GitHub Pages)

## Quick Start

### Prerequisites

- Node.js 24+
- npm

### Install and run

```bash
npm install
npm run dev
```

Open: `http://localhost:3101`

## Usage Guide

### 1. Draw manually

1. Click grid cells to cycle brightness.
2. Use **2 Colors** mode for black/white editing.
3. Use right click for opposite direction editing.
4. Hold mouse button and drag to paint multiple cells with one value.

### 2. Convert an image

1. Click **Upload Image**.
2. Pan/zoom in the crop modal.
3. Adjust brightness and optional invert.
4. Click **Confirm** to apply the generated glyph.

### 3. Share patterns

1. Use **QR Code** to display a scannable payload.
2. Use **Copy Pattern Code** in the QR modal or **Copy** beside the main pattern code.
3. Share a link with `?pattern=<payload>` to pre-load a design.

### 4. Import/export JSON

- **Export JSON** for backups or versioning.
- **Import JSON** to load an existing pattern file.

## Project Structure

```text
client/
  public/
    logo.png
  src/
    App.jsx
    main.jsx
    setupTests.js
    components/
      GlyphGrid.jsx
      CropModal.jsx
      CropArea.jsx
      GlyphPreview.jsx
      QRCodeModal.jsx
      __tests__/
    utils/
      gridConstants.js
      imageProcessing.js
      jsonIO.js
      cropUtils.js
      qrPayload.js
      __tests__/
.github/
  workflows/
    deploy-pages.yml
```

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start Vite dev server on port 3101 |
| `npm run build` | Build SPA to `dist/` |
| `npm run preview` | Preview the built app locally |
| `npm test` | Run the full Vitest suite |
| `npm run test:coverage` | Run tests with coverage |
| `npx eslint .` | Lint project files |
| `npm run format` | Format with Prettier |
| `npm run format:check` | Verify formatting |
| `npm run knip` | Detect unused files/exports/dependencies |
| `npm run jscpd` | Detect duplicate code |
| `npm run todo:scan` | Scan TODO/FIXME comments |

## Quality and Testing

- Vitest (`jsdom`) + Testing Library
- Randomized test execution order (`sequence.shuffle: true`)
- Coverage thresholds:
  - lines/statements: 80%
  - branches: 70%
  - functions: 55%
- ESLint flat config with complexity and file-size guardrails

## Deployment (GitHub Pages)

This repository includes automatic Pages deployment via:

`.github/workflows/deploy-pages.yml`

### Setup

1. In GitHub repository settings, set **Pages → Source** to **GitHub Actions**.
2. Push to `master` (or run workflow manually).
3. The workflow builds and deploys `dist/`.

`vite.config.js` uses `base: './'` for static Pages asset resolution.

## Contributing

Contributions are welcome.

1. Open an issue (bug or feature request) describing the change.
2. Fork and create a focused branch.
3. Implement changes with tests.
4. Run:
   ```bash
   npx eslint .
   npm run build
   npm test
   ```
5. Open a PR using the repository template.

Useful templates:

- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`
- `.github/pull_request_template.md`

## Troubleshooting

- **Nothing happens when clicking Copy**  
  Clipboard access may be blocked by browser context, permissions, or non-secure origin.

- **QR code not visible**  
  Ensure the grid is not empty (all zeros); QR generation is intentionally blocked for empty patterns.

- **Pattern URL import fails**  
  Verify payload format and ensure `?pattern=<payload>` is not truncated or altered by messaging apps.

- **Port already in use (3101)**  
  Stop the process using that port or run Vite with a different port locally.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
