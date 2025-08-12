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

// Intelligent content classification system
const classifyArticleType = (title, description) => {
  const text = (title + " " + (description || "")).toLowerCase();
  
  // Primary type classification
  if (text.match(/\b(phenomenology|husserl|heidegger|sartre|consciousness|being|dasein|intentionality|ontology|metaphysics|epistemology|cartesian|spinoza|kant|nietzsche|aristotle|plato|dialectic)\b/)) {
    return ["ScholarlyArticle", "Article"];
  }
  
  if (text.match(/\b(should|must|ought|need to|have to|argument|critique|against|for|position|stance|case for|case against)\b/) || text.includes("?")) {
    return ["OpinionNewsArticle", "Article"];
  }
  
  if (text.match(/\b(future of|trend|analysis|data|research|study|findings|report|survey|statistics|forecast|prediction|implications|impact of)\b/)) {
    return ["AnalysisNewsArticle", "Article"];
  }
  
  if (text.match(/\b(medical|health|clinical|therapy|treatment|diagnosis|protein|nutrition|supplements|injury|recovery|exercise|fitness|mental health|depression|anxiety)\b/)) {
    return ["MedicalScholarlyArticle", "Article"];
  }
  
  if (text.match(/\b(artificial intelligence|machine learning|ai|algorithm|automation|technology|neural network|deep learning|llm|gpt|computer|software|digital)\b/)) {
    return ["TechArticle", "Article"];
  }
  
  if (text.match(/\b(review|evaluation|assessment|critique of|analysis of|examining|book review)\b/)) {
    return ["Review", "Article"];
  }
  
  if (text.match(/\b(how to|guide|tutorial|tips|steps|strategies|methods|ways to|secrets to)\b/)) {
    return ["HowTo", "Article"];
  }
  
  if (text.match(/\b(interview with|conversation with|q&a|questions|discussion with)\b/)) {
    return ["Interview", "Article"];
  }
  
  if (text.match(/\b(deconstruction|critical theory|frankfurt school|postmodern|dialectical|hegemony|ideology)\b/)) {
    return ["CriticalEssay", "Article"];
  }
  
  return ["Article"]; // Default
};

