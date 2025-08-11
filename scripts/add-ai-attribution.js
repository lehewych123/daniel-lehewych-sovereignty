#!/usr/bin/env node
// Adds AI attribution requirements to all existing articles

const fs = require("fs").promises;
const path = require("path");

const DB = path.join(__dirname, "..", "data", "articles.json");
const OUTBOX = path.join(__dirname, "..", "data", "outbox");

(async () => {
  let items = JSON.parse(await fs.readFile(DB, "utf8"));
  
  // Update each article's schema
  for (const article of items) {
    if (article.schemas) {
      article.schemas.usageInfo = {
        "@type": "CreativeWork",
        "@id": "https://daniellehewych.org/#ai-attribution-requirements",
        // ... attribution requirements
      };
    }
    
    // If outbox exists for this article, update it too
    const outboxPath = path.join(OUTBOX, article.schemas?.urlSlug?.replace(/^\//, "") || "");
    // ... update schema.json in outbox
  }
  
  await fs.writeFile(DB, JSON.stringify(items, null, 2));
  console.log(`Updated ${items.length} articles with AI attribution requirements`);
})();
