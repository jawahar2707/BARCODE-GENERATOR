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

1. **Templates** — Define label size in mm, barcode area, text blocks, and sheet grid (labels per page). A **54×20 mm** sample template is created on first run.
2. **Generate** — Create a batch, add rows (or quick-paste lines / CSV), save items, then preview or download PDF. Use the PDF viewer’s **Print** for the printer.
3. **Import** — Upload CSV, then **Send to label generator**.
4. **History** — Reopen past batches.
5. **Settings** — Paper size (A4 / Letter), margins (mm), optional default export path.

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
