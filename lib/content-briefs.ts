import type { KeywordRecord, KeywordGapRecord, CompetitorPageRecord, BacklinkRecord, Tag } from './types';

export interface ContentBrief {
  id: string;
  title: string;
  suggestedUrl: string;
  cluster: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  monthlyVolumeTotal: number;
  avgDifficulty: number;
  intentMix: Record<string, number>;
  suggestedContentType: Tag;
  priority: 'High' | 'Medium' | 'Low';
  opportunityScore: number;
  sourceRowCount: number;
  competitorReferences: string[];
  backlinkOrLinkAngleIdeas: string[];
  outline: string[];
  hasPageTarget: boolean;
}

const CLUSTER_KEYS = ['cluster', 'Cluster', 'CLUSTER', 'cluster_name', 'cluster name'];
const PAGE_TARGET_KEYS = ['page_target', 'page target', 'pageTarget', 'Page Target', 'target_page', 'target page', 'page_target_url'];
const PRIORITY_KEYS = ['priority', 'Priority', 'PRIORITY'];
const TAG_KEYS = ['serpvault_tag', 'serpvault tag', 'serpvaultTag', 'SerpVault Tag', 'tag', 'Tag'];

function getRawValue(raw: Record<string, string> | undefined, keys: string[]): string {
  if (!raw) return '';
  for (const k of keys) {
    const val = raw[k];
    if (val !== undefined && val !== null && val !== '') {
      return val.toString().trim();
    }
  }
  return '';
}

export function detectHermesData(keywords: (KeywordRecord | KeywordGapRecord)[]): boolean {
  return keywords.some((k) => {
    const cluster = getRawValue(k.raw, CLUSTER_KEYS);
    const pageTarget = getRawValue(k.raw, PAGE_TARGET_KEYS);
    return !!(cluster || pageTarget);
  });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function generateStableId(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const cleanVal = value.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase().slice(0, 30);
  return `cb_${cleanVal}_${Math.abs(hash)}`;
}

function calculateIntentMix(keywords: (KeywordRecord | KeywordGapRecord)[]): Record<string, number> {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const k of keywords) {
    if (k.intent) {
      const intent = k.intent.trim();
      counts[intent] = (counts[intent] || 0) + 1;
      total++;
    }
  }
  if (total === 0) return {};
  const mix: Record<string, number> = {};
  for (const [intent, count] of Object.entries(counts)) {
    mix[intent] = Math.round((count / total) * 100);
  }
  return mix;
}

function suggestContentType(intentMix: Record<string, number>, existingTag?: Tag, hermesTag?: string): Tag {
  if (existingTag && existingTag !== 'Ignore') return existingTag;

  if (hermesTag) {
    const t = hermesTag.toLowerCase();
    if (t.includes('money') || t.includes('commercial') || t.includes('transactional')) return 'Money Page';
    if (t.includes('blog') || t.includes('informational') || t.includes('guide')) return 'Blog Post';
    if (t.includes('city') || t.includes('local') || t.includes('geo')) return 'City Page';
    if (t.includes('link') || t.includes('bait')) return 'Link Bait';
  }

  // Fallback on intent mix
  const commercialCount = (intentMix['Commercial'] || 0) + (intentMix['Transactional'] || 0) + (intentMix['C'] || 0) + (intentMix['T'] || 0);
  const informationalCount = (intentMix['Informational'] || 0) + (intentMix['I'] || 0);

  if (commercialCount > informationalCount) {
    return 'Money Page';
  }
  return 'Blog Post';
}

