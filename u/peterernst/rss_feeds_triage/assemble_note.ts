// import * as wmill from "windmill-client"
import { IItem, IFlyweightFeed } from "/f/lib/read_rss_feed";

const illegalRe = /[\/\?<>\\:\*\,|"\[\]#]/g;


export async function main(feed: IFlyweightFeed, item: IItem) {
  // and non-breaking spaces (thanks @Licat)
  const
    filename = item.title.replace(illegalRe, "•").replace(new RegExp('\u00A0', 'g'), ' '),
    note = `---
type: rssitem
link: "${item.link}"
feed: "${feed.title}"
site: "${feed.site}"
authors: [${item.authors.map(a => `"${a}"`).join(',')}]
published: ${new Date(item.published).toISOString()}
tags: [${item.tags.join(",")}]
headline: "${item.title}"
---
> [!tldr]
  > ${item.description}

${item.markdown} `;

  return {
    filename: `${filename} - ${Date.now().toString(36)}`,
    note
  }
}
