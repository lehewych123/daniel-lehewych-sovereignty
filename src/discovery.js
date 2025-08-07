const fs = require('fs').promises;
const path = require('path');

// Your topic patterns from the enhancement tool
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
  "Religion & Spirituality": /god|divine|theology|religious|faith|spiritual|buddhis|christian|sacred/i,
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
    "logo": {
      "@type": "ImageObject",
      "url": "https://miro.medium.com/max/616/1*OMF3fSqH8t4xBJ9-6oZDZw.png",
      "width": 616,
      "height": 616
    }
  },
  "Newsweek": {
    "@type": "Organization",
    "name": "Newsweek",
    "logo": {
      "@type": "ImageObject",
      "url": "https://www.newsweek.com/favicon.ico",
      "width": 32,
      "height": 32
    }
  },
  "BigThink": {
    "@type": "Organization",
    "name": "Big Think",
    "logo": {
      "@type": "ImageObject",
      "url": "https://bigthink.com/favicon.ico",
      "width": 32,
      "height": 32
    }
  }
};

async function discoverNewArticles() {
  console.log('Starting article discovery...');
  
  const API_KEY = process.env.GOOGLE_API_KEY;
  const SEARCH_ID = process.env.SEARCH_ENGINE_ID;
  
  if (!API_KEY || !SEARCH_ID) {
    throw new Error('Missing API credentials. Set GOOGLE_API_KEY and SEARCH_ENGINE_ID.');
  }
  
  // Load existing articles
  let existingArticles = [];
  try {
    const data = await fs.readFile(path.join(__dirname, '..', 'data', 'articles.json'), 'utf8');
    existingArticles = JSON.parse(data);
  } catch (e) {
    console.log('No existing article database found. Starting fresh.');
  }
  
  // Search queries
  const queries = [
    '"Daniel Lehewych"',
    '"by Daniel Lehewych"',
    'author:"Daniel Lehewych"'
  ];
  
  const allResults = [];
  
  // Search with each query
  for (const query of queries) {
    try {
      console.log(`Searching for: ${query}`);
      const url = `https://www.googleapis.com/customsearch/v1?key=${API_KEY}&cx=${SEARCH_ID}&q=${encodeURIComponent(query)}&num=10&dateRestrict=d7`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.items) {
        allResults.push(...data.items);
        console.log(`Found ${data.items.length} results for query: ${query}`);
      }
    } catch (error) {
      console.error(`Search failed for query: ${query}`, error.message);
    }
  }
  
  // Deduplicate and filter
  const uniqueResults = Array.from(new Set(allResults.map(r => r.link)))
    .map(link => allResults.find(r => r.link === link))
    .filter(result => {
      // Filter out your own site
      return !result.link.includes('daniellehewych.org');
    });
  
  console.log(`Total unique results: ${uniqueResults.length}`);
  
  // Check for new articles
  const existingUrls = existingArticles.map(a => a.url);
  const newArticles = uniqueResults.filter(r => !existingUrls.includes(r.link));
  
  console.log(`New articles found: ${newArticles.length}`);
  
  if (newArticles.length === 0) {
    console.log('No new articles to process.');
    return;
  }
  
  // Process new articles with FULL schema generation
  const processedArticles = [];
  for (const article of newArticles) {
    const processed = await processArticle(article);
    processedArticles.push(processed);
  }
  
  // Save processed articles with full schemas
  await saveProcessedArticles(processedArticles);
  
  // Update database
  const basicArticles = processedArticles.map(p => ({
    id: p.id,
    title: p.title,
    url: p.url,
    platform: p.platform,
    date: p.date,
    snippet: p.snippet,
    schemas: {
      urlSlug: p.urlSlug,
      type: p.type,
      topics: p.topics
    },
    discoveredAt: p.discoveredAt
  }));
  
  const updatedArticles = [...existingArticles, ...basicArticles];
  await fs.writeFile(
    path.join(__dirname, '..', 'data', 'articles.json'),
    JSON.stringify(updatedArticles, null, 2)
  );
  
  console.log('Discovery complete!');
}