function generateOutline(primaryKeyword: string, secondaryKeywords: string[], contentType: Tag): string[] {
  const capitalizedKw = primaryKeyword.charAt(0).toUpperCase() + primaryKeyword.slice(1);
  const sec = secondaryKeywords.slice(0, 3).map((k) => k.charAt(0).toUpperCase() + k.slice(1));

  if (contentType === 'Blog Post') {
    return [
      `## H2: Introduction to ${capitalizedKw}`,
      `### H3: Why ${capitalizedKw} Matters Today`,
      `## H2: Understanding ${capitalizedKw} (Core Concepts)`,
      ...sec.map((s) => `## H2: Key Aspect: ${s}`),
      `## H2: Best Practices & Implementation Guide`,
      `## H2: Common Mistakes to Avoid`,
      `## H2: Summary and Next Steps`,
    ];
  } else if (contentType === 'Money Page') {
    return [
      `## H2: Premium ${capitalizedKw} Solutions`,
      `### H3: Tailored for Excellence`,
      `## H2: Why Partner with Us?`,
      `## H2: Core Features of Our Services`,
      ...sec.map((s) => `### H3: ${s} Capability`),
      `## H2: Our Step-by-Step Delivery Process`,
      `## H2: Frequently Asked Questions about ${capitalizedKw}`,
      `## H2: Ready to Transform? Get in Touch Today`,
    ];
  } else if (contentType === 'City Page') {
    return [
      `## H2: Trusted ${capitalizedKw} in [City/Location]`,
      `### H3: Professional Services Near You`,
      `## H2: Our Local Offerings`,
      ...sec.map((s) => `### H3: ${s} for [City] Clients`),
      `## H2: Why Local Businesses & Residents Choose Us`,
      `## H2: Service Areas in [City] & Surrounding Neighborhoods`,
      `## H2: Request a Free Quote`,
    ];
  } else if (contentType === 'Link Bait') {
    return [
      `## H2: The Ultimate ${capitalizedKw} Report & Insights`,
      `### H3: Key Industry Trends`,
      `## H2: Key Statistics & Facts`,
      ...sec.map((s) => `### H3: Data on ${s}`),
      `## H2: Expert Analysis & Predictions`,
      `## H2: Visualizing the Data (Infographics & Charts)`,
      `## H2: Methodology & Sources`,
    ];
  }

  return [
    `## H2: Overview of ${capitalizedKw}`,
    `## H2: Detailed Insights`,
    ...sec.map((s) => `### H3: Focusing on ${s}`),
    `## H2: Recommendations & Conclusion`,
  ];
}

