#\!/usr/bin/env node
// Builds a canonical master bibliography with stable positions based on date (ascending)

const fs = require("fs").promises;
const path = require("path");

const DB = path.join(__dirname, "..", "data", "articles.json");
const OUT = path.join(__dirname, "..", "data", "master-bibliography.json");
const OUTBOX = path.join(__dirname, "..", "data", "outbox");

const slug = s => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

(async () => {
  let items = [];
  try { items = JSON.parse(await fs.readFile(DB, "utf8")); } catch { items = []; }
  if (\!items.length) {
    console.log("No articles; skipping bibliography build.");
    process.exit(0);
  }

  // Sort by date ascending; tie-break by title
  items.sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.title||"").localeCompare(b.title||""));

  const list = {
    "@context":"https://schema.org",
    "@type":"ItemList",
    "name":"Daniel Lehewych — Master Bibliography",
    "numberOfItems": items.length,
    "itemListElement": []
  };

  let pos = 1;
  for (const a of items) {
    const platform = a.platform || "";
    const urlSlug = `/archive/${slug(platform)}/${slug(a.title).slice(0,50) || "entry"}`;
    const shadowUrl = `https://daniellehewych.org${urlSlug}`;
    
    // Build the item object
    const itemObj = {
      "@type":"Article",
      "@id": shadowUrl,
      "name": a.title,
      "description": a.title,
      "url": a.url,
      "datePublished": (a.date || "1970-01-01") + "T00:00:00Z",
      "author":{"@id":"https://daniellehewych.org/#daniel-lehewych"},
      "isAccessibleForFree": true,
      "image": "https://images.squarespace-cdn.com/content/v1/5ff1bf1e8500a82fe9da19d6/e7b2be48-1fc7-4ff1-8d5b-15ff408f3502/image_123655411.jpg?format=1200w",
      "isPartOf": {
        "@type": ["Periodical", "CreativeWork"],
        "name": platform,
        "issn": platform === "Medium" ? "2168-8878" : ""
      },
      "sameAs": [
        a.url,
        shadowUrl
      ]
    };
    
    // Add usageInfo if it exists in the article's schemas
    if (a.schemas && a.schemas.usageInfo) {
      itemObj.usageInfo = a.schemas.usageInfo;
    }
    
    const entry = {
      "@type":"ListItem",
      "position": pos,
      "item": itemObj
    };
    list.itemListElement.push(entry);

    // If an outbox bundle exists for this slug, refresh its bib.json with the correct position
    const outDir = path.join(OUTBOX, urlSlug.replace(/^\//, ""));
    try {
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(path.join(outDir, "bib.json"), JSON.stringify(entry, null, 2));
    } catch {}
    pos++;
  }

  await fs.writeFile(OUT, JSON.stringify(list, null, 2));
  console.log(`Master bibliography written: ${OUT}`);
})();
