# Local Label Studio

Offline barcode label generator for a single PC: **Node.js + Express + built-in `node:sqlite` + bwip-js + pdf-lib**. No cloud, no accounts, no telemetry.

## Requirements

- [Node.js](https://nodejs.org/) **22.13+** (uses the built-in [SQLite](https://nodejs.org/api/sqlite.html) module; you may see a one-line experimental warning — safe for local use).

## Setup

```powershell
cd "e:\BARCODE GENERATOR"
npm install
npm start
```

Open **http://127.0.0.1:3847** in your browser.

## Usage

1. **Label templates** — One sticker: size in mm, barcode area, text blocks, and (for plain PDF) labels per sheet.
2. **Page layouts** — Full **buyer sheet**: export your Illustrator/PDF art as **PNG or JPEG** at the real page size, upload it, set **header_regions** (where buyer, date, PO, style… print in mm) and **label_grid** (5×6 cells, etc.). **dynamic_fields_json** lists which inputs appear on **Generate** so the same layout works for every buyer.
3. **Generate** — Pick label + optional page layout, fill buyer fields, add items (CSV/lines), save, then preview or download PDF.
4. **Import** — Upload CSV, then **Send to label generator**.
5. **History** — Reopen past batches.
6. **Settings** — Paper size (A4 / Letter), margins (mm), optional default export path.

### Label layout JSON (`layout_json`)

- **`border`** — `{ "enabled": true, "width_pt": 1, "color": "#000000", "inset_mm": 0.3 }` draws a frame on **plain** PDFs and on **buyer sheets** (drawn last so it stays visible).
- **`blocks`** — In addition to `type: "text"` (with optional **`rotation_deg`**, e.g. `90` for vertical copy), you can add:
  - **`type": "image"`** — `"path": "uploads/your.png"` (repo-relative), plus `x_mm`, `y_mm`, `width_mm`, `height_mm`.
  - **`type": "line"`** — `x1_mm`, `y1_mm`, `x2_mm`, `y2_mm`, optional `dash` (e.g. `[2, 2]` in pt), `thickness`, `color` (`#hex`).

Coordinates are **mm from the top-left** of the label. Extra item keys (e.g. side codes) can be stored in **`extra_data_json`** and referenced by `field` on text blocks.

Data file: `data/app.db` (SQLite). Back up this file to preserve templates and history.

## Barcode types

Template default type should match your data: **Code128** (alphanumeric SKUs), **EAN-13**, **UPC-A**, **QR**, **Code39**. Invalid values show an error on the PDF in place of the barcode.

## Project layout

- `src/server.js` — HTTP server
- `src/routes/api.js` — REST API
- `src/services/` — Barcode, PDF, CSV, templates, batches, settings
- `src/db/` — Schema + seed
- `public/` — UI (static HTML/JS/CSS)

Port **3847** can be changed with `set PORT=3000` before `npm start`.
