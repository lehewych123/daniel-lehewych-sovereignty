#!/usr/bin/env node
/**
 * Daily Article Discovery — global search + authorship + language gating (Node 20+, no deps)
 *
 * Improvements in this version:
 * - Dedup by *normalized* URL up front (kills UTM/fbclid/etc).
 * - Generic non-article guard: rejects any /topic|tag|category|author|search/ paths.
 * - Safe Option-B support: reads & writes either plain array OR { metadata, articles }.
 * - Keeps strict authorship + language checks and blocklists.
 *
 * Env:
 *   GOOGLE_API_KEY, SEARCH_ENGINE_ID
 * Optional:
 *   DISCOVERY_DATE_WINDOW (default "d14"),
 *   DISCOVERY_VERIFY ("true" | "false", default "true"),
 *   DISCOVERY_LANG (default "en"),
 *   DISCOVERY_BLOCKLIST (comma-separated hosts, e.g. "gesahkita.com,example.net")
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// ---------- Config ----------
const AUTHOR_NAME = 'Daniel Lehewych';
const DATE_WINDOW = process.env.DISCOVERY_DATE_WINDOW || 'd14';
const VERIFY_AUTHOR = (process.env.DISCOVERY_VERIFY || 'true').toLowerCase() === 'true';
const PRIMARY_LANG = (process.env.DISCOVERY_LANG || 'en').toLowerCase();

// Domains we never want (social/link shorteners/search engines/caches)
const EXCLUDE_HOSTS_BASE = new Set([
  'daniellehewych.org',
  'webcache.googleusercontent.com','google.com','news.google.com',
  'bing.com','duckduckgo.com','yahoo.com',
  'facebook.com','m.facebook.com','twitter.com','x.com','t.co','linkedin.com','lnkd.in',
  'reddit.com','www.reddit.com','r.jina.ai','getpocket.com','feedly.com','flipboard.com',
  // also exclude these if unwrapping somehow fails
  'safelinks.protection.outlook.com','safelinks.office.net','urldefense.com'
]);

// Tunable blocklist (env) + sensible defaults
const EXTRA_BLOCKLIST = (process.env.DISCOVERY_BLOCKLIST || 'gesahkita.com,gesahkita.id')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

// ---------- Patterns (preserved) ----------
const topicPatterns = {
  "Philosophy": /philosoph|metaphysics|epistemology|ontology|phenomenology|existential/i,
  "Ethics": /\b(ethics|moral|virtue|good|evil|justice|deontolog|consequential)\b/i,
  "Consciousness": /consciousness|mind|awareness|subjective|qualia|cogniti|sentien/i,
  "Free Will": /free will|determinism|agency|choice|volition|compatibil/i,
  "AI & Technology": /artificial intelligence|AI|machine learning|ML|LLM|AGI|algorithm|technolog|digital|computer/i,
  "AI Ethics": /AI ethics|machine ethics|robot rights|algorithmic bias|AI safety/i,
  "Digital Culture": /digital|internet|online|social media|cyber|virtual|metaverse/i,
  "Healthcare": /health|medical|medicine|doctor|patient|treatment|therapy|disease|clinical/i,
  "Fitness & Nutrition": /fitness|exercise|workout|nutrition|diet|supplement|muscle|training|protein/i,
  "Mental Health": /mental health|depression|anxiety|therapy|wellbeing|mindfulness/i,
  "Longevity": /longevity|aging|lifespan|anti-aging|healthspan/i,
  "Politics & Society": /politic|democra|society|social|governance|policy|government|civic/i,
  "Economics": /economic|market|finance|money|business|capitalism|trade|GDP|inflation/i,
  "Education": /education|learning|teaching|school|academic|university|knowledge|pedagog/i,
  "Work & Career": /work|career|job|employment|workplace|remote|office|professional|labor|quit|resign/i,
  "Writing & Creativity": /writing|writer|creative|author|literature|story|narrative|fiction/i,
  "Psychology": /psycholog|mental|emotion|feeling|therapy|trauma|behavioral|cognitive/i,
  "Religion & Spirituality": /god|divine|theology|religious|faith|buddhis|christian|sacred/i,
  "Science": /science|scientific|research|study|experiment|data|evidence|empirical/i,
  "Climate & Environment": /climate|environment|sustainability|carbon|renewable|ecology/i
};

const typePatterns = {
  "ScholarlyArticle": /phenomenology|epistemology|metaphysics|ontology|dialectic|philosophical|examine|analysis of|critique|dissertation/i,
  "OpinionNewsArticle": /\b(opinion|should|must|need to|why we|it's time|we need|believe|argue|contend)\b/i,
  "HowTo": /how to|guide to|tips for|steps to|ways to|tutorial|strategies|method|technique|here's how/i,
  "AnalysisNewsArticle": /analysis|analyzing|trend|future of|landscape|forecast|examining|impact of|data shows/i,
  "Review": /review|reviewing|assessment of|evaluation|critique of|book review|product review/i,
  "BlogPosting": /./
};

const publisherData = {
  "Medium": {
    "@type": "Organization",
    "name": "Medium",
    "logo": {"@type":"ImageObject", "url":"https://miro.medium.com/max/616/1*OMF3fSqH8t4xBJ9-6oZDZw.png","width":616,"height":616}
  },
  "Newsweek": {
    "@type": "Organization",
    "name": "Newsweek",
    "logo": {"@type":"ImageObject","url":"https://www.newsweek.com/favicon.ico","width":32,"height":32}
  },
  "BigThink": {
    "@type": "Organization",
    "name": "Big Think",
    "logo": {"@type":"ImageObject","url":"https://bigthink.com/favicon.ico","width":32,"height":32}
  }
};

// ---------- Utils ----------
function unwrapUrl(u){
  try{
    const url = new URL(u);
    const host = url.hostname.toLowerCase();
    // Microsoft SafeLinks
    if (host.endsWith('safelinks.protection.outlook.com') || host.endsWith('safelinks.office.net')) {
      const inner = url.searchParams.get('url');
      if (inner) return unwrapUrl(decodeURIComponent(inner));
    }
    // Proofpoint-style URLDefense
    if (host === 'urldefense.com') {
      const m = url.pathname.match(/__([^_]+)__/);
      if (m) return unwrapUrl(decodeURIComponent(m[1]));
    }
    return u;
  } catch { return u; }
}

function normalizeUrl(input, canonicalHref) {
  try {
    const raw = new URL(canonicalHref || input);
    const dropParams = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','gclid','fbclid','mc_cid','mc_eid','igshid','ref','ref_src'];
    dropParams.forEach(p => raw.searchParams.delete(p));
    if (raw.pathname !== '/' && raw.pathname.endsWith('/')) raw.pathname = raw.pathname.slice(0, -1);
    raw.pathname = raw.pathname.replace(/\/(index|home)\.(html?|php)$/i, '');
    raw.host = raw.host.toLowerCase().replace(/^www\./,'');
    raw.hash = '';
    return `${raw.protocol}//${raw.host}${raw.pathname}${raw.search}`;
  } catch {
    return input;
  }
}
const canon = u => normalizeUrl(unwrapUrl(u));

function isKnownNonArticleUrl(u){
  // Generic guard + some site-specifics
  let parsed;
  try { parsed = new URL(u); } catch { return false; }
  const host = parsed.hostname.replace(/^www\./,'').toLowerCase();
  const path = parsed.pathname.toLowerCase();

  // Generic: topic/tag/category/author/search sections are almost never articles
  if (/\/(topic|topics|tag|tags|category|categories|author|authors|search|photos|video|index)\//.test(path)) return true;

  // Site-specific sanity
  if (host.includes('medium.com') && /^\/tag\//.test(path)) return true;
  if (host.includes('bigthink.com') && /^\/topics?\//.test(path)) return true;

  return false;
}

function contentFingerprint(title, subtitle=''){ return crypto.createHash('sha256').update(`${title}\n${subtitle}`.toLowerCase().trim()).digest('hex'); }
function formatDate(s){ const d=new Date(s); return d.toISOString().slice(0,10); }
function generateEmailSubject(a,isUpdate=false,v=1){ return `${isUpdate?`SOV-ARCH UPDATE v${v}`:'SOV-ARCH NEW'} · ${a.platform} · "${a.title}" · ${formatDate(a.date)}`; }
function safeHost(u){ try{ return new URL(u).hostname.replace(/^www\./,''); }catch{return ''; } }
function hostMatches(host, list){
  host = (host || '').toLowerCase();
  return Array.isArray(list) && list.some(b => host === b || host.endsWith('.'+b));
}

async function writeJSON(file, obj){
  const dir = path.dirname(file);
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(file, JSON.stringify(obj, null, 2));
}
async function writeText(file, text){
  const dir = path.dirname(file);
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(file, text);
}

// HTML fetch with timeout
async function fetchHtml(url, timeoutMs=8000){
  const ac = new AbortController();
  const t = setTimeout(()=>ac.abort(), timeoutMs);
  try{
    const res = await fetch(url, { signal: ac.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml\+xml/i.test(ct)) return '';
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// Verify authorship in HTML
function htmlHasAuthor(html, author = AUTHOR_NAME){
  if (!html) return false;
  const name = author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const bylineRe = new RegExp(`\\bby\\s+${name}\\b`, 'i');
  const metaAuthorRe = new RegExp(`<meta[^>]+(?:name|property)=["'](?:author|article:author)["'][^>]+content=["'][^"']*${name}[^"']*["']`, 'i');
  const jsonLdRe = new RegExp(`"author"\\s*:\\s*(?:\\{[^}]*?"name"\\s*:\\s*"(?:[^"]*${name}[^"]*)"[^}]*\\}|"${name}")`, 'i');
  return bylineRe.test(html) || metaAuthorRe.test(html) || jsonLdRe.test(html);
}

// Naive language detection (lang/locale + stopword fallback)
function detectLang(html){
  if (!html) return null;
  const langAttr = html.match(/<html[^>]*\blang=["']?([a-zA-Z-_.]+)["']?[^>]*>/i)?.[1];
  if (langAttr) return langAttr.toLowerCase().split(/[_-]/)[0];
  const ogLocale = html.match(/<meta[^>]+property=["']og:locale["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (ogLocale) return ogLocale.toLowerCase().split(/[_-]/)[0];

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/\s+/g,' ')
    .slice(0, 4000)
    .toLowerCase();

  const stops = [' the ',' and ',' to ',' of ',' a ',' in ',' that ',' is ',' for ',' on '];
  const hits = stops.reduce((acc, w) => acc + (text.includes(w) ? 1 : 0), 0);
  return hits >= 3 ? 'en' : 'other';
}

// ---------- DB helpers (array or Option-B) ----------
async function loadDB(dbPath){
  let isOptionB = false;
  let dbContainer = null;
  let existing = [];
  try {
    const raw = JSON.parse(await fs.readFile(dbPath,'utf8'));
    if (Array.isArray(raw)) {
      existing = raw;
    } else if (raw && Array.isArray(raw.articles)) {
      isOptionB = true;
      dbContainer = raw;
      existing = raw.articles;
    } else {
      existing = [];
    }
  } catch {
    existing = [];
  }
  return { isOptionB, dbContainer, existing };
}

async function saveDB(dbPath, isOptionB, dbContainer, arr){
  if (isOptionB) {
    dbContainer = dbContainer || {};
    dbContainer.articles = arr;
    dbContainer.metadata = dbContainer.metadata || {};
    dbContainer.metadata.totalArticles = arr.length;
    dbContainer.metadata.processedArticles = arr.length;
    dbContainer.metadata.pendingArticles = 0;
    dbContainer.metadata.exportDate = new Date().toISOString();
    const counts={};
    for (const a of arr){ const k=(a.platform||'Unknown'); counts[k]=(counts[k]||0)+1; }
    dbContainer.metadata.platforms = counts;
    await writeJSON(dbPath, dbContainer);
  } else {
    await writeJSON(dbPath, arr);
  }
}

// ---------- Main ----------
async function discoverNewArticles(){
  console.log('Starting article discovery (global)…');
  const API_KEY = process.env.GOOGLE_API_KEY;
  const SEARCH_ID = process.env.SEARCH_ENGINE_ID;
  if (!API_KEY || !SEARCH_ID){
    console.log('GOOGLE_API_KEY or SEARCH_ENGINE_ID not set; exiting 0.');
    process.exit(0);
  }

  // Load DB (array or Option-B)
  const dbPath = path.join(__dirname, '..', 'data', 'articles.json');
  const { isOptionB, dbContainer, existing } = await loadDB(dbPath);
  let existingArr = Array.isArray(existing) ? existing.slice() : [];

  // Useful maps for quick lookups
  const existingByNorm = new Map();
  for (const a of existingArr){
    const key = canon(a.url || a.normalizedUrl || '');
    if (key) existingByNorm.set(key, a);
  }

  // Global queries
  const queries = [
    `"${AUTHOR_NAME}"`,
    `"by ${AUTHOR_NAME}"`,
    `author:"${AUTHOR_NAME}"`
  ];

  // Google CSE search
  async function cseSearch(q){
    const url = `https://www.googleapis.com/customsearch/v1?key=${API_KEY}&cx=${SEARCH_ID}&q=${encodeURIComponent(q)}&num=10&dateRestrict=${encodeURIComponent(DATE_WINDOW)}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(()=> '');
      throw new Error(`CSE HTTP ${res.status}: ${text.slice(0,200)}`);
    }
    const data = await res.json();
    return Array.isArray(data.items) ? data.items : [];
  }

  // Collect & pre-filter
  const rawResults = [];
  for (const q of queries){
    try{
      console.log(`Query: ${q}`);
      const items = await cseSearch(q);
      rawResults.push(...items);
      console.log(` → ${items.length} items`);
      await new Promise(r=>setTimeout(r,250));
    }catch(err){
      console.error(`Search failed for "${q}": ${err.message}`);
    }
  }

  // Dedup across queries by *normalized* URL + reject non-articles & blocked hosts
  const seen = new Set();
  const candidates = [];
  for (const r of rawResults){
    const link = unwrapUrl(r.link);
    const norm = canon(link);
    if (!norm) continue;

    const host = (safeHost(norm) || '').toLowerCase();
    if (!host || EXCLUDE_HOSTS_BASE.has(host) || hostMatches(host, EXTRA_BLOCKLIST)) continue;
    if (isKnownNonArticleUrl(norm)) continue;

    if (!seen.has(norm)){
      seen.add(norm);
      candidates.push({ ...r, link: link });
    }
  }

  console.log(`Candidates after filtering/dedup: ${candidates.length}`);

  // Iterate: skip if already in DB; fetch for language/authorship
  const processed = [];
  const updates = [];
  const skipped = []; // {title,url,host,reason}

  for (const r of candidates){
    const cleanLink = r.link;
    const norm = canon(cleanLink);

    // Already stored?
    const found = existingByNorm.get(norm);
    if (found) {
      // Optional: update detection if fingerprint changed (only meaningful if existing has one)
      const fp = contentFingerprint(cleanTitle(r.title || ''), r.snippet || '');
      if (found.fingerprint && found.fingerprint !== fp) {
        if (!isKnownNonArticleUrl(cleanLink)) {
          let ok = true;
          if (VERIFY_AUTHOR) {
            let html = '';
            try { html = await fetchHtml(cleanLink); } catch {}
            ok = html && htmlHasAuthor(html, AUTHOR_NAME);
          }
          if (ok) updates.push({ searchResult: r, existing: found });
        }
      }
      continue;
    }

    // Fetch HTML once for lang + authorship checks
    let html = '';
    try {
      html = await fetchHtml(cleanLink);
    } catch (e) {
      skipped.push({ title: cleanTitle(r.title || ''), url: cleanLink, host: safeHost(cleanLink), reason: `fetch-failed: ${e.message}` });
      continue;
    }

    // Language gate
    const lang = detectLang(html) || 'other';
    if (PRIMARY_LANG && lang !== PRIMARY_LANG) {
      skipped.push({ title: cleanTitle(r.title || ''), url: cleanLink, host: safeHost(cleanLink), reason: `language=${lang}` });
      continue;
    }

    // Optional authorship verification (reduces false positives)
    if (VERIFY_AUTHOR){
      if (!htmlHasAuthor(html, AUTHOR_NAME)) {
        skipped.push({ title: cleanTitle(r.title || ''), url: cleanLink, host: safeHost(cleanLink), reason: 'author-mismatch' });
        continue;
      }
    }

    processed.push(r);
    await new Promise(r=>setTimeout(r,150));
  }

  console.log(`New potential articles: ${processed.length}`);
  console.log(`Potential updates: ${updates.length}`);
  console.log(`Skipped (for review): ${skipped.length}`);

  if (processed.length === 0 && updates.length === 0){
    await saveProcessedArticles([], 0, 0, skipped);
    console.log('Nothing new today.');
    return;
  }

  // Process new
  const newArticles = [];
  for (const a of processed){
    const p = await processArticle(a, false);
    newArticles.push(p);
    await writeOutboxArtifacts(p);
  }

  // Process updates (preserve original date + stored URL when present)
  const updatedArticles = [];
  for (const {searchResult, existing: ex} of updates){
    const p = await processArticle(
      searchResult,
      true,
      (ex.version || 1),
      ex.date || null,
      ex.url ? unwrapUrl(ex.url) : null
    );
    updatedArticles.push({ ...p, version: (ex.version || 1) + 1, previousFingerprint: ex.fingerprint });
    await writeOutboxArtifacts(p);
  }

  // Save full artifacts + grouped notification
  await saveProcessedArticles([...newArticles, ...updatedArticles], newArticles.length, updatedArticles.length, skipped);

  // ---- Persist to DB (array or Option-B) ----
  // Shape new entries compactly, but keep extra fields (normalizedUrl, fingerprint, etc.)
  const nextIdStart = (existingArr.reduce((m,a)=>Math.max(m, Number(a.id)||0), 0) || 0) + 1;

  const toStoreNew = newArticles.map((p, idx) => ({
    id: nextIdStart + idx,
    platform: p.platform,
    title: p.title,
    subtitle: "",
    url: p.url,
    normalizedUrl: canon(p.url),
    date: p.date,
    wordCount: 0,
    topics: p.topics || [],
    status: "processed",
    snippet: p.snippet,
    fingerprint: p.fingerprint,
    version: 1,
    schemas: { urlSlug: p.urlSlug, type: p.type, topics: p.topics },
    discoveredAt: p.discoveredAt
  }));

  existingArr.push(...toStoreNew);

  // Apply updates (fingerprint bump, title/snippet refresh)
  for (const u of updatedArticles){
    const norm = canon(u.url);
    const i = existingArr.findIndex(a => canon(a.url || a.normalizedUrl || '') === norm);
    if (i !== -1){
      existingArr[i] = {
        ...existingArr[i],
        title: u.title,
        snippet: u.snippet,
        fingerprint: u.fingerprint,
        version: u.version,
        lastUpdated: new Date().toISOString()
      };
    }
  }

  await saveDB(dbPath, isOptionB, dbContainer, existingArr);
  console.log('Discovery complete.');
}

// ---------- Processing & generators ----------
async function processArticle(searchResult, isUpdate=false, currentVersion=1, existingDate=null, existingUrl=null){
  const title = cleanTitle(searchResult.title || '');
  con