export function buildContentBriefs(
  keywords: KeywordRecord[],
  keywordGaps: KeywordGapRecord[],
  competitorPages: CompetitorPageRecord[],
  backlinks: BacklinkRecord[]
): ContentBrief[] {
  const combinedKws: (KeywordRecord | KeywordGapRecord)[] = [...keywords, ...keywordGaps];
  const hasHermes = detectHermesData(combinedKws);

  if (hasHermes) {
    // Group by page_target (if present), otherwise by cluster
    const groups: Record<string, {
      title: string;
      cluster: string;
      keywords: (KeywordRecord | KeywordGapRecord)[];
      priority: 'High' | 'Medium' | 'Low';
      suggestedTag?: string;
    }> = {};

    for (const k of combinedKws) {
      const r = k.raw || {};
      const cluster = getRawValue(r, CLUSTER_KEYS);
      const pageTarget = getRawValue(r, PAGE_TARGET_KEYS);
      const prioVal = getRawValue(r, PRIORITY_KEYS).toLowerCase();
      const hermesTag = getRawValue(r, TAG_KEYS);

      if (!cluster && !pageTarget) continue;

      const title = pageTarget || cluster;
      const groupKey = pageTarget ? `pt:${pageTarget}` : `c:${cluster}`;

      let priority: 'High' | 'Medium' | 'Low' = 'Medium';
      if (prioVal.includes('high') || (k.opportunityScore && k.opportunityScore >= 70)) {
        priority = 'High';
      } else if (prioVal.includes('low') || (k.opportunityScore && k.opportunityScore < 40)) {
        priority = 'Low';
      }

      if (!groups[groupKey]) {
        groups[groupKey] = {
          title,
          cluster: cluster || 'General',
          keywords: [],
          priority,
          suggestedTag: hermesTag || undefined,
        };
      } else {
        if (priority === 'High') {
          groups[groupKey].priority = 'High';
        } else if (priority === 'Medium' && groups[groupKey].priority === 'Low') {
          groups[groupKey].priority = 'Medium';
        }
      }
      groups[groupKey].keywords.push(k);
    }

    return Object.entries(groups).map(([groupKey, g]) => {
      // Find primary keyword: highest volume, fallback to opportunityScore, fallback to alphabetical
      const sortedKws = [...g.keywords].sort((a, b) => {
        const volA = a.volume ?? 0;
        const volB = b.volume ?? 0;
        if (volB !== volA) return volB - volA;
        const scoreA = a.opportunityScore ?? 0;
        const scoreB = b.opportunityScore ?? 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return a.keyword.localeCompare(b.keyword);
      });

      const primary = sortedKws[0]?.keyword || g.title;
      const secondary = sortedKws.slice(1).map((k) => k.keyword);
      const monthlyVolumeTotal = g.keywords.reduce((sum, k) => sum + (k.volume ?? 0), 0);

      const difficultyKws = g.keywords.filter((k) => k.difficulty !== undefined && k.difficulty !== null);
      const avgDifficulty = difficultyKws.length > 0
        ? Math.round(difficultyKws.reduce((sum, k) => sum + (k.difficulty ?? 0), 0) / difficultyKws.length)
        : 0;

      const intentMix = calculateIntentMix(g.keywords);

      // Resolve tag
      const existingTag = g.keywords.find((k) => k.tag && k.tag !== 'Ignore')?.tag;
      const suggestedContentType = suggestContentType(intentMix, existingTag, g.suggestedTag);

      const avgScore = Math.round(g.keywords.reduce((sum, k) => sum + (k.opportunityScore ?? 0), 0) / g.keywords.length);

      // Find competitor page matches
      const compRefs = competitorPages
        .filter((cp) => {
          const urlLower = cp.url.toLowerCase();
          const titleLower = (cp.title || '').toLowerCase();
          const pLower = primary.toLowerCase();
          return urlLower.includes(pLower) || titleLower.includes(pLower);
        })
        .map((cp) => cp.url)
        .slice(0, 5);

      // Find backlink matches
      const matchedBacklinks = backlinks.filter((bl) => {
        const anchorLower = (bl.anchorText || '').toLowerCase();
        const srcLower = bl.sourceUrl.toLowerCase();
        const pLower = primary.toLowerCase();
        return anchorLower.includes(pLower) || srcLower.includes(pLower);
      });

      const linkAngles: string[] = [];
      if (matchedBacklinks.length > 0) {
        matchedBacklinks.slice(0, 3).forEach((bl) => {
          linkAngles.push(`Target competitor backlink source: ${bl.sourceUrl}${bl.anchorText ? ` (Anchor: "${bl.anchorText}")` : ''}`);
        });
      }

      // Add default link angle based on content type
      if (suggestedContentType === 'Blog Post') {
        linkAngles.push(`Resource Link Building: Outreach to niche resource lists covering ${primary}.`);
        linkAngles.push(`Internal Links: Link from existing informational content covering related topics.`);
      } else if (suggestedContentType === 'Money Page') {
        linkAngles.push(`Commercial Comparison Outreach: Secure links from industry review sites listing top providers.`);
        linkAngles.push(`Partner mentions: Partner with complementary service providers for reciprocal recommendations.`);
      } else {
        linkAngles.push(`Skyscraper technique: Identify high-performing competitor assets and pitch superior content.`);
      }

      return {
        id: generateStableId(groupKey),
        title: g.title,
        suggestedUrl: g.title.startsWith('/') || g.title.startsWith('http') ? g.title : `/${slugify(g.title)}`,
        cluster: g.cluster,
        primaryKeyword: primary,
        secondaryKeywords: secondary,
        monthlyVolumeTotal,
        avgDifficulty,
        intentMix,
        suggestedContentType,
        priority: g.priority,
        opportunityScore: avgScore || 50,
        sourceRowCount: g.keywords.length,
        competitorReferences: compRefs,
        backlinkOrLinkAngleIdeas: linkAngles,
        outline: generateOutline(primary, secondary, suggestedContentType),
        hasPageTarget: groupKey.startsWith('pt:'),
      };
    });
  } else {
    // Fallback: create briefs from tagged or high opportunity keywords
    const candidates = combinedKws.filter((k) => {
      return (k.tag && k.tag !== 'Ignore') || (k.opportunityScore && k.opportunityScore >= 70);
    });

    if (candidates.length === 0) return [];

    // Simple clustering
    const sortedCandidates = [...candidates].sort((a, b) => {
      const scoreA = a.opportunityScore ?? 0;
      const scoreB = b.opportunityScore ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return (b.volume ?? 0) - (a.volume ?? 0);
    });

    const briefs: ContentBrief[] = [];
    const groupedIds = new Set<string>();

    for (const seed of sortedCandidates) {
      if (groupedIds.has(seed.id)) continue;

      // Group related keywords
      const clusterKws = [seed];
      groupedIds.add(seed.id);

      const seedLower = seed.keyword.toLowerCase();

      for (const candidate of sortedCandidates) {
        if (groupedIds.has(candidate.id)) continue;
        const candLower = candidate.keyword.toLowerCase();

        // Match if one contains the other
        if (candLower.includes(seedLower) || seedLower.includes(candLower)) {
          clusterKws.push(candidate);
          groupedIds.add(candidate.id);
        }
      }

      const primary = seed.keyword;
      const secondary = clusterKws.slice(1).map((k) => k.keyword);
      const monthlyVolumeTotal = clusterKws.reduce((sum, k) => sum + (k.volume ?? 0), 0);

      const difficultyKws = clusterKws.filter((k) => k.difficulty !== undefined && k.difficulty !== null);
      const avgDifficulty = difficultyKws.length > 0
        ? Math.round(difficultyKws.reduce((sum, k) => sum + (k.difficulty ?? 0), 0) / difficultyKws.length)
        : 0;

      const intentMix = calculateIntentMix(clusterKws);
      const existingTag = seed.tag;
      const suggestedContentType = suggestContentType(intentMix, existingTag);

      let priority: 'High' | 'Medium' | 'Low' = 'Medium';
      if ((seed.opportunityScore ?? 0) >= 70) {
        priority = 'High';
      } else if ((seed.opportunityScore ?? 0) < 40) {
        priority = 'Low';
      }

      // Find competitor page matches
      const compRefs = competitorPages
        .filter((cp) => {
          const urlLower = cp.url.toLowerCase();
          const titleLower = (cp.title || '').toLowerCase();
          const pLower = primary.toLowerCase();
          return urlLower.includes(pLower) || titleLower.includes(pLower);
        })
        .map((cp) => cp.url)
        .slice(0, 5);

      // Find backlink matches
      const matchedBacklinks = backlinks.filter((bl) => {
        const anchorLower = (bl.anchorText || '').toLowerCase();
        const srcLower = bl.sourceUrl.toLowerCase();
        const pLower = primary.toLowerCase();
        return anchorLower.includes(pLower) || srcLower.includes(pLower);
      });

      const linkAngles: string[] = [];
      if (matchedBacklinks.length > 0) {
        matchedBacklinks.slice(0, 3).forEach((bl) => {
          linkAngles.push(`Target competitor backlink source: ${bl.sourceUrl}${bl.anchorText ? ` (Anchor: "${bl.anchorText}")` : ''}`);
        });
      }

      if (suggestedContentType === 'Blog Post') {
        linkAngles.push(`Resource Link Building: Outreach to niche resource lists covering ${primary}.`);
      } else if (suggestedContentType === 'Money Page') {
        linkAngles.push(`Commercial Comparison Outreach: Secure links from industry review sites listing top providers.`);
      } else {
        linkAngles.push(`Skyscraper technique: Identify high-performing competitor assets and pitch superior content.`);
      }

      briefs.push({
        id: generateStableId(`fallback:${primary}`),
        title: primary,
        suggestedUrl: `/${slugify(primary)}`,
        cluster: seed.tag || 'General',
        primaryKeyword: primary,
        secondaryKeywords: secondary,
        monthlyVolumeTotal,
        avgDifficulty,
        intentMix,
        suggestedContentType,
        priority,
        opportunityScore: seed.opportunityScore ?? 50,
        sourceRowCount: clusterKws.length,
        competitorReferences: compRefs,
        backlinkOrLinkAngleIdeas: linkAngles,
        outline: generateOutline(primary, secondary, suggestedContentType),
        hasPageTarget: false,
      });
    }

    return briefs;
  }
}

