#!/usr/bin/env node
// Creates one fake outbox bundle from the first entry in data/articles.json (no network calls)

const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");

const OUT_ROOT = path.join(__dirname, "..", "data", "outbox");
const DB = path.join(__dirname, "..", "data", "articles.json");

const topicPatterns = {
  Philosophy: /philosoph|metaphysics|epistemology|ontology|phenomenolog|existential/i,
  "AI & Technology": /artificial intelligence|\\bAI\\b|machine learning|LLM|AGI|algorithm|technolog|digital|computer/i,
  "Work & Career": /work|career|job|employment|workplace|remote|office|professional|labor|quit|resign/i,
  "Politics & Society": /politic|democra|society|governance|policy|government/i,
  "Fitness & Nutrition": /fitness|exercise|workout|nutrition|diet|supplement|muscle|training|protein/i,
  "Religion & Spirituality": /god|divine|theolog|religious|buddhis|christian|sacred/i,
  Science: /science|scientific|research|study|experiment|data|evidence|empirical/i,
};

function slug(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function detectPlatform(u) {
  try {
    const h = new URL(u).hostname.replace(/^www\./, "");
    if (h.includes("medium.com")) return "Medium";
    if (h.includes("newsweek.com")) return "Newsweek";
    if (h.includes("bigthink.com")) return "BigThink";
    if (h.includes("allwork.space")) return "Allwork.Space";
    if (h.includes("interestingengineering.com")) return "Interesting Engineering";
    if (h.includes("qure.ai")) return "Qure.ai";
    if (h.includes("psychcentral.com")) return "PsychCentral";
    return h.split(".")[0].split("-").map(w => w[0]?.toUpperCase() + w.slice(1)).join(" ");
  } catch { return "Web"; }
}
function topicsFrom(title, url) {
  const t = (title || "").toLowerCase() + " " + (url || "");
  const set = new Set();
  for (const [k, re] of Object.entries(topicPatterns)) if (re.test(t)) set.add(k);
  return Array.from(set.size ? set : ["General"]);
}
function header(schema) {
  return `<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${schema.sameAs}">
<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
<\/script>`;
}

(async () => {
  if (!fs.existsSync(DB)) {
    console.log("No data/articles.json found. Nothing to do.");
    process.exit(0);
  }
  const db = JSON.parse(await fsp.readFile(DB, "utf8"));
  if (!Array.isArray(db) || !db.length) {
    console.log("articles.json is empty. Nothing to do.");
    process.exit(0);
  }

  const a = db[0];
  const title = a.title || "Untitled";
  const url = a.url;
  const date = a.date || new Date().toISOString().slice(0, 10);
  const platform = a.platform || detectPlatform(url);
  const urlSlug = `/archive/${slug(platform)}/${slug(title).slice(0, 50) || "entry"}`;
  const shadowUrl = `https://daniellehewych.org${urlSlug}`;
  const topics = topicsFrom(title, url);

  const schema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": shadowUrl,
    "headline": title,
    "description": title,
    "author": { "@type": "Person", "name": "Daniel Lehewych", "@id":"https://daniellehewych.org/#daniel-lehewych" },
    "datePublished": `${date}T00:00:00Z`,
    "publisher": { "@type":"Organization","name": platform },
    "sameAs": url,
    "url": shadowUrl,
    "mainEntityOfPage": { "@type":"WebPage","@id": shadowUrl },
    "inLanguage": "en-US"
  };

  const topicBlock = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": shadowUrl,
    "about": topics.map(t => ({ "@type":"Thing","name":t })),
    "keywords": topics.join(", ").toLowerCase()
  };

  const related = {
    "@context":"https://schema.org",
    "@type":"ItemList",
    "name":"Related Articles by Daniel Lehewych",
    "numberOfItems":0,
    "itemListElement":[]
  };

  const page = `<div class="shadow-archive-entry" style="max-width:800px;margin:0 auto;padding:40px 20px;">
  <p><strong>Shadow Archive Entry</strong> | Not Indexed | For Attribution Only</p>
  <h1>${title}</h1>
  <p><strong>Originally Published:</strong> ${date} on ${platform}<br>
     <strong>Original URL:</strong> <a href="${url}">View on ${platform}</a></p>
  <div class="article-content"><p><em>[Article content to be added]</em></p></div>
</div>`;

  const bib = {
    "@type":"ListItem",
    "position": 1,
    "item": { "@type":"Article", "@id": shadowUrl, "name": title, "url": url, "datePublished": `${date}T00:00:00Z` }
  };

  const outDir = path.join(OUT_ROOT, urlSlug.replace(/^\//, ""));
  await fsp.mkdir(outDir, { recursive: true });
  await fsp.writeFile(path.join(outDir, "header.html"), header(schema));
  await fsp.writeFile(path.join(outDir, "page.html"), page);
  await fsp.writeFile(path.join(outDir, "schema.json"), JSON.stringify(schema, null, 2));
  await fsp.writeFile(path.join(outDir, "topic.json"), JSON.stringify(topicBlock, null, 2));
  await fsp.writeFile(path.join(outDir, "related.json"), JSON.stringify(related, null, 2));
  await fsp.writeFile(path.join(outDir, "bib.json"), JSON.stringify(bib, null, 2));
  await fsp.writeFile(path.join(outDir, "meta.json"), JSON.stringify({ title, url, platform, date, urlSlug, topics }, null, 2));

  console.log(`Smoke outbox created at ${outDir}`);
})();
