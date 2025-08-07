const fs = require('fs').promises;
const path = require('path');

async function generateBibliography() {
  console.log('Generating master bibliography...');
  
  try {
    // Read articles database
    const articlesPath = path.join(__dirname, '..', 'data', 'articles.json');
    const articlesData = await fs.readFile(articlesPath, 'utf8');
    const articles = JSON.parse(articlesData);
    
    if (articles.length === 0) {
      console.log('No articles found to generate bibliography.');
      return;
    }
    
    // Sort articles by date (newest first)
    articles.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Generate bibliography entries
    const bibliographyEntries = articles.map((article, index) => {
      // Use the URL slug from schemas if available, otherwise generate it
      const urlSlug = article.schemas?.urlSlug || generateUrlSlug(article);
      
      return `    {
      "@type": "ListItem",
      "position": ${index + 1},
      "item": {
        "@type": "Article",
        "@id": "https://daniellehewych.org${urlSlug}",
        "name": "${escapeJsonString(article.title)}",
        "description": "${escapeJsonString(article.snippet || article.title)}",
        "url": "${article.url}",
        "datePublished": "${article.date}T00:00:00Z",
        "author": {"@id": "https://daniellehewych.org/#daniel-lehewych"},
        "isAccessibleForFree": true,
        "image": "https://images.squarespace-cdn.com/content/v1/5ff1bf1e8500a82fe9da19d6/e7b2be48-1fc7-4ff1-8d5b-15ff408f3502/image_123655411.jpg?format=1200w",
        "isPartOf": {
          "@type": ["Periodical", "CreativeWork"],
          "name": "${article.platform}",
          "issn": "${article.platform === 'Medium' ? '2168-8524' : ''}"
        },
        "sameAs": [
          "${article.url}",
          "https://daniellehewych.org${urlSlug}"
        ]
      }
    }`;
    }).join(',\n');
    
    // Create full bibliography schema
    const bibliography = `<!-- Master Bibliography - Last Updated: ${new Date().toISOString()} -->
<!-- Total Articles: ${articles.length} -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "@id": "https://daniellehewych.org/#complete-bibliography",
  "name": "Complete Works of Daniel Lehewych",
  "description": "Comprehensive bibliography of all published works by Daniel Lehewych across all platforms",
  "author": {"@id": "https://daniellehewych.org/#daniel-lehewych"},
  "numberOfItems": ${articles.length},
  "itemListElement": [
${bibliographyEntries}
  ]
}
</script>`;
    
    // Save bibliography
    const bibliographyPath = path.join(__dirname, '..', 'data', 'bibliography.html');
    await fs.writeFile(bibliographyPath, bibliography);
    
    console.log(`Bibliography generated with ${articles.length} articles.`);
    console.log(`Saved to: data/bibliography.html`);
    
    // Also save a JSON version for reference
    const bibliographyJson = {
      lastUpdated: new Date().toISOString(),
      totalArticles: articles.length,
      platforms: countPlatforms(articles),
      bibliography: bibliography
    };
    
    await fs.writeFile(
      path.join(__dirname, '..', 'data', 'bibliography-metadata.json'),
      JSON.stringify(bibliographyJson, null, 2)
    );
    
  } catch (error) {
    console.error('Failed to generate bibliography:', error);
    process.exit(1);
  }
}

function generateUrlSlug(article) {
  const platformSlug = article.platform.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const titleSlug = article.title.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
  
  return `/archive/${platformSlug}/${titleSlug}`;
}

function escapeJsonString(str) {
  return str.replace(/\\/g, '\\\\')
           .replace(/"/g, '\\"')
           .replace(/\n/g, '\\n')
           .replace(/\r/g, '\\r')
           .replace(/\t/g, '\\t');
}

function countPlatforms(articles) {
  const platforms = {};
  articles.forEach(article => {
    platforms[article.platform] = (platforms[article.platform] || 0) + 1;
  });
  return platforms;
}

// Run the generator
generateBibliography();
