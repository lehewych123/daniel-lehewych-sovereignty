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
  
  // Process new articles
  const processedArticles = [];
  for (const article of newArticles) {
    const processed = await processArticle(article);
    processedArticles.push(processed);
  }
  
  // Update database
  const updatedArticles = [...existingArticles, ...processedArticles];
  await fs.writeFile(
    path.join(__dirname, '..', 'data', 'articles.json'),
    JSON.stringify(updatedArticles, null, 2)
  );
  
  // Generate summary for GitHub issue
  await generateIssueSummary(processedArticles);
}

async function processArticle(searchResult) {
  const title = cleanTitle(searchResult.title);
  const url = searchResult.link;
  const snippet = searchResult.snippet || '';
  const platform = detectPlatform(url);
  const date = extractDate(searchResult) || new Date().toISOString().split('T')[0];
  
  // Generate schemas
  const schemas = generateSchemas({
    title,
    url,
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
    schemas,
    discoveredAt: new Date().toISOString()
  };
}

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
  // Try to extract from pagemap metadata
  if (searchResult.pagemap?.metatags?.[0]) {
    const meta = searchResult.pagemap.metatags[0];
    const dateFields = [
      'article:published_time',
      'datePublished',
      'publish_date',
      'date'
    ];
    
    for (const field of dateFields) {
      if (meta[field]) {
        const date = new Date(meta[field]);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      }
    }
  }
  
  // Try to extract from snippet
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

function generateSchemas(article) {
  const platformSlug = article.platform.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const titleSlug = article.title.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
  
  const shadowUrl = `https://daniellehewych.org/archive/${platformSlug}/${titleSlug}`;
  
  // Detect topics and type
  const topics = detectTopics(article.title, article.snippet, article.platform);
  const articleType = detectArticleType(article.title, article.platform);
  
  // Generate enhanced schema
  const schema = {
    "@context": "https://schema.org",
    "@type": articleType,
    "@id": shadowUrl,
    "headline": article.title,
    "description": article.snippet || article.title,
    "url": shadowUrl,
    "sameAs": article.url,
    "datePublished": article.date + "T00:00:00Z",
    "author": {"@id": "https://daniellehewych.org/#daniel-lehewych"},
    "keywords": topics.join(", ").toLowerCase()
  };
  
  return {
    urlSlug: `/archive/${platformSlug}/${titleSlug}`,
    type: articleType,
    topics: topics
  };
}

function detectTopics(title, description, platform) {
  const detected = new Set();
  const text = (title + " " + description).toLowerCase();
  
  // Platform defaults
  if (platform === "Newsweek") detected.add("Politics & Society");
  if (platform === "Allwork.Space") {
    detected.add("Work & Career");
    detected.add("Digital Culture");
  }
  
  // Check patterns
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

async function generateIssueSummary(articles) {
  if (articles.length === 0) return;
  
  // Set outputs for GitHub Actions
  console.log(`::set-output name=has_new::true`);
  console.log(`::set-output name=date::${new Date().toISOString().split('T')[0]}`);
  
  let summary = '# New Articles Discovered\n\n';
  
  articles.forEach((article, index) => {
    summary += `## ${index + 1}. ${article.title}\n\n`;
    summary += `**Platform:** ${article.platform}\n`;
    summary += `**Date:** ${article.date}\n`;
    summary += `**URL:** ${article.url}\n`;
    summary += `**Type:** ${article.schemas.type}\n`;
    summary += `**Topics:** ${article.schemas.topics.join(', ')}\n\n`;
    summary += `**URL Slug:** \`${article.schemas.urlSlug}\`\n\n`;
    summary += '---\n\n';
  });
  
  // Output for GitHub issue
  console.log(`::set-output name=summary::${encodeURIComponent(summary)}`);
}

// Run the discovery
discoverNewArticles().catch(error => {
  console.error('Discovery failed:', error);
  process.exit(1);
});