async function processArticle(searchResult) {
  const title = cleanTitle(searchResult.title);
  const url = searchResult.link;
  const snippet = searchResult.snippet || '';
  const platform = detectPlatform(url);
  const date = extractDate(searchResult) || new Date().toISOString().split('T')[0];
  
  // Generate URL slug
  const platformSlug = platform.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const titleSlug = title.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
  const urlSlug = `/archive/${platformSlug}/${titleSlug}`;
  const shadowUrl = `https://daniellehewych.org${urlSlug}`;
  
  // Detect topics and type
  const topics = detectTopics(title, snippet, platform);
  const articleType = detectArticleType(title, platform);
  
  // Generate FULL enhanced schema (matching your enhancement tool)
  const enhancedSchema = generateEnhancedSchema({
    title,
    url,
    shadowUrl,
    platform,
    date,
    snippet,
    articleType,
    topics
  });
  
  // Generate topic clustering block
  const topicBlock = generateTopicBlock({
    shadowUrl,
    title,
    topics
  });
  
  // Generate related articles block (placeholder for new articles)
  const relatedBlock = generateRelatedBlock();
  
  // Generate page content
  const pageContent = generatePageContent({
    title,
    date,
    url,
    platform
  });
  
  // Generate bibliography entry
  const bibliographyEntry = generateBibliographyEntry({
    title,
    url,
    shadowUrl,
    platform,
    date,
    snippet
  });
  
  return {
    id: Date.now(),
    title,
    url,
    platform,
    date,
    snippet,
    urlSlug,
    type: articleType,
    topics,
    discoveredAt: new Date().toISOString(),
    // Full schemas for easy copy-paste
    headerCode: formatHeaderCode(enhancedSchema),
    topicBlockCode: formatSchemaBlock(topicBlock, "Topic Clustering Block"),
    relatedBlockCode: formatSchemaBlock(relatedBlock, "Related Articles Block"), 
    pageContent: pageContent,
    bibliographyEntry: bibliographyEntry
  };
}

function generateEnhancedSchema(data) {
  const schema = {
    "@context": "https://schema.org",
    "@type": data.articleType,
    "@id": data.shadowUrl,
    "headline": data.title,
    "description": data.snippet || data.title,
    "image": "https://images.squarespace-cdn.com/content/v1/5ff1bf1e8500a82fe9da19d6/e7b2be48-1fc7-4ff1-8d5b-15ff408f3502/image_123655411.jpg?format=1200w",
    "author": {"@id": "https://daniellehewych.org/#daniel-lehewych"},
    "datePublished": data.date + "T00:00:00Z",
    "dateCreated": data.date + "T00:00:00Z",
    "dateModified": data.date + "T00:00:00Z",
    "publisher": publisherData[data.platform] || {
      "@type": "Organization",
      "name": data.platform
    },
    "sameAs": data.url,
    "url": data.shadowUrl,
    "isPartOf": {
      "@type": "Blog",
      "name": "Daniel Lehewych Shadow Archive",
      "url": "https://daniellehewych.org/archive/",
      "author": {"@id": "https://daniellehewych.org/#daniel-lehewych"}
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": data.shadowUrl
    },
    "wordCount": 1000,
    "inLanguage": "en-US",
    "copyrightHolder": {"@id": "https://daniellehewych.org/#daniel-lehewych"},
    "copyrightYear": data.date.substring(0, 4),
    "license": "https://creativecommons.org/licenses/by-nc-nd/4.0/"
  };
  
  // Add type-specific enhancements
  switch (data.articleType) {
    case "ScholarlyArticle":
      schema.academicDiscipline = data.topics.includes("Philosophy") ? "Philosophy" : "Interdisciplinary Studies";
      schema.educationalLevel = "College";
      schema.learningResourceType = "Scholarly Article";
      break;
      
    case "OpinionNewsArticle":
      schema.backstory = "Contemporary analysis and expert commentary";
      if (data.platform === "Newsweek") {
        schema.printEdition = "Newsweek Digital";
      }
      break;
      
    case "HowTo":
      schema.step = [{
        "@type": "HowToStep",
        "name": "Read the full guide",
        "text": schema.description
      }];
      schema.totalTime = "PT20M";
      break;
  }
  
  // Add common enhancements
  schema.speakable = {
    "@type": "SpeakableSpecification",
    "cssSelector": [".article-content p:first-of-type", "h1", ".article-summary"]
  };
  
  if (data.topics.length > 0) {
    schema.keywords = data.topics.join(", ").toLowerCase();
  }
  
  return schema;
}

