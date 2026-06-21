# log.l8a.dev

My personal captain's log. Tracks every project I'm building: shipped apps,
days running, and a chronological log of what actually happened.

One Node script (`generate.js`) reads two data files and writes a
self-contained `dist/` folder. No npm install, no framework.

## Build

```
node generate.js
```

Output: `dist/index.html`, `dist/style.<hash>.css`, `dist/feed.xml`.

## Deploy

```
./deploy.sh
```

Builds and rsyncs `dist/` to the VPS at `log.l8a.dev`.

## Add a project

Edit `data/apps.json`. Append to keep manifest numbers (No. 001, 002...)
in ship order.

```json
{
  "name": "My App",
  "tagline": "One sentence.",
  "status": "shipped",
  "shipDate": "2026-06-21",
  "link": "https://github.com/LukeGeneva/my-app",
  "platforms": ["macOS"]
}
```

- `status`: `"shipped"` or `"building"`
- `link`: omit or `"#"` while in progress — shows "Coming soon"

## Add a log entry

Create a file in `data/log/` (date-prefix for your own sorting):

```
---
date: 2026-06-21
title: Day 4 — whatever shipped
appId: my-app
---
What got built, what didn't, what I'd do differently.
**bold**, *italic*, `code`, [links](https://example.com), and "- " lists work.
```

`appId` is optional — adds a tag next to the entry title.

## Config

`config.json` — site name, tagline, author, URLs, and `"building"` (the
"currently building" notice in the header — set to `""` to hide it).
