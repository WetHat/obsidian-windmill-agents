// import * as wmill from "windmill-client"
import { IRssAsset, IFlyweightFeed } from "/f/lib/read_rss_feed";
import { IDomain } from "/u/peterernst/rss_feeds_triage/select_best_domain";
import { IMarkdownItem } from "/u/peterernst/rss_feeds_triage/item_to_markdown";

export async function main(feed: IFlyweightFeed, item: IMarkdownItem, domain: IDomain) {
  const
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
domain: ${domain.domain}
relevance: ${domain.relevance}
reading_time: ${item.ttr ?? 0}
---
> [!tldr]
> ${image_embed}${item.description}

# ${item.title}

${item.content}

- - -

${item.media.map((m: IRssAsset) => `- ![${m.type}|${m.width > 0 ? m.width : 64}](${m.src})`).join('\n')}
`;

  return {
    filename: `${item.title} - ${Date.now().toString(36)}`,
    note
  }
}
