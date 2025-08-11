#!/usr/bin/env node
/**
 * Daily Article Discovery — global search + authorship + language gating (Node 20+, no deps)
 *
 * What this does:
 * - Queries Google Programmable Search across the whole web for your name/byline.
 * - Dedupes by normalized URL + fingerprint (title + snippet).
 * - Verifies authorship by fetching the page and checking:
 *     • <meta name="author"> / <meta property="article:author">
 *     • JSON-LD "author" name
 *     • Visible "by Daniel Lehewych" in HTML
 * - Language gate (default en): inspects <html lang>, og:locale, and a tiny stopword heuristic.
 * - Domain blocklist via env + preblocked spammy host(s).
 * - Writes:
 *     • data/articles.json (master DB; only if new items)
 *     • data/new-articles-full.json (full entries for new/updated)
 *     • data/notification.md (human report; grouped + includes code blocks)
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
  'reddit.com','www.reddit.com','r.jina.ai','getpocket.com','feedly.com','flipboard.com'
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
function normalizeUrl(input, canonicalHref) {
  try {
    const raw = new URL(canonicalHref || input);
    const dropParams = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','gclid','fbclid','mc_cid','mc_eid','igshid','ref','ref_src'];
    dropParams.forEach(p => raw.searchParams.delete(p));
    if (raw.pathname !== '/' && raw.pathname.endsWith('/')) raw.pathname = raw.pathname.slice(0, -1);
    raw.pathname = raw.pathname.replace(/\/(index|home)\.(html?|php)$/i, '');
    raw.host = raw.host.toLowerCase();
    raw.hash = '';
    return `${raw.protocol}//${raw.host}${raw.pathname}${raw.search}`;
  } catch {
    return input;
  }
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

// ---------- Main ----------
async function discoverNewArticles(){
  console.log('Starting article discovery (global)…');
  const API_KEY = process.env.GOOGLE_API_KEY;
  const SEARCH_ID = process.env.SEARCH_ENGINE_ID;
  if (!API_KEY || !SEARCH_ID){
    console.log('GOOGLE_API_KEY or SEARCH_ENGINE_ID not set; exiting 0.');
    process.exit(0);
  }

  // Load DB
  const dbPath = path.join(__dirname, '..', 'data', 'articles.json');
  let existing = [];
  try { existing = JSON.parse(await fs.readFile(dbPath,'utf8')); } catch { console.log('No existing DB.'); }

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

  const all = [];
  for (const q of queries){
    try{
      console.log(`Query: ${q}`);
      const items = await cseSearch(q);
      all.push(...items);
      console.log(` → ${items.length} items`);
      await new Promise(r=>setTimeout(r,250));
    }catch(err){
      console.error(`Search failed for "${q}": ${err.message}`);
    }
  }

  // Dedup + base filters
  const uniq = Array.from(new Set(all.map(r=>r.link)))
    .map(link => all.find(r=>r.link===link))
    .filter(Boolean)
    .filter(r => {
      const host = (safeHost(r.link) || '').toLowerCase();
      if (!host) return false;
      if (EXCLUDE_HOSTS_BASE.has(host)) return false;
      if (hostMatches(host, EXTRA_BLOCKLIST)) return false;
      return true;
    });

  console.log(`Candidates after filtering: ${uniq.length}`);

  // Compare to existing (by normalized URL + fingerprint)
  const processed = [];
  const updates = [];
  const skipped = []; // {title,url,host,reason}

  for (const r of uniq){
    const norm = normalizeUrl(r.link);
    const host = safeHost(r.link);
    const found = existing.find(a => normalizeUrl(a.url) === norm || a.normalizedUrl === norm);
    const fp = contentFingerprint(cleanTitle(r.title || ''), r.snippet || '');

    if (found) {
      if (found.fingerprint !== fp) {
        updates.push({ searchResult: r, existing: found });
      }
      continue;
    }

    // Fetch HTML once for lang + authorship checks
    let html = '';
    try {
      html = await fetchHtml(r.link);
    } catch (e) {
      skipped.push({ title: cleanTitle(r.title || ''), url: r.link, host, reason: `fetch-failed: ${e.message}` });
      continue;
    }

    // Language gate
    const lang = detectLang(html) || 'other';
    if (PRIMARY_LANG && lang !== PRIMARY_LANG) {
      skipped.push({ title: cleanTitle(r.title || ''), url: r.link, host, reason: `language=${lang}` });
      continue;
    }

    // Optional authorship verification (reduces false positives)
    if (VERIFY_AUTHOR){
      if (!htmlHasAuthor(html, AUTHOR_NAME)) {
        skipped.push({ title: cleanTitle(r.title || ''), url: r.link, host, reason: 'author-mismatch' });
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
  }

  // Process updates
  const updatedArticles = [];
  for (const {searchResult, existing: ex} of updates){
    const p = await processArticle(searchResult, true, (ex.version || 1));
    updatedArticles.push({ ...p, version: (ex.version || 1) + 1, previousFingerprint: ex.fingerprint });
  }

  // Save full artifacts + grouped notification
  await saveProcessedArticles([...newArticles, ...updatedArticles], newArticles.length, updatedArticles.length, skipped);

  // Append new to DB
  if (newArticles.length){
    const entries = newArticles.map(p => ({
      id: p.id,
      title: p.title,
      url: p.url,
      normalizedUrl: normalizeUrl(p.url),
      platform: p.platform,
      date: p.date,
      snippet: p.snippet,
      fingerprint: p.fingerprint,
      version: 1,
      schemas: { urlSlug: p.urlSlug, type: p.type, topics: p.topics },
      discoveredAt: p.discoveredAt
    }));
    existing.push(...entries);
  }

  // Update DB entries
  for (const u of updatedArticles){
    const i = existing.findIndex(a => normalizeUrl(a.url) === normalizeUrl(u.url));
    if (i !== -1){
      existing[i] = { ...existing[i], title: u.title, snippet: u.snippet, fingerprint: u.fingerprint, version: u.version, lastUpdated: new Date().toISOString() };
    }
  }

  await writeJSON(dbPath, existing);
  console.log('Discovery complete.');
}

// ---------- Processing & generators ----------
async function processArticle(searchResult, isUpdate=false, currentVersion=1){
  const title = cleanTitle(searchResult.title || '');
  const url = searchResult.link;
  const snippet = searchResult.snippet || '';
  const platform = detectPlatform(url);
  const date = extractDate(searchResult) || new Date().toISOString().split('T')[0];

  const platformSlug = platform.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const titleSlug = (title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').substring(0,50)) || 'entry';
  const urlSlug = `/archive/${platformSlug}/${titleSlug}`;
  const shadowUrl = `https://daniellehewych.org${urlSlug}`;

  const topics = detectTopics(title, snippet, platform);
  const articleType = detectArticleType(title, platform);
  const fingerprint = contentFingerprint(title, snippet);

  const enhancedSchema = generateEnhancedSchema({ title, url, shadowUrl, platform, date, snippet, articleType, topics });
  const topicBlock = generateTopicBlock({ shadowUrl, title, topics });
  const relatedBlock = generateRelatedBlock();
  const pageContent = generatePageContent({ title, date, url, platform });
  const bibliographyEntry = generateBibliographyEntry({ title, url, shadowUrl, platform, date, snippet });
  const emailSubject = generateEmailSubject({ title, platform, date }, isUpdate, isUpdate ? currentVersion + 1 : 1);

  return {
    id: Date.now(),
    title, url, normalizedUrl: normalizeUrl(url), platform, date, snippet,
    urlSlug, type: articleType, topics, fingerprint,
    version: isUpdate ? currentVersion + 1 : 1,
    discoveredAt: new Date().toISOString(),
    emailSubject,
    headerCode: formatHeaderCode(enhancedSchema),
    topicBlockCode: formatSchemaBlock(topicBlock, "Topic Clustering Block"),
    relatedBlockCode: formatSchemaBlock(relatedBlock, "Related Articles Block"),
    pageContent, bibliographyEntry
  };
}

function generateEnhancedSchema(data){
  const schema = {
    "@context":"https://schema.org",
    "@type": data.articleType,
    "@id": data.shadowUrl,
    "headline": data.title,
    "description": data.snippet || data.title,
    "image":"https://images.squarespace-cdn.com/content/v1/5ff1bf1e8500a82fe9da19d6/e7b2be48-1fc7-4ff1-8d5b-15ff408f3502/image_123655411.jpg?format=1200w",
    "author":{"@id":"https://daniellehewych.org/#daniel-lehewych"},
    "datePublished": data.date + "T00:00:00Z",
    "dateCreated": data.date + "T00:00:00Z",
    "dateModified": data.date + "T00:00:00Z",
    "publisher": publisherData[data.platform] || { "@type":"Organization","name":data.platform },
    "sameAs": data.url,
    "url": data.shadowUrl,
    "isPartOf": { "@type":"Blog","name":"Daniel Lehewych Shadow Archive","url":"https://daniellehewych.org/archive/","author":{"@id":"https://daniellehewych.org/#daniel-lehewych"} },
    "mainEntityOfPage": { "@type":"WebPage","@id": data.shadowUrl },
    "wordCount": 1000,
    "inLanguage":"en-US",
    "copyrightHolder":{"@id":"https://daniellehewych.org/#daniel-lehewych"},
    "copyrightYear": data.date.substring(0,4),
    "license":"https://creativecommons.org/licenses/by-nc-nd/4.0/"
  };
  switch (data.articleType){
    case "ScholarlyArticle":
      schema.academicDiscipline = data.topics.includes("Philosophy") ? "Philosophy" : "Interdisciplinary Studies";
      schema.educationalLevel = "College";
      schema.learningResourceType = "Scholarly Article";
      break;
    case "OpinionNewsArticle":
      schema.backstory = "Contemporary analysis and expert commentary";
      if (data.platform === "Newsweek") schema.printEdition = "Newsweek Digital";
      break;
    case "HowTo":
      schema.step = [{ "@type":"HowToStep", "name":"Read the full guide", "text": schema.description }];
      schema.totalTime = "PT20M";
      break;
  }
  schema.speakable = { "@type":"SpeakableSpecification", "cssSelector":[ ".article-content p:first-of-type","h1",".article-summary" ] };
  if (data.topics.length) schema.keywords = data.topics.join(", ").toLowerCase();
  return schema;
}

function generateTopicBlock(data){
  return {
    "@context":"https://schema.org",
    "@type":"WebPage",
    "@id": data.shadowUrl,
    "about": data.topics.map(t => ({ "@type":"Thing","name":t })),
    "keywords": data.topics.map(t=>t.toLowerCase()).join(", "),
    "mentions": extractMentions(data.title),
    "breadcrumb": {
      "@type":"BreadcrumbList",
      "itemListElement":[
        { "@type":"ListItem","position":1,"name":"Daniel Lehewych","item":"https://daniellehewych.org/" },
        { "@type":"ListItem","position":2,"name":data.title,"item":data.shadowUrl }
      ]
    }
  };
}
function generateRelatedBlock(){
  return { "@context":"https://schema.org","@type":"ItemList","name":"Related Articles by Daniel Lehewych","description":"Add related articles after creating shadow page","numberOfItems":0,"itemListElement":[] };
}
function generatePageContent(d){
  const t = escapeHtml(d.title);
  return `<div class="shadow-archive-entry" style="font-family: 'Merriweather', serif; max-width: 800px; margin: 0 auto; padding: 40px 20px;">
  <div style="background: #f0f0f0; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
    <p style="margin: 0; font-size: 14px; color: #666;"><strong>Shadow Archive Entry</strong> | Not Indexed | For Attribution Only</p>
  </div>
  <h1 style="font-family: 'Inter', sans-serif; font-size: 32px; line-height: 1.3; margin-bottom: 20px;">${t}</h1>
  <div style="border-bottom: 1px solid #e0e0e0; padding-bottom: 20px; margin-bottom: 30px;">
    <p style="margin: 5px 0; color: #666;">
      <strong>Originally Published:</strong> ${d.date} on ${d.platform}<br>
      <strong>Original URL:</strong> <a href="${d.url}" style="color: #4F7CAC;">View on ${d.platform}</a><br>
      <strong>Author:</strong> Daniel Lehewych
    </p>
  </div>
  <div class="article-content" style="font-size: 18px; line-height: 1.8;"><p><em>[Article content to be added]</em></p></div>
  <div style="margin-top: 50px; padding-top: 30px; border-top: 1px solid #e0e0e0;">
    <p style="font-size: 14px; color: #666; text-align: center;">This content is archived for attribution and reference purposes only.<br>Copyright © ${d.date.substring(0,4)} Daniel Lehewych. All rights reserved.</p>
  </div>
</div>`;
}
function generateBibliographyEntry(d){
  const position = 374; // placeholder
  return {
    "@type":"ListItem",
    "position": position,
    "item":{
      "@type":"Article","@id": d.shadowUrl,"name": d.title,"description": d.snippet || d.title,"url": d.url,
      "datePublished": d.date + "T00:00:00Z","author":{"@id":"https://daniellehewych.org/#daniel-lehewych"},
      "isAccessibleForFree": true,
      "image":"https://images.squarespace-cdn.com/content/v1/5ff1bf1e8500a82fe9da19d6/e7b2be48-1fc7-4ff1-8d5b-15ff408f3502/image_123655411.jpg?format=1200w",
      "isPartOf": { "@type":["Periodical","CreativeWork"], "name": d.platform, "issn": d.platform==="Medium" ? "2168-8524" : "" },
      "sameAs":[ d.url, d.shadowUrl ]
    }
  };
}

// ✅ Canonical now in the header; robots + canonical + JSON-LD (no canonical in body)
function formatHeaderCode(schema){
  return `<meta name="robots" content="noindex, follow">\n<link rel="canonical" href="${schema.sameAs}">\n<script type="application/ld+json">\n${JSON.stringify(schema,null,2)}\n<\\/script>`;
}
function formatSchemaBlock(schema, title){ return `<!-- ${title} - Add to page body -->\n<script type="application/ld+json">\n${JSON.stringify(schema,null,2)}\n<\\/script>`; }

async function saveProcessedArticles(articles, newCount, updateCount, skipped=[]){
  const fullDataPath = path.join(__dirname,'..','data','new-articles-full.json');
  const notificationPath = path.join(__dirname,'..','data','notification.md');
  const date = new Date().toISOString().split('T')[0];

  await writeJSON(fullDataPath, articles);

  let md = `# Sovereignty System Report - ${date}\n\n`;

  if (newCount) md += `## New Articles (${newCount})\n\n`;
  articles.filter(a => a.version === 1).forEach((a,i) => { md += renderArticleBlock(a, i+1, false); });

  if (updateCount) md += `## Updates (${updateCount})\n\n`;
  articles.filter(a => a.version > 1).forEach((a,i) => { md += renderArticleBlock(a, i+1, true); });

  if ((!newCount && !updateCount)) md += `Nothing new today.\n\n`;

  if (skipped.length){
    md += `## Skipped (for review): ${skipped.length}\n\n`;
    skipped.forEach((s, i) => {
      md += `- ${i+1}. **${s.title || '(no title)'}** — ${s.url}\n  - Host: ${s.host}\n  - Reason: ${s.reason}\n`;
    });
    md += `\n`;
  }

  md += `---\n\n## Metadata\n`;
  articles.forEach(a => { md += `work_id=${a.normalizedUrl} | fingerprint=${a.fingerprint} | version=${a.version}\n`; });

  await writeText(notificationPath, md);
  console.log('Full article data saved to data/new-articles-full.json');
  console.log(`Processed: ${newCount} new, ${updateCount} updates; skipped: ${skipped.length}`);
}

function renderArticleBlock(a, idx, isUpdate){
  let out = `### ${idx}. ${a.title} ${isUpdate ? `(UPDATE v${a.version})` : `(NEW)`}\n\n`;
  out += `**Subject Line:** ${a.emailSubject}\n`;
  out += `**Platform:** ${a.platform}\n`;
  out += `**Date:** ${a.date}\n`;
  out += `**URL:** ${a.url}\n`;
  out += `**Type:** ${a.type}\n`;
  out += `**Topics:** ${a.topics.join(', ')}\n`;
  out += `**URL Slug:** \`${a.urlSlug}\`\n`;
  out += `**Fingerprint:** ${a.fingerprint}\n`;
  if (isUpdate) out += `**Change Detected:** Title or description modified\n`;
  out += `\n#### Page Header Code\n\`\`\`html\n${a.headerCode}\n\`\`\`\n`;
  out += `\n#### Topic Clustering Block\n\`\`\`html\n${a.topicBlockCode}\n\`\`\`\n`;
  out += `\n#### Related Articles Block\n\`\`\`html\n${a.relatedBlockCode}\n\`\`\`\n`;
  out += `\n#### Page Content (Shadow Page Body)\n\`\`\`html\n${a.pageContent}\n\`\`\`\n`;
  out += `\n#### Master Bibliography Entry\n\`\`\`json\n${JSON.stringify(a.bibliographyEntry, null, 2)}\n\`\`\`\n\n`;
  out += `---\n\n`;
  return out;
}

// ---------- Helpers (preserved) ----------
function cleanTitle(title=''){
  return title
    .replace(/ - Medium$/i,'')
    .replace(/ \| Newsweek$/i,'')
    .replace(/ - Big Think$/i,'')
    .replace(/ by Daniel Lehewych.*$/i,'')
    .trim();
}
function detectPlatform(url){
  const domain = new URL(url).hostname.toLowerCase();
  const map = {
    'medium.com':'Medium','newsweek.com':'Newsweek','bigthink.com':'BigThink',
    'allwork.space':'Allwork.Space','psychcentral.com':'PsychCentral',
    'qure.ai':'Qure.ai','interestingengineering.com':'Interesting Engineering','freethink.com':'Freethink'
  };
  for (const [k,v] of Object.entries(map)){ if (domain.includes(k)) return v; }
  return domain.replace(/^www\./,'').split('.')[0].split('-').map(w=>w[0]?.toUpperCase()+w.slice(1)).join(' ');
}
function extractDate(sr={}){
  if (sr.pagemap?.metatags?.[0]){
    const meta = sr.pagemap.metatags[0];
    const fields = ['article:published_time','datePublished','publish_date','date'];
    for (const f of fields){
      if (meta[f]){
        const d = new Date(meta[f]); if (!isNaN(d)) return d.toISOString().split('T')[0];
      }
    }
  }
  const m = sr.snippet?.match(/(\w+ \d{1,2}, \d{4})|(\d{4}-\d{2}-\d{2})/);
  if (m){ const d = new Date(m[0]); if (!isNaN(d)) return d.toISOString().split('T')[0]; }
  return null;
}
function detectTopics(title, desc, platform){
  const detected = new Set();
  const txt = (title + ' ' + desc).toLowerCase();
  if (platform === 'Newsweek') detected.add('Politics & Society');
  if (platform === 'Allwork.Space') { detected.add('Work & Career'); detected.add('Digital Culture'); }
  for (const [topic, re] of Object.entries(topicPatterns)) if (re.test(txt)) detected.add(topic);
  if (!detected.size) detected.add('General');
  return Array.from(detected);
}
function detectArticleType(title, platform){
  if (platform === 'Newsweek') return 'OpinionNewsArticle';
  for (const [type, re] of Object.entries(typePatterns)) if (re.test(title)) return type;
  return 'BlogPosting';
}
function extractMentions(title){
  const mentions = []; const names = ['Spinoza','Nietzsche','Heidegger','Kant','Descartes'];
  names.forEach(n => { if (new RegExp(n,'i').test(title)) mentions.push({ "@type":"Person", "name": n }); });
  return mentions;
}
function escapeHtml(s=''){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// ---------- Run ----------
discoverNewArticles().catch(e => { console.error('Discovery failed:', e); process.exit(1); });
