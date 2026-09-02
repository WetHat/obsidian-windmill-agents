// import * as wmill from "windmill-client"
import { IItem, IRssAsset, IFlyweightFeed } from "/f/lib/read_rss_feed";
import { IDomain } from "/u/peterernst/rss_feeds_triage/select_best_domain";

const
  illegalRe = /[\/\?<>\\:\*\,|"\[\]#]/g,
  INDICATORS = ["⭕", "⭐", "⭐⭐", "⭐⭐⭐"];

interface IDomainRelevance {
  domain: string,
  relevance: number
};

interface IReadingValue {
  axis: 'actionability' | 'novelty' | 'impact' | 'rigor' | 'depth',
  value: number,
  rationale: string
};

interface IArticleAnalysis {
  highlights: string[],
  expires: string,
  domain_relevance: IDomainRelevance[],
  reading_values: IReadingValue[],
  analyst_notes: string[]
};

export async function main(feed: IFlyweightFeed, item: IItem, markdown: string, domain: IDomain, analysis: IArticleAnalysis) {
  const [actionability, novelty, impact, rigor, depth] = analysis.reading_values.map((ax) => ax.value);

  let reading_value = 0.3 * (domain.relevance / 100 * 3) + 0.2 * actionability + 0.15 * impact + 0.15 * depth + 0.1 * novelty + 0.1 * rigor;
  // non- linear boost for high value articles
  if (impact > 2 && novelty > 2) { reading_value *= 1.1 }
  if (actionability > 2 && depth > 2) { reading_value *= 1.1 }
  reading_value = Math.round(Math.min(3, reading_value));

  const
    filename = item.title.replace(illegalRe, "•").replace(new RegExp('\u00A0', 'g'), ' '), // and non-breaking spaces (thanks @Licat)
    image_embed = (item.media.length > 0 && item.media[0].type === 'image') ? `![image|float:right|200](${item.media[0].src}) ` : '',
    note = `---
type: rssitem
link: "${item.link}"
feed: "${feed.title}"
site: "${feed.site}"
authors: [${item.authors.map(a => `"${a}"`).join(',')}]
published: ${new Date(item.published).toISOString()}
tags: [${item.tags.join(",")}]
headline: "${item.title}"
expires: ${analysis.expires}
domain: ${domain.domain}
relevance: ${domain.relevance}
reading_value: ${INDICATORS[reading_value]}
reading_time: ${Math.round((markdown.match(/\p{L}{2,}\p{M}*|\p{N}+/gu)?.length ?? 0) / 150)}
---
> [!tldr]
> ${image_embed}${item.description}

# Highlights

${analysis.highlights.map(h => '- ' + h).join('\n')}

# Reading Values

| Axis | Value | Rationale |
| --- | --- | --- |
${analysis.reading_values.map(v => `| ${v.axis} |${INDICATORS[v.value]} | ${v.rationale} |`).join(`\n`)}

# Analyst Notes

${analysis.analyst_notes.map(n => '- ' + n).join(`\n`)}

- - -

# ${item.title}

${markdown}

- - -

${item.media.map((m: IRssAsset) => `- ![${m.type}|${m.width > 0 ? m.width : 64}](${m.src})`).join('\n')}
`;

  return {
    filename: `${filename} - ${Date.now().toString(36)}`,
    note
  }
}
