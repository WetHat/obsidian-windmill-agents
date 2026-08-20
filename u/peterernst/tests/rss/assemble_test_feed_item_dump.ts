import { createClient } from "redis";
import { IItem } from "/f/lib/read_rss_feed"
import { convert_to_markdown } from "/f/lib/html_to_markdown"

export async function main(item_handle: string) {
  // 1. dehydrate the item
  const client = createClient({ url: "redis://redis:6379" });
  await client.connect();
  const item = await client.json.get(item_handle) as IItem;

  // 2. convert item content to Markdown
  const markdown = convert_to_markdown(item.content);

  // 3. Assemble the item dump content
  const content = `---
type: rssitem
item_index: ${item.item_index}
guid: ${item.id}
feed: "${item.feed_title}"
feed_id: ${item.feed_id}
site: ${item.site_link}
link: ${item.link}
published: ${new Date(item.published).toISOString()}
title: "${item.title}"
description: >-
  ${item.description.split('\n').join('\n  ')}
authors: [${item.authors.map(a => '"' + a.trim() + '"').join(',')}]
tags: [${item.tags.map(t => t.trim()).join(',')} ]
---
${markdown}`;

  return {
    filename: `Feed~${item.feed_id}~Item~${item.item_index}`,
    content
  };
}
