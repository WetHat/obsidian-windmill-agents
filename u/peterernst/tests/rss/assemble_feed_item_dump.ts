// import * as wmill from "windmill-client"
import { IItem } from "/f/lib/read_rss_feed"
import { createClient } from "redis";
import { main as html_to_markdown } from "/f/lib/html_to_markdown";

export async function main(item_handle: string) {

  // 1. dehydrate the item
  const client = createClient({ url: "redis://redis:6379" });
  await client.connect();
  const item = await client.json.get(item_handle) as IItem;

  // 2. convert item content to markdown
  const markdown = html_to_markdown(item.content);

  return {
    filename: `Item ${item.feed_id}_${item.item_index}`,
    markdown
  };
}