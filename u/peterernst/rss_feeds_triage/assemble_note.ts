// import * as wmill from "windmill-client"
import { IItem, IFlyweightFeed } from "/f/lib/read_rss_feed";

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

export async function main(feed: IFlyweightFeed, item: IItem, analysis: IArticleAnalysis) {
  const
    top = analysis.domain_relevance.reduce((max, cur) => (cur.relevance > max.relevance ? cur : max),
      analysis.domain_relevance[0]),
    [actionability, novelty, impact, rigor, depth] = analysis.reading_values.map((ax) => ax.value);

  let reading_value = 0.3 * top.relevance + 0.2 * actionability + 0.15 * impact + 0.15 * depth + 0.1 * novelty + 0.1 * rigor;
  // non- linear boost for high value articles
  if (impact > 2 && novelty > 2) { reading_value *= 1.1 }
  if (actionability > 2 && depth > 2) { reading_value *= 1.1 }
  reading_value = Math.round(Math.min(3, reading_value));

  const
    filename = item.title.replace(illegalRe, "•").replace(new RegExp('\u00A0', 'g'), ' '), // and non-breaking spaces (thanks @Licat)
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
domain: ${top.domain}
relevance: ${INDICATORS[top.relevance]}
reading_value: ${INDICATORS[reading_value]}
reading_time: ${Math.round((item.markdown.match(/\p{L}{2,}\p{M}*|\p{N}+/gu)?.length ?? 0) / 150)}
---
> [!tldr]
> ${item.description}

# Highlights

${analysis.highlights.map(h => '- ' + h).join('\n')}

# Reading Values

| Axis | Value | Rationale |
| --- | --- | --- |
${analysis.reading_values.map(v => `| ${v.axis} |${INDICATORS[v.value]} | ${v.rationale} |`).join(`\n`)}

# Analyst Notes

- - -

${item.markdown}

`;

  return {
    filename: `${filename} - ${Date.now().toString(36)}`,
    note
  }
}
