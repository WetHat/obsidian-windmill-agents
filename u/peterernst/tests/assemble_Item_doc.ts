import * as wmill from "windmill-client";
import { IItem } from "/f/lib/read_rss_feed";

export async function main(item: IItem, item_id: number, item_markdown: string): Promise<string> {
  // lookup feed
  const
    sql = wmill.datatable('rss'),
    feed_row = await sql`select * from feed_tests where id = ${item.feed_id}`.fetchOne();

  if (!feed_row) {
    throw new Error(`RSS feed ${item.feed_id} for item ${item.id} not found in feed_tests`);
  }

  const markdown = `---
type: rssitem
feed_id: ${item.feed_id}
item_id: ${item_id}
item_index: ${item.item_index}
guid: ${item.id}
feed: "${feed_row.name}"
published: ${new Date(item.published).toISOString()}
title: "${item.title}"
description: >-
  ${item.description.split('\n').join('\n  ')}
authors: [${item.authors.map(a => '"' + a.trim() + '"').join(',')}]
tags: [${item.tags.map(t => t.trim()).join(',')} ]
---

${item_markdown}`;

  return markdown;
}