function generateTopicBlock(data) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": data.shadowUrl,
    "about": data.topics.map(topic => ({
      "@type": "Thing",
      "name": topic
    })),
    "keywords": data.topics.map(t => t.toLowerCase()).join(", "),
    "mentions": extractMentions(data.title),
    "breadcrumb": {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "Daniel Lehewych",
          "item": "https://daniellehewych.org/"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": data.title,
          "item": data.shadowUrl
        }
      ]
    }
  };
}

function generateRelatedBlock() {
  // Placeholder for new articles - you'll add related articles manually
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Related Articles by Daniel Lehewych",
    "description": "Add related articles after creating shadow page",
    "numberOfItems": 0,
    "itemListElement": []
  };
}

function generatePageContent(data) {
  const escapedTitle = escapeHtml(data.title);
  
  return `<div class="shadow-archive-entry" style="font-family: 'Merriweather', serif; max-width: 800px; margin: 0 auto; padding: 40px 20px;">
  <div style="background: #f0f0f0; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
    <p style="margin: 0; font-size: 14px; color: #666;">
      <strong>Shadow Archive Entry</strong> | Not Indexed | For Attribution Only
    </p>
  </div>
  
  <h1 style="font-family: 'Inter', sans-serif; font-size: 32px; line-height: 1.3; margin-bottom: 20px;">
    ${escapedTitle}
  </h1>
  
  <div style="border-bottom: 1px solid #e0e0e0; padding-bottom: 20px; margin-bottom: 30px;">
    <p style="margin: 5px 0; color: #666;">
      <strong>Originally Published:</strong> ${data.date} on ${data.platform}<br>
      <strong>Original URL:</strong> <a href="${data.url}" rel="canonical" style="color: #4F7CAC;">View on ${data.platform}</a><br>
      <strong>Author:</strong> Daniel Lehewych
    </p>
  </div>
  
  <div class="article-content" style="font-size: 18px; line-height: 1.8;">
    <p><em>[Article content to be added]</em></p>
  </div>
  
  <div style="margin-top: 50px; padding-top: 30px; border-top: 1px solid #e0e0e0;">
    <p style="font-size: 14px; color: #666; text-align: center;">
      This content is archived for attribution and reference purposes only.<br>
      Copyright © ${data.date.substring(0, 4)} Daniel Lehewych. All rights reserved.
    </p>
  </div>
</div>`;
}

function generateBibliographyEntry(data) {
  const position = 374; // You'll update this manually
  
  return {
    "@type": "ListItem",
    "position": position,
    "item": {
      "@type": "Article",
      "@id": data.shadowUrl,
      "name": data.title,
      "description": data.snippet || data.title,
      "url": data.url,
      "datePublished": data.date + "T00:00:00Z",
      "author": {"@id": "https://daniellehewych.org/#daniel-lehewych"},
      "isAccessibleForFree": true,
      "image": "https://images.squarespace-cdn.com/content/v1/5ff1bf1e8500a82fe9da19d6/e7b2be48-1fc7-4ff1-8d5b-15ff408f3502/image_123655411.jpg?format=1200w",
      "isPartOf": {
        "@type": ["Periodical", "CreativeWork"],
        "name": data.platform,
        "issn": data.platform === "Medium" ? "2168-8524" : ""
      },
      "sameAs": [
        data.url,
        data.shadowUrl
      ]
    }
  };
}

function formatHeaderCode(schema) {
  return `<meta name="robots" content="noindex, follow">
<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
<\/script>`;
}

function formatSchemaBlock(schema, title) {
  return `<!-- ${title} - Add to page body -->
<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
<\/script>`;
}