export function generateContentBriefMarkdown(brief: ContentBrief): string {
  const date = new Date().toLocaleDateString();
  const intentStr = Object.entries(brief.intentMix)
    .map(([intent, pct]) => `${intent}: ${pct}%`)
    .join(', ');

  const secKwList = brief.secondaryKeywords.length > 0
    ? brief.secondaryKeywords.map((k) => `- ${k}`).join('\n')
    : '_None_';

  const compList = brief.competitorReferences.length > 0
    ? brief.competitorReferences.map((url) => `- [${url}](${url})`).join('\n')
    : '_No competitor references found in uploaded competitor data._';

  const linkAnglesList = brief.backlinkOrLinkAngleIdeas.length > 0
    ? brief.backlinkOrLinkAngleIdeas.map((idea) => `- ${idea}`).join('\n')
    : '_None_';

  const outlineList = brief.outline.join('\n');

  return `# Content Brief: ${brief.title}
*Generated on ${date} by SERPVault*

## 1. Overview & Metadata
- **Topic/Cluster:** ${brief.cluster}
- **Suggested Content Type:** ${brief.suggestedContentType}
- **Priority:** ${brief.priority} (Opportunity Score: ${brief.opportunityScore})
- **Suggested URL:** \`${brief.suggestedUrl}\`
- **Total Monthly Search Volume:** ${brief.monthlyVolumeTotal.toLocaleString()}
- **Average Keyword Difficulty:** ${brief.avgDifficulty} / 100
- **Intent Mix:** ${intentStr || 'Not Specified'}

## 2. Target Keywords
### Primary Keyword
- **${brief.primaryKeyword}**

### Secondary Keywords
${secKwList}

## 3. Competitor References
${compList}

## 4. Recommended Outline
${outlineList}

## 5. On-Page SEO Checklist
- [ ] **Title Tag:** Include primary keyword near the beginning. Keep under 60 characters.
- [ ] **Meta Description:** Write a compelling meta description containing the primary keyword and a clear call-to-action (CTA). Keep under 160 characters.
- [ ] **H1 Heading:** Ensure there is only one H1 heading on the page and it contains the primary keyword.
- [ ] **Introductory Paragraph:** Mention the primary keyword naturally within the first 100 words.
- [ ] **Heading Structure:** Use H2s and H3s containing secondary keywords naturally.
- [ ] **Keyword Distribution:** Distribute secondary keywords throughout the body text naturally. Avoid keyword stuffing.
- [ ] **Internal Linking:** Add links to this new page from at least 3-5 existing, contextually relevant articles on your site.
- [ ] **External Authority Links:** Link out to 2-3 high-quality, non-competing external resources or databases.
- [ ] **Visual Media:** Embed relevant images or videos with descriptive Alt Text containing primary or secondary keywords.
- [ ] **URL Slug:** Keep slug short, descriptive, and containing the primary keyword.

## 6. Backlink & Link Angle Ideas
${linkAnglesList}
`;
}