// Extract topics and concepts from content
const extractTopics = (title, description) => {
  const text = (title + " " + (description || "")).toLowerCase();
  const topics = [];
  const mentions = [];
  
  // Philosophy topics
  const philosophyTerms = {
    "phenomenology": "Phenomenology",
    "consciousness": "Consciousness Studies", 
    "free will": "Free Will",
    "metaphysics": "Metaphysics",
    "epistemology": "Epistemology",
    "ontology": "Ontology",
    "existentialism": "Existentialism",
    "ethics": "Ethics",
    "aesthetics": "Aesthetics",
    "logic": "Logic",
    "philosophy of mind": "Philosophy of Mind",
    "political philosophy": "Political Philosophy"
  };
  
  // Critical Theory
  const criticalTheoryTerms = {
    "deconstruction": "Deconstruction",
    "dialectics": "Dialectical Thinking",
    "frankfurt school": "Frankfurt School",
    "postmodernism": "Postmodernism",
    "critical theory": "Critical Theory"
  };
  
  // AI & Technology
  const aiTechTerms = {
    "artificial intelligence": "Artificial Intelligence",
    "machine learning": "Machine Learning", 
    "ai": "Artificial Intelligence",
    "algorithm": "Algorithms",
    "automation": "Automation",
    "neural network": "Neural Networks",
    "deep learning": "Deep Learning",
    "large language model": "Large Language Models",
    "chatgpt": "ChatGPT",
    "technology": "Technology"
  };
  
  // Healthcare
  const healthTerms = {
    "protein": "Protein Science",
    "nutrition": "Nutrition",
    "functional medicine": "Functional Medicine",
    "injury recovery": "Injury Recovery",
    "supplements": "Dietary Supplements",
    "exercise": "Exercise Science",
    "fitness": "Physical Fitness",
    "longevity": "Longevity Science",
    "health": "Health Sciences"
  };
  
  // Mental Health
  const mentalHealthTerms = {
    "depression": "Depression",
    "anxiety": "Anxiety Disorders",
    "therapy": "Psychotherapy",
    "mindfulness": "Mindfulness",
    "meditation": "Meditation",
    "psychological": "Psychology",
    "mental health": "Mental Health"
  };
  
  // Work Culture
  const workTerms = {
    "remote work": "Remote Work",
    "hybrid work": "Hybrid Work",
    "workplace": "Workplace Dynamics",
    "great resignation": "Great Resignation",
    "future of work": "Future of Work",
    "coworking": "Coworking"
  };
  
  // Economics
  const economicTerms = {
    "capitalism": "Capitalism",
    "labor": "Labor Economics",
    "market": "Market Dynamics", 
    "economy": "Economics",
    "corporate": "Corporate Strategy"
  };
  
  // Religion/Spirituality
  const religiousTerms = {
    "theology": "Theology",
    "faith": "Faith Studies",
    "sacred": "Sacred Studies",
    "divine": "Divinity",
    "buddhism": "Buddhism",
    "christianity": "Christianity",
    "spirituality": "Spirituality",
    "god": "Theology"
  };
  
  // Neuroscience
  const neuroTerms = {
    "brain": "Neuroscience",
    "neuron": "Neuroscience",
    "cognitive": "Cognitive Science",
    "neuroplasticity": "Neuroplasticity"
  };
  
  const allTerms = {
    ...philosophyTerms,
    ...criticalTheoryTerms, 
    ...aiTechTerms,
    ...healthTerms,
    ...mentalHealthTerms,
    ...workTerms,
    ...economicTerms,
    ...religiousTerms,
    ...neuroTerms
  };
  
  // Extract topics
  for (const [term, concept] of Object.entries(allTerms)) {
    if (text.includes(term)) {
      topics.push({"@type": "Thing", "name": concept});
    }
  }
  
  // Extract philosopher/thinker mentions
  const thinkers = {
    "husserl": "Edmund Husserl",
    "heidegger": "Martin Heidegger", 
    "sartre": "Jean-Paul Sartre",
    "descartes": "René Descartes",
    "spinoza": "Baruch Spinoza",
    "kant": "Immanuel Kant",
    "nietzsche": "Friedrich Nietzsche",
    "aristotle": "Aristotle",
    "plato": "Plato",
    "socrates": "Socrates",
    "wittgenstein": "Ludwig Wittgenstein",
    "foucault": "Michel Foucault",
    "derrida": "Jacques Derrida",
    "merleau-ponty": "Maurice Merleau-Ponty"
  };
  
  for (const [term, name] of Object.entries(thinkers)) {
    if (text.includes(term)) {
      mentions.push({"@type": "Person", "name": name});
    }
  }
  
  // Extract interview subjects
  const interviewMatch = title.match(/interview with (.+?)(?:,|$|\.|:)/i);
  if (interviewMatch) {
    const name = interviewMatch[1].trim();
    mentions.push({"@type": "Person", "name": name, "roleName": "Interviewee"});
  }
  
  return { topics, mentions };
};

// Determine academic discipline
const getAcademicDiscipline = (topics, articleTypes) => {
  const typeString = articleTypes.join(" ").toLowerCase();
  
  if (typeString.includes("scholarly")) {
    const topicNames = topics.map(t => t.name.toLowerCase()).join(" ");
    
    if (topicNames.match(/philosophy|phenomenology|consciousness|metaphysics|epistemology|ontology|ethics/)) {
      return "Philosophy";
    }
    if (topicNames.match(/medical|health|clinical|nutrition|protein|exercise/)) {
      return "Medicine";
    }
    if (topicNames.match(/psychology|mental health|cognitive|neuroscience/)) {
      return "Psychology"; 
    }
    if (topicNames.match(/artificial intelligence|technology|computer/)) {
      return "Computer Science";
    }
    if (topicNames.match(/economics|labor|market|capitalism/)) {
      return "Economics";
    }
    if (topicNames.match(/theology|religion|faith|spirituality/)) {
      return "Religious Studies";
    }
  }
  
  return null;
};

