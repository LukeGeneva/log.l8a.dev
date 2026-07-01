#!/usr/bin/env node
'use strict';
/**
 * OUTBOUND generator — no npm install, no framework, just Node core modules.
 *
 * Usage:
 *   node generate.js
 *
 * Reads:
 *   config.json        site name, tagline, dates, links
 *   data/apps.json      array of shipped/building apps
 *   data/log/*.md       one file per log entry (frontmatter + markdown body)
 *
 * Writes:
 *   dist/index.html     single self-contained page (CSS inlined, no JS required)
 *   dist/feed.xml        RSS feed of log entries
 *
 * Deploy by uploading dist/ anywhere — any host, any server you control.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const LOG_DIR = path.join(DATA_DIR, 'log');
const SRC_DIR = path.join(ROOT, 'src');
const DIST_DIR = path.join(ROOT, 'dist');
const SRC_IMG_DIR = path.join(SRC_DIR, 'img');
const DIST_IMG_DIR = path.join(DIST_DIR, 'img');

// ---------- helpers ----------

function readJSON(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(str) {
  return escapeHtml(str);
}

function stripMarkdown(md) {
  return md
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^- /gm, '')
    .replace(/\n/g, ' ')
    .replace(/  +/g, ' ')
    .trim();
}

// Minimal markdown: paragraphs, **bold**, *italic*, `code`, [text](url), "- " lists.
// Input is escaped first, so raw HTML in source files can never leak into output.
function renderMarkdown(raw) {
  const escaped = escapeHtml(raw.trim());
  const lines = escaped.split(/\r?\n/);
  const blocks = [];
  let listBuf = [];
  let paraBuf = [];

  function inline(text) {
    return text
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  }

  function flushList() {
    if (listBuf.length) {
      blocks.push('<ul>' + listBuf.map((li) => `<li>${inline(li)}</li>`).join('') + '</ul>');
      listBuf = [];
    }
  }

  function flushPara() {
    if (paraBuf.length) {
      blocks.push(`<p>${inline(paraBuf.join(' '))}</p>`);
      paraBuf = [];
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushPara();
      flushList();
      continue;
    }
    if (/^-\s+/.test(trimmed)) {
      flushPara();
      listBuf.push(trimmed.replace(/^-\s+/, ''));
      continue;
    }
    flushList();
    paraBuf.push(trimmed);
  }
  flushPara();
  flushList();
  return blocks.join('\n');
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const meta = {};
  match[1].split(/\r?\n/).forEach((line) => {
    const idx = line.indexOf(':');
    if (idx === -1) return;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  });
  return { meta, body: match[2] };
}

function loadLogEntries() {
  if (!fs.existsSync(LOG_DIR)) return [];
  const files = fs.readdirSync(LOG_DIR).filter((f) => f.endsWith('.md'));
  const entries = files.map((f) => {
    const raw = fs.readFileSync(path.join(LOG_DIR, f), 'utf8');
    const { meta, body } = parseFrontmatter(raw);
    return {
      date: meta.date || '',
      title: meta.title || f,
      app: meta.app || null,
      html: renderMarkdown(body),
      plain: body.trim().split(/\r?\n\r?\n/)[0] || ''
    };
  });
  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return entries;
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', timeZone: 'UTC' });
}

function daysSince(iso) {
  const start = new Date(iso + 'T00:00:00Z');
  const now = new Date();
  if (isNaN(start.getTime())) return 1;
  return Math.max(Math.floor((now - start) / 86400000) + 1, 1);
}

// ---------- load ----------

const config = readJSON(path.join(ROOT, 'config.json'), {});
const rawApps = readJSON(path.join(DATA_DIR, 'apps.json'), []);
const logEntries = loadLogEntries();

const sortedApps = rawApps.slice().sort((a, b) => (a.shipDate < b.shipDate ? 1 : a.shipDate > b.shipDate ? -1 : 0));
const displayApps = sortedApps.map((a, i) => Object.assign({}, a, { manifestNo: i + 1 }));
const shippedCount = displayApps.filter((a) => a.status === 'shipped').length;

// ---------- render pieces ----------

function platformTag(p) {
  return `<span class="tag">${escapeHtml(p)}</span>`;
}

function appCard(app) {
  const num = String(app.manifestNo).padStart(3, '0');
  const isShipped = app.status === 'shipped';
  const statusLabel = isShipped ? 'Shipped' : 'Building';
  const cardClass = isShipped ? 'card' : 'card is-building';
  const hasLink = app.link && app.link !== '#';
  const cta = hasLink
    ? `<a class="card-cta" href="${escapeHtml(app.link)}">Get it →</a>`
    : `<span class="card-cta card-cta--pending">Coming soon</span>`;
  return `
  <article class="${cardClass}">
    <div class="card-top">
      <span class="card-no">#${num}</span>
      <span class="card-status">${statusLabel}</span>
    </div>
    <h3 class="card-title">${escapeHtml(app.name)}</h3>
    <p class="card-tagline">${escapeHtml(app.tagline || '')}</p>
    <div class="card-tags">${(app.platforms || []).map(platformTag).join('')}</div>
    <div class="card-footer">
      <span class="card-date">${fmtDate(app.shipDate)}</span>
      ${cta}
    </div>
  </article>`;
}

const manifestSection = displayApps.length
  ? `<div class="project-grid">${displayApps.map(appCard).join('\n')}</div>`
  : `<div class="empty-state">
      <p class="empty-title">Nothing shipped yet</p>
      <p>The first project lands soon — check the log below for what's in progress.</p>
    </div>`;

function logItem(entry) {
  const appNote = entry.app ? `<span class="log-tag">${escapeHtml(entry.app)}</span>` : '';
  const shareUrl = `${(config.baseUrl || '').replace(/\/$/, '')}/#log-${entry.date}`;
  const sharePreview = escapeHtml(stripMarkdown(entry.plain));
  return `
  <div class="log-entry" id="log-${entry.date}">
    <div class="log-date">${fmtDate(entry.date)}</div>
    <div class="log-body">
      <h3 class="log-title">${escapeHtml(entry.title)}${appNote}</h3>
      ${entry.html}
      <button class="share-btn" data-url="${shareUrl}" data-title="${escapeHtml(entry.title)}" data-preview="${sharePreview}">share</button>
    </div>
  </div>`;
}

const logSection = logEntries.length
  ? logEntries.map(logItem).join('\n')
  : `<div class="empty-state"><p class="empty-title">No entries yet</p><p>The first log entry shows up here.</p></div>`;

const buildingNotice = config.building
  ? `<div class="hero-eyebrow"><span class="dot"></span>Currently building: ${escapeHtml(config.building)}</div>`
  : '';

const css = fs.readFileSync(path.join(SRC_DIR, 'style.css'), 'utf8');
const cssHash = crypto.createHash('sha256').update(css).digest('hex').slice(0, 8);
const cssFilename = `style.${cssHash}.css`;

const socialLinks = [];
if (config.links && config.links.github) socialLinks.push(`<a href="${escapeHtml(config.links.github)}">Source</a>`);
if (config.links && config.links.x) socialLinks.push(`<a href="${escapeHtml(config.links.x)}">Follow</a>`);
socialLinks.push(`<a href="feed.xml">RSS</a>`);

const homeUrl = config.homeUrl || '/';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(config.siteName)}</title>
<meta name="description" content="${escapeHtml(config.description || config.tagline || '')}">
<meta property="og:title" content="${escapeHtml(config.siteName)}">
<meta property="og:description" content="${escapeHtml(config.description || config.tagline || '')}">
<meta property="og:type" content="website">
<meta property="og:image" content="${escapeHtml((config.baseUrl || '').replace(/\/$/, ''))}/img/banner.jpg">
<meta property="og:image:width" content="1500">
<meta property="og:image:height" content="500">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escapeHtml((config.baseUrl || '').replace(/\/$/, ''))}/img/banner.jpg">
<meta name="theme-color" content="#0a1410">
<link rel="icon" type="image/png" href="img/favicon.png">
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(config.siteName || 'log')}" href="feed.xml">
<link rel="stylesheet" href="${cssFilename}">
</head>
<body>

<nav class="nav">
  <div class="wrap nav-row">
    <a class="nav-home" href="${escapeHtml(homeUrl)}">← ${escapeHtml(homeUrl.replace(/^https?:\/\//, ''))}</a>
    <span class="nav-current">log</span>
  </div>
</nav>

<header class="hero">
  <div class="wrap">
    ${buildingNotice}
    <h1 class="hero-title">Captain's  <span class="accent">Log</span></h1>
    <div class="hero-stats">
      <div class="stat"><b>${shippedCount}</b><span>shipped</span></div>
      <div class="stat"><b>${daysSince(config.startDate)}</b><span>days running</span></div>
    </div>
    <div class="panel">
      <p>${escapeHtml(config.tagline || '')}</p>
      <p>Projects below are real and dated. The log underneath is the actual day-to-day: what got built, what didn't, what I'd do differently.</p>
    </div>
  </div>
</header>

<main>
  <section class="section" id="projects">
    <div class="wrap">
      <div class="section-head">
        <h2 class="section-title">Projects</h2>
        <span class="section-count">${displayApps.length} ${displayApps.length === 1 ? 'entry' : 'entries'}</span>
      </div>
      ${manifestSection}
    </div>
  </section>

  <section class="section" id="log">
    <div class="wrap">
      <div class="section-head">
        <h2 class="section-title">Log</h2>
        <span class="section-count">${logEntries.length} ${logEntries.length === 1 ? 'entry' : 'entries'}</span>
      </div>
      ${logSection}
    </div>
  </section>
</main>

<footer class="footer">
  <div class="wrap" style="display:flex;justify-content:space-between;width:100%;flex-wrap:wrap;gap:12px;">
    <span>No SaaS. No tracking. Self-hosted.</span>
    <span>${socialLinks.join(' · ')}</span>
  </div>
</footer>

<script>
document.querySelectorAll('.share-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const parts = [btn.dataset.title];
    if (btn.dataset.preview) parts.push(btn.dataset.preview);
    parts.push(btn.dataset.url);
    navigator.clipboard.writeText(parts.join('\\n\\n')).then(() => {
      btn.textContent = 'copied!';
      setTimeout(() => { btn.textContent = 'share'; }, 1500);
    });
  });
});
</script>

</body>
</html>
`;

const rssItems = logEntries
  .map((e) => {
    const link = (config.baseUrl || '').replace(/\/$/, '') + '/#log';
    return `
    <item>
      <title>${escapeXml(e.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">${escapeXml(e.date + '-' + e.title)}</guid>
      <pubDate>${new Date(e.date + 'T00:00:00Z').toUTCString()}</pubDate>
      <description>${escapeXml(e.plain)}</description>
    </item>`;
  })
  .join('');

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(config.siteName)}</title>
    <link>${escapeXml(config.baseUrl || '')}</link>
    <description>${escapeXml(config.description || config.tagline || '')}</description>
    ${rssItems}
  </channel>
</rss>
`;

// ---------- write ----------

fs.mkdirSync(DIST_DIR, { recursive: true });
fs.mkdirSync(DIST_IMG_DIR, { recursive: true });

// Copy static images from src/img/ to dist/img/
if (fs.existsSync(SRC_IMG_DIR)) {
  fs.readdirSync(SRC_IMG_DIR).forEach((f) => {
    fs.copyFileSync(path.join(SRC_IMG_DIR, f), path.join(DIST_IMG_DIR, f));
  });
}

// Remove stale fingerprinted CSS files before writing the new one
fs.readdirSync(DIST_DIR)
  .filter((f) => /^style\.[a-f0-9]+\.css$/.test(f) && f !== cssFilename)
  .forEach((f) => fs.unlinkSync(path.join(DIST_DIR, f)));

fs.writeFileSync(path.join(DIST_DIR, cssFilename), css, 'utf8');
fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html, 'utf8');
fs.writeFileSync(path.join(DIST_DIR, 'feed.xml'), rss, 'utf8');

console.log(`Built dist/index.html (${displayApps.length} apps, ${logEntries.length} log entries)`);
console.log(`Built dist/${cssFilename}`);
console.log(`Built dist/feed.xml`);
