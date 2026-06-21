# OUTBOUND

A self-owned build log and app directory. No SaaS, no framework, no npm install.
One Node script (`generate.js`) reads two data files and writes a single
self-contained `dist/index.html` plus an RSS feed. Upload that file anywhere —
that's the whole deploy.

## Run it

```
node generate.js
```

That's the entire build step. Output goes to `dist/index.html` and `dist/feed.xml`.

## Add a shipped app

Edit `data/apps.json`. Each entry:

```json
{
  "id": "clipboard-tool",
  "name": "Snapclip",
  "tagline": "A menu bar clipboard manager that cleans formatting on paste.",
  "platforms": ["macOS"],
  "status": "shipped",
  "shipDate": "2026-06-19",
  "link": "https://example.com/downloads/snapclip.dmg"
}
```

- `status` is `"shipped"` or `"building"` — building apps show an amber
  "In transit" stamp instead of the red "Shipped" one.
- `link` can be omitted or left as `"#"` while still in progress — the card
  will show "Coming soon" instead of a dead link.
- Manifest numbers (No. 001, 002...) are assigned by position in this file,
  so keep new entries appended in the order you actually ship them.

## Add a log entry

Create a new file in `data/log/`, named however you like (date-prefixed is
just for your own sorting convenience on disk — the page sorts by the `date`
field, not the filename):

```
---
date: 2026-06-19
title: Day 2 — Snapclip ships
appId: clipboard-tool
---
What you built, why, and what you'd do differently. Plain markdown:
**bold**, *italic*, `code`, [links](https://example.com), and "- " lists
all work. No headings needed — keep entries conversational.
```

`appId` is optional — it just adds a small tag next to the entry title.

## Update the "currently building" notice

`config.json` → `"building"` field. Set it to whatever you're actively
working on, or `""` to hide the line entirely.

## Deploy

`dist/index.html` is fully self-contained (CSS inlined, no JS required to
render). Put it on literally anything you control:

- `scp dist/index.html dist/feed.xml you@yourserver:/var/www/html/`
- drop it on any static host you already run
- even open it locally — it doesn't fetch anything external

No build pipeline, no hosted dashboard, no recurring bill, nothing to
migrate off of later.

## Why no markdown library, no static site framework, no CSS framework

Because the entire point of this project is owning the stack. The markdown
support in `generate.js` is intentionally minimal (bold/italic/code/links/
lists) — enough for build-log entries, not a general-purpose parser. If you
outgrow it, extend `renderMarkdown()` directly; it's about 30 lines.
