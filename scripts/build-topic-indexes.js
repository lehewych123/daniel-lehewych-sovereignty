#!/usr/bin/env node
// Builds topic ItemLists under data/topics/<topic-slug>.json

const fs = require("fs").promises;
const path = require("path");

const DB = path.join(__dirname, "..", "data", "articles.json");
const OUT_DIR = path.join(__dirname, "..", "data", "topics");

const slug = s => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

(async () => {
  let items = [];
  try { items = JSON.parse(await fs.readFile(DB, "utf8")); } catch {}
  if (!items.length) { console.log("No DB; skipping topic index build."); process.exit(0); }

  // Collect topics per article
  const map = new Map(); // topic -> [articles]
  for (const a of items) {
    const ts = a.schemas?.topics?.length ? a.schemas.topics : ["General"];
    for (const t of ts) {
      if (!map.has(t)) map.set(t, []);
      map.get(t).push(a);
    }
  }

  await fs.mkdir(OUT_DIR, { recursive: true });

  for (const [topic, arr] of map.entries()) {
    // newest first
    arr.sort((x,y) => (y.date||"").localeCompare(x.date||"") || (y.title||"").localeCompare(x.title||""));
    const list = {
      "@context":"https://schema.org",
      "@type":"ItemList",
      "name": `Topic: ${topic}`,
      "numberOfItems": arr.length,
      "itemListElement": arr.slice(0, 200).map((a, i) => {
        const urlSlug = `/archive/${slug(a.platform||"web")}/${slug(a.title).slice(0,50)||"entry"}`;
        const shadowUrl = `https://daniellehewych.org${urlSlug}`;
        return {
          "@type":"ListItem",
          "position": i+1,
          "item": {
            "@type":"Article",
            "@id": shadowUrl,
            "name": a.title,
            "url": a.url,
            "datePublished": (a.date || "1970-01-01") + "T00:00:00Z"
          }
        };
      })
    };
    const file = path.join(OUT_DIR, `${slug(topic)}.json`);
    await fs.writeFile(file, JSON.stringify(list, null, 2));
  }

  console.log(`Topic indexes written to ${OUT_DIR}`);
})();