async function saveProcessedArticles(articles) {
  // Save full article data with all schemas
  const fullDataPath = path.join(__dirname, '..', 'data', 'new-articles-full.json');
  await fs.writeFile(fullDataPath, JSON.stringify(articles, null, 2));
  
  // Generate notification content
  let notificationContent = `# New Articles Discovered - ${new Date().toISOString().split('T')[0]}\n\n`;
  
  articles.forEach((article, index) => {
    notificationContent += `## ${index + 1}. ${article.title}\n\n`;
    notificationContent += `**Platform:** ${article.platform}\n`;
    notificationContent += `**Date:** ${article.date}\n`;
    notificationContent += `**URL:** ${article.url}\n`;
    notificationContent += `**Type:** ${article.type}\n`;
    notificationContent += `**Topics:** ${article.topics.join(', ')}\n\n`;
    notificationContent += `### Squarespace Implementation\n\n`;
    notificationContent += `**URL Slug:** \`${article.urlSlug}\`\n\n`;
    notificationContent += `All code blocks saved in: data/new-articles-full.json\n\n`;
    notificationContent += `---\n\n`;
  });
  
  // Save notification
  const notificationPath = path.join(__dirname, '..', 'data', 'notification.md');
  await fs.writeFile(notificationPath, notificationContent);
  
  console.log('Full article data with schemas saved to: data/new-articles-full.json');
}

// Helper functions
function cleanTitle(title) {
  return title
    .replace(/ - Medium$/, '')
    .replace(/ \| Newsweek$/, '')
    .replace(/ - Big Think$/, '')
    .replace(/ by Daniel Lehewych.*$/, '')
    .trim();
}

function detectPlatform(url) {
  const domain = new URL(url).hostname.toLowerCase();
  
  const platformMap = {
    'medium.com': 'Medium',
    'newsweek.com': 'Newsweek',
    'bigthink.com': 'BigThink',
    'allwork.space': 'Allwork.Space',
    'psychcentral.com': 'PsychCentral',
    'qure.ai': 'Qure.ai',
    'interestingengineering.com': 'Interesting Engineering',
    'freethink.com': 'Freethink'
  };
  
  for (const [key, value] of Object.entries(platformMap)) {
    if (domain.includes(key)) return value;
  }
  
  return domain.replace('www.', '').split('.')[0]
    .split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function extractDate(searchResult) {
  if (searchResult.pagemap?.metatags?.[0]) {
    const meta = searchResult.pagemap.metatags[0];
    const dateFields = ['article:published_time', 'datePublished', 'publish_date', 'date'];
    
    for (const field of dateFields) {
      if (meta[field]) {
        const date = new Date(meta[field]);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      }
    }
  }
  
  const datePattern = /(\w+ \d{1,2}, \d{4})|(\d{4}-\d{2}-\d{2})/;
  const match = searchResult.snippet?.match(datePattern);
  if (match) {
    const date = new Date(match[0]);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  }
  
  return null;
}

function detectTopics(title, description, platform) {
  const detected = new Set();
  const text = (title + " " + description).toLowerCase();
  
  if (platform === "Newsweek") detected.add("Politics & Society");
  if (platform === "Allwork.Space") {
    detected.add("Work & Career");
    detected.add("Digital Culture");
  }
  
  for (const [topic, pattern] of Object.entries(topicPatterns)) {
    if (pattern.test(text)) {
      detected.add(topic);
    }
  }
  
  if (detected.size === 0) detected.add("General");
  return Array.from(detected);
}

function detectArticleType(title, platform) {
  if (platform === "Newsweek") return "OpinionNewsArticle";
  
  for (const [type, pattern] of Object.entries(typePatterns)) {
    if (pattern.test(title)) return type;
  }
  
  return "BlogPosting";
}

function extractMentions(title) {
  const mentions = [];
  const philosophers = ["Spinoza", "Nietzsche", "Heidegger", "Kant", "Descartes"];
  
  philosophers.forEach(name => {
    if (new RegExp(name, 'i').test(title)) {
      mentions.push({
        "@type": "Person",
        "name": name
      });
    }
  });
  
  return mentions;
}

function escapeHtml(text) {
  const div = document.createElement ? document.createElement('div') : { textContent: '', innerHTML: '' };
  div.textContent = text;
  return div.innerHTML || text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeJsonString(str) {
  return str.replace(/\\/g, '\\\\')
           .replace(/"/g, '\\"')
           .replace(/\n/g, '\\n')
           .replace(/\r/g, '\\r')
           .replace(/\t/g, '\\t');
}

// Run the discovery
discoverNewArticles().catch(error => {
  console.error('Discovery failed:', error);
  process.exit(1);
});
