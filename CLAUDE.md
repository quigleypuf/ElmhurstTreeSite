# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static website that displays Elmhurst University's campus tree database. Visitors can search for a tree by ID, browse the full list, and view a per-tree detail page with information, a Leaflet map of the tree's location, and a photo when one is available. There is no backend — Apache serves static files and the database is queried in the browser.

## Running locally

The site **must be served over HTTP**, not opened with `file://`. `db.js` uses `fetch()` to load `trees.db`, which fails on the `file:` protocol in every modern browser.

```
python3 -m http.server 8000
# then visit http://localhost:8000/
```

There is no build step, no package manager, no test runner. Edit a file and reload the browser.

## Architecture

**The database lives in the browser.** `trees.db` is a real SQLite file. `db.js` lazy-loads sql.js (a WebAssembly build of SQLite) from cdnjs, fetches `trees.db` as an ArrayBuffer, and exposes three async methods on a global `TreeDB`:

- `TreeDB.getTree(id)` — full row for one tree, or `null`
- `TreeDB.hasTree(id)` — boolean existence check used by the search form
- `TreeDB.listTrees()` — minimal projection (`tree_id, tree_name, dedication_type, age_class`) for the homepage table

Both HTML pages call these directly. There is no JSON intermediate, no API, no JS data file. Do **not** introduce a backend or convert to JSON unless the requirement explicitly demands it — the in-browser approach is a deliberate architectural choice and works fine on Apache with no extra software.

**NULL coercion convention.** `db.js`'s `rowToObject()` converts SQL NULLs to empty strings before returning rows. The rest of the code is written assuming every field is a string, never `null`/`undefined`. Preserve this when adding new columns or queries.

**The "N/A" pattern.** The dataset uses three forms of "missing" interchangeably: SQL `NULL`, empty string `""`, and the literal text `"N/A"`. Both `index.html` and `tree.html` define inline helpers (`hasValue`, `hasYear`, `displayValue`) that treat all three as absent. When rendering optional fields, route them through these helpers — don't check for `null` or `""` directly.

**Page flow.** Two HTML files, navigation by query string:

- `index.html` — search bar at top + table of every tree under it. Submitting the search calls `TreeDB.hasTree()` before navigating; the table loads once on page load.
- `tree.html?id=N` — fetches one tree, renders sections in this order: photo (if `image_path` is set) → header → optional dedication → tree info table → Leaflet map → QR code. The render function builds an HTML string and injects via `innerHTML`, then initializes the map and QR code against the freshly-injected DOM nodes.

**Tree photos.** When `tree.image_path` is non-empty, `tree.html` renders an `<img>` whose `src` is the path verbatim from the DB (e.g. `images/1.jpeg`). The `images/` directory is keyed by tree ID with mixed `.jpg`/`.jpeg` extensions; the DB column stores the full extension so don't construct paths from `tree_id` alone.

**Database schema.** Single table `trees` with these columns (all are referenced by the rendering code, so dropping or renaming any will silently break the UI):

```
tree_id (INTEGER PK), tree_name, latitude, longitude,
dedication_type, dedication_year, dedication_honoree, dedication_desc,
scientific_name, additional_taxonomy,
height_class, diameter_breast_height, age_class, canopy_radius, condition,
image_path
```

## CDN dependencies (loaded via `<script>` / `<link>`)

- sql.js 1.10.3 — used by `db.js`
- Leaflet 1.9.4 — used by `tree.html` for the map; tiles are OpenStreetMap
- QRCode.js 1.0.0 — used by `tree.html` for the share-this-tree QR

**Do not add Subresource Integrity (`integrity="sha512-..."`) attributes by hand.** A wrong hash silently blocks the resource — Leaflet broke this way in earlier development and showed up as a blank white square because the JS never ran. If SRI is wanted, copy the exact hash cdnjs publishes for the version, don't compose it from memory.

**Leaflet `invalidateSize()` quirk.** `tree.html`'s `renderMap()` schedules `map.invalidateSize()` 100ms after init. This is intentional — when Leaflet is initialized against a container that was just injected via `innerHTML`, it sometimes measures the container before layout completes and renders a blank map. Don't remove the timeout.

## Deployment

Production target is an AWS EC2 Amazon Linux 2 instance running Apache (`httpd`). The deployment workflow is:

1. Push to GitHub.
2. SSH in, `cd ~/elmhurst-trees && git pull` (the repo is cloned to the home dir, not directly to the doc root).
3. `sudo rsync -av --delete --exclude='.git' --exclude='.gitignore' --exclude='README.md' --exclude='CLAUDE.md' ~/elmhurst-trees/ /var/www/html/`
4. `sudo chown -R apache:apache /var/www/html`

No service restart needed — these are static files. If you hit a 403 after a deploy, run `sudo restorecon -Rv /var/www/html` (SELinux contexts).

`trees.db` is a binary file in the repo. Make sure it isn't excluded by `.gitignore` — if `*.db` is gitignored the database won't reach the server and every page will silently fail to load data.

## Background image

`BackgroundImage.jpeg` (large file in repo root) is the body background, fixed and `cover`-sized. The main content blocks (`.page` on tree pages, `.tree-list-section` on the homepage) have semi-transparent white card backgrounds layered over it so the underlying photo doesn't make tables and forms unreadable. If you change the body background, also revisit those card opacities.

`background-attachment: fixed` does not work reliably on iOS Safari; the image will still display but won't stay pinned during scroll. Switching to a `position: fixed` pseudo-element is the standard workaround if iOS behavior matters.
