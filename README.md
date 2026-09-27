# Grove

**You are made of what you repeat.**

Grove is a free, local-first habit tracker. Plant a habit, log a day in one tap, and watch a year of activity fill in as one living field. No account: everything lives in your browser's local storage, with JSON export/import for backups.

Live: https://grove-habit-tracker-vert.vercel.app

## Pages

- `index.html` — landing page. A three.js particle field where points of light assemble into a human figure (the person your habits are building), with a short camera choreography, a product preview and honest product facts.
- `app.html` (served as `/app`) — the tracker: habits sidebar, "Log today", weekly tap-to-log grid, the heatmap field with five zoom levels, weekly totals chart, rename/remove dialogs, keyboard shortcuts, export/import.

## Stack

Plain HTML, CSS and JavaScript. three.js r160 (ES module from jsDelivr) for the landing background. No build step. Deployed on Vercel as a static site (`vercel.json` enables clean URLs).

## Keyboard shortcuts (app)

| Key | Action |
| --- | --- |
| `N` | New habit |
| `T` | Log today (+1) |
| `1`–`5` | Range: week, month, 3 months, 6 months, year |
| `J` / `K` | Next / previous habit |
| `Esc` | Close dialog |

## Data

Stored in `localStorage` under `grove:` keys (`grove:habits-index`, `grove:habit:<id>`). The format is unchanged from the first version, so existing data keeps working. Export a backup from the sidebar at any time.

## Run locally

Any static server works, for example:

```bash
npx serve .
```

Then open the printed URL (the landing) and `/app`.