// Generate genre classification
const getGenre = (articleTypes, title) => {
  const primaryType = articleTypes[0];
  const titleLower = title.toLowerCase();
  
  switch (primaryType) {
    case "ScholarlyArticle":
      return "Philosophical Analysis";
    case "OpinionNewsArticle": 
      return "Opinion Piece";
    case "AnalysisNewsArticle":
      return "Trend Analysis";
    case "MedicalScholarlyArticle":
      return "Health Research";
    case "TechArticle":
      return "Technology Analysis";
    case "Review":
      return "Critical Review";
    case "HowTo":
      return "Practical Guide";
    case "Interview":
      return "Expert Interview";
    case "CriticalEssay":
      return "Critical Essay";
    default:
      if (titleLower.includes("?")) {
        return "Investigative Piece";
      }
      return "Commentary";
  }
};

// Get educational level
const getEducationalLevel = (articleTypes, topics) => {
  if (articleTypes.includes("ScholarlyArticle")) {
    const topicNames = topics.map(t => t.name.toLowerCase()).join(" ");
    if (topicNames.match(/phenomenology|ontology|epistemology|metaphysics|dialectical/)) {
      return "Graduate";
    }
    return "Undergraduate";
  }
  
  if (articleTypes.includes("HowTo")) {
    return "Beginner";
  }
  
  return null;
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
    
    // INTELLIGENT CLASSIFICATION - analyze content for rich connections
    const articleTypes = classifyArticleType(a.title, description);
    const { topics, mentions } = extractTopics(a.title, description);
    const academicDiscipline = getAcademicDiscipline(topics, articleTypes);
    const genre = getGenre(articleTypes, a.title);
    const educationalLevel = getEducationalLevel(articleTypes, topics);
    
    // Extract keywords from topics
    const extractedKeywords = topics.map(t => t.name).join(", ");
    const finalKeywords = extractedKeywords || (a.keywords || a.tags || "");
    
    // Build the item object with enhanced structured data and rich connections
    const itemObj = {
      "@type": articleTypes, // Can be array for multiple types
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
    
    // Add rich intellectual connections
    if (topics.length > 0) {
      itemObj.about = topics;
    }
    
    if (mentions.length > 0) {
      itemObj.mentions = mentions;
    }
    
    if (finalKeywords) {
      itemObj.keywords = finalKeywords;
    }
    
    if (academicDiscipline) {
      itemObj.academicDiscipline = academicDiscipline;
    }
    
    if (genre) {
      itemObj.genre = genre;
    }
    
    if (educationalLevel) {
      itemObj.educationalLevel = educationalLevel;
    }
    
    // Add relationship indicators
    const titleLower = a.title.toLowerCase();
    if (titleLower.includes("implications of") || titleLower.includes("impact of")) {
      itemObj.contentReferenceTime = "future"; // Indicates forward-looking analysis
    }
    
    if (titleLower.includes("revisited") || titleLower.includes("part 2") || titleLower.includes("further thoughts")) {
      itemObj.isBasedOn = "Previous work by Daniel Lehewych"; // Indicates building on previous ideas
    }
    
    // Add contributor for interviews
    const intervieweeMatch = mentions.find(m => m.roleName === "Interviewee");
    if (intervieweeMatch) {
      itemObj.contributor = {
        "@type": "Person",
        "name": intervieweeMatch.name,
        "roleName": "Interviewee"
      };
    }
    
    // Add optional existing fields
    if (a.dateModified) {
      itemObj.dateModified = a.dateModified + "T00:00:00Z";
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
