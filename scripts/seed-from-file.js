#!/usr/bin/env node
/**
 * Seed historical corpus into data/articles.json (Node 18+ / 20+, no deps)
 * Usage: node scripts/seed-from-file.js path/to/export.json
 *
 * Accepts either:
 *   { metadata: {...}, articles: [ ... ] }
 * or just: [ ... ]
 */
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

(async function main(){
  const inputPath = process.argv[2] || 'data/corpus.json';
  const outPath   = path.join('data', 'articles.json');

  const raw = await fs.readFile(inputPath, 'utf8').catch(e=>{
    console.error(`Could not read ${inputPath}: ${e.message}`);
    process.exit(1);
  });

  let doc;
  try { doc = JSON.parse(raw); } catch(e){
    console.error(`Invalid JSON in ${inputPath}: ${e.message}`);
    process.exit(1);
  }

  const rows = Array.isArray(doc) ? doc : Array.isArray(doc.articles) ? doc.articles : [];
  if (!rows.length){
    console.error('No articles found. Expected an array or { articles: [...] }');
    process.exit(1);
  }

  // ---- Helpers (mirrors discovery.js logic where it matters) ----
  function normalizeUrl(input, canonicalHref){
    try {
      const raw = new URL(canonicalHref || input);
      const drop = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','gclid','fbclid','mc_cid','mc_eid','igshid','ref','ref_src'];
      drop.forEach(p => raw.searchParams.delete(p));
      if (raw.pathname !== '/' && raw.pathname.endsWith('/')) raw.pathname = raw.pathname.slice(0, -1);
      raw.pathname = raw.pathname.replace(/\/(index|home)\.(html?|php)$/i, '');
      raw.host = raw.host.toLowerCase();
      raw.hash = '';
      return `${raw.protocol}//${raw.host}${raw.pathname}${raw.search}`;
    } catch { return input; }
  }
  function contentFingerprint(title, subtitle=''){
    return crypto.createHash('sha256').update(`${(title||'')}\n${(subtitle||'')}`.toLowerCase().trim()).digest('hex');
  }
  function cleanTitle(title=''){
    return title
      .replace(/ - Medium$/i,'')
      .replace(/ \| Newsweek$/i,'')
      .replace(/ - Big Think$/i,'')
      .replace(/ by Daniel Lehewych.*$/i,'')
      .trim();
  }
  const topicPatterns = {
    "Philosophy": /philosoph|metaphysics|epistemology|ontology|phenomenolog|existential/i,
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
    "Religion & Spirituality": /god|divine|theology|religious|faith|buddhis|christian|sacred/i,
    "Science": /science|scientific|research|study|experiment|data|evidence|empirical/i,
    "Climate & Environment": /climate|environment|sustainability|carbon|renewable|ecology/i
  };
  const typePatterns = {
    "ScholarlyArticle": /phenomenology|epistemology|metaphysics|ontology|dialectic|philosophical|examine|analysis of|critique|dissertation/i,
    "OpinionNewsArticle": /\b(opinion|should|must|need to|why we|it's time|we need|believe|argue|contend)\b/i,
    "HowTo": /how to|guide to|tips for|steps to|ways to|tutorial|strategies|method|technique|here's how/i,
    "AnalysisNewsArticle": /analysis|analyzing|trend|future of|landscape|forecast|examining|impact of|data shows/i,
    "Review": /review|reviewing|assessment of|evaluation|critique of|book review|product review/i
  };
  function detectTopics(title, desc, platform){
    const set = new Set();
    const txt = `${title||''} ${desc||''}`.toLowerCase();
    if (platform === 'Newsweek') set.add('Politics & Society');
    if (/(allwork\.space)/i.test(desc) || platform === 'Allwork.Space') { set.add('Work & Career'); set.add('Digital Culture'); }
    for (const [topic, re] of Object.entries(topicPatterns)) if (re.test(txt)) set.add(topic);
    if (!set.size) set.add('General');
    return [...set];
  }
  function detectArticleType(title, platform){
    if (platform === 'Newsweek') return 'OpinionNewsArticle';
    for (const [type, re] of Object.entries(typePatterns)) if (re.test(title||'')) return type;
    return 'BlogPosting';
  }
  function toISODate(d){
    if (!d) return null;
    const x = new Date(d);
    return isNaN(x) ? null : x.toISOString().slice(0,10);
  }

  // ---- Transform + dedupe ----
  const seen = new Set();
  const now = Date.now();
  let kept = 0, skipped = 0;

  const out = [];

  for (let i=0;i<rows.length;i++){
    const r = rows[i] || {};
    const url = r.url;
    const title = cleanTitle(r.title || '');
    if (!url || !title){ skipped++; continue; }

    const normalizedUrl = normalizeUrl(url);
    if (seen.has(normalizedUrl)) { skipped++; continue; }
    seen.add(normalizedUrl);

    const platform = (r.platform && String(r.platform)) || 'Unknown';
    const date = toISODate(r.date) || toISODate(r.published_at) || toISODate(r.created_at) || new Date().toISOString().slice(0,10);
    const snippet = (r.subtitle || '').trim();

    const platformSlug = platform.toLowerCase().replace(/[^a-z0-9]/g,'-');
    const titleSlug = (title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').substring(0,50)) || 'entry';
    const urlSlug = `/archive/${platformSlug}/${titleSlug}`;

    const topics = detectTopics(title, snippet, platform);
    const type   = detectArticleType(title, platform);
    const fingerprint = contentFingerprint(title, snippet);

    out.push({
      id: r.id || (now + i),
      title,
      url,
      normalizedUrl,
      platform,
      date,
      snippet,
      fingerprint,
      version: 1,
      schemas: { urlSlug, type, topics },
      discoveredAt: new Date().toISOString()
    });
    kept++;
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(out, null, 2));
  console.log(`Seed complete → ${outPath}`);
  console.log(`Kept: ${kept} | Duplicates/invalid skipped: ${skipped}`);
})();
