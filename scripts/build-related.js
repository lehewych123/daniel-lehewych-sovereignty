#!/usr/bin/env node
// Builds related ItemList per article based on simple topic overlap

const fs = require("fs").promises;
const path = require("path");

const DB = path.join(__dirname, "..", "data", "articles.json");
const OUT_DIR = path.join(__dirname, "..", "data", "related");
const OUTBOX = path.join(__dirname, "..", "data", "outbox");

const slug = s => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function topicsFrom(a) {
  // use stored topics if available; else heuristic by title
  if (a.schemas?.topics?.length) return a.schemas.topics;
  const t = (a.title || "").toLowerCase();
  const topics = [];
  if (/(philosoph|metaphysics|epistemology|ontology|phenomenolog|existential)/i.test(t)) topics.push("Philosophy");
  if (/(artificial intelligence|\bAI\b|machine learning|LLM|AGI|algorithm|technolog|digital|computer)/i.test(t)) topics.push("AI & Technology");
  if (/(work|career|job|employment|workplace|remote|office|professional|labor)/i.test(t)) topics.push("Work & Career");
  if (/(politic|democra|society|governance|policy|government)/i.test(t)) topics.push("Politics & Society");
  if (!topics.length) topics.push("General");
  return topics;
}

(async () => {
  let items = [];
  try { items = JSON.parse(await fs.readFile(DB, "utf8")); } catch {}
  if (!items.length) { console.log("No DB; skipping related build."); process.exit(0); }

  await fs.mkdir(OUT_DIR, { recursive: true });

  // Precompute topic sets
  const withTopics = items.map(a => ({ a, topics: new Set(topicsFrom(a)) }));

  for (const { a, topics } of withTopics) {
    const meSlug = `/archive/${slug(a.platform||"web")}/${slug(a.title).slice(0,50)||"entry"}`;
    const meShadow = `https://daniellehewych.org${meSlug}`;

    const scored = [];
    for (const { a: b, topics: t2 } of withTopics) {
      if (a === b) continue;
      const shared = [...topics].filter(t => t2.has(t)).length;
      if (!shared) continue;
      scored.push({
        shared,
        samePlatform: (a.platform||"") === (b.platform||""),
        date: b.date || "1970-01-01",
        b
      });
    }

    scored.sort((x, y) =>
      y.shared - x.shared ||
      (y.samePlatform?1:0) - (x.samePlatform?1:0) ||
      (y.date || "").localeCompare(x.date || "")
    );

    const picks = scored.slice(0, 5).map(({ b }, i) => {
      const bSlug = `/archive/${slug(b.platform||"web")}/${slug(b.title).slice(0,50)||"entry"}`;
      const bShadow = `https://daniellehewych.org${bSlug}`;
      return {
        "@type":"ListItem",
        "position": i+1,
        "item": {
          "@type":"Article",
          "@id": bShadow,
          "name": b.title,
          "url": b.url,
          "datePublished": (b.date || "1970-01-01") + "T00:00:00Z"
        }
      };
    });

    const related = {
      "@context":"https://schema.org",
      "@type":"ItemList",
      "name":"Related Articles by Daniel Lehewych",
      "numberOfItems": picks.length,
      "itemListElement": picks
    };

    const outFile = path.join(OUT_DIR, `${slug(a.title).slice(0,50)||"entry"}.json`);
    await fs.writeFile(outFile, JSON.stringify(related, null, 2)).catch(()=>{});

    // If an outbox bundle exists for this article, refresh its related.json
    const outDir = path.join(OUTBOX, meSlug.replace(/^\//, ""));
    try {
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(path.join(outDir, "related.json"), JSON.stringify(related, null, 2));
    } catch {}
  }

  console.log(`Related lists built in ${OUT_DIR}`);
})();
