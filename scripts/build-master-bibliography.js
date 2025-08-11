#!/usr/bin/env node
// Builds a canonical master bibliography with stable positions based on date (ascending)

const fs = require("fs").promises;
const path = require("path");

const DB = path.join(__dirname, "..", "data", "articles.json");
const OUT = path.join(__dirname, "..", "data", "master-bibliography.json");
const OUTBOX = path.join(__dirname, "..", "data", "outbox");

const slug = s => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// ISSN mappings for legitimate publications
const ISSN_MAP = {
  // Current platforms
  "Medium": "2168-8878",
  "Newsweek": "0028-9604",
  "BigThink": "2573-7651",
  "Big Think": "2573-7651",
  "Allwork.Space": "2693-9304",
  "PsychCentral": "1930-7810",
  "Psych Central": "1930-7810",
  "Qure.ai": "2581-8104",
  "Interesting Engineering": "2333-5084",
  "Freethink": "2573-7317",
  
  // Major editorial/magazine outlets
  "Harvard Business Review": "0017-8012",
  "MIT Technology Review": "1099-274X",
  "The Atlantic": "1072-7825",
  "The New Yorker": "0028-792X",
  "Wired": "1059-1028",
  "Fast Company": "1085-9241",
  "Forbes": "0015-6914",
  "Inc.": "0162-8968",
  "Entrepreneur": "0163-3341",
  
  // Scientific publications
  "Scientific American": "0036-8733",
  "Nature": "0028-0836",
  "Science": "0036-8075",
  "PLOS ONE": "1932-6203",
  
  // Philosophy outlets
  "Philosophy Now": "0961-5970",
  "Aeon": "2633-5921",
  "Quillette": "2573-7228",
  "3 Quarks Daily": "2573-7880",
  
  // Tech publications
  "TechCrunch": "2156-2652",
  "Ars Technica": "1945-8266",
  "The Verge": "2334-9603",
  "IEEE Spectrum": "0018-9235",
  
  // Medical/Psychology publications
  "Psychology Today": "0033-3107",
  "The Lancet": "0140-6736",
  "JAMA": "0098-7484",
  "BMJ": "0959-8138",
  
  // Policy/Economics
  "The Economist": "0013-0613",
  "Foreign Policy": "0015-7228",
  "Foreign Affairs": "0015-7120",
  
  // General interest
  "Slate": "1091-2339",
  "Salon": "1078-0432",
  "Vox": "2376-9793",
  "The Conversation": "2201-5639"
};

// Get ISSN for a platform, with fallback for unknown platforms
const getISSN = (platform) => {
  if (!platform) return "";
  
  // First try exact match
  if (ISSN_MAP[platform]) return ISSN_MAP[platform];
  
  // Try case-insensitive match
  const normalized = platform.toLowerCase();
  for (const [key, value] of Object.entries(ISSN_MAP)) {
    if (key.toLowerCase() === normalized) return value;
  }
  
  // Default empty for unknown platforms
  return "";
};

(async () => {
  let items = [];
  try { items = JSON.parse(await fs.readFile(DB, "utf8")); } catch { items = []; }
  if (!items.length) {
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
    
    // Generate proper description from article data
    let description = a.title; // Default to title if no description available
    if (a.description) {
      description = a.description;
    } else if (a.snippet) {
      description = a.snippet;
    } else if (a.excerpt) {
      description = a.excerpt;
    } else if (a.summary) {
      description = a.summary;
    } else if (a.content && typeof a.content === 'string') {
      // Extract first 160 chars of content as description
      description = a.content.substring(0, 160).trim();
      if (a.content.length > 160) description += "...";
    }
    
    // Get image URL - use article image if available, otherwise default
    let imageUrl = "https://images.squarespace-cdn.com/content/v1/5ff1bf1e8500a82fe9da19d6/e7b2be48-1fc7-4ff1-8d5b-15ff408f3502/image_123655411.jpg?format=1200w";
    if (a.image) {
      imageUrl = a.image;
    } else if (a.thumbnail) {
      imageUrl = a.thumbnail;
    } else if (a.featuredImage) {
      imageUrl = a.featuredImage;
    } else if (a.schemas && a.schemas.image) {
      imageUrl = a.schemas.image;
    }
    
    // Build the sameAs array with all available URLs
    const sameAsUrls = [a.url];
    if (shadowUrl !== a.url) {
      sameAsUrls.push(shadowUrl);
    }
    if (a.canonicalUrl && a.canonicalUrl !== a.url) {
      sameAsUrls.push(a.canonicalUrl);
    }
    if (a.alternateUrl && a.alternateUrl !== a.url) {
      sameAsUrls.push(a.alternateUrl);
    }
    
    // Build the item object with complete structured data
    const itemObj = {
      "@type":"Article",
      "@id": shadowUrl,
      "name": a.title,
      "description": description,
      "url": a.url,
      "datePublished": (a.date || "1970-01-01") + "T00:00:00Z",
      "author": {
        "@id": "https://daniellehewych.org/#daniel-lehewych",
        "@type": "Person",
        "name": "Daniel Lehewych"
      },
      "isAccessibleForFree": true,
      "image": imageUrl,
      "isPartOf": {
        "@type": ["Periodical", "CreativeWork"],
        "name": platform,
        "issn": getISSN(platform)
      },
      "sameAs": sameAsUrls
    };
    
    // Add optional fields if they exist
    if (a.dateModified) {
      itemObj.dateModified = a.dateModified + "T00:00:00Z";
    }
    
    if (a.keywords || a.tags) {
      itemObj.keywords = a.keywords || a.tags;
    }
    
    if (a.articleSection || a.section) {
      itemObj.articleSection = a.articleSection || a.section;
    }
    
    if (a.wordCount) {
      itemObj.wordCount = a.wordCount;
    }
    
    if (a.publisher && a.publisher !== platform) {
      itemObj.publisher = {
        "@type": "Organization",
        "name": a.publisher
      };
    }
    
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
