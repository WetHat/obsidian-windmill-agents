import * as wmill from "windmill-client"
import { IFlyweightFeed, IItem } from "/f/lib/read_rss_feed"
import { createClient } from "redis";

export async function main(feed: IFlyweightFeed): Promise<number[]> {
  const
    sql = wmill.datatable('rss'),
    client = createClient({ url: "redis://redis:6379" }),
    item_IDs: number[] = [];

  await client.connect();
  // 3. create the feed Items
  for (const handle of feed.item_handles) {
    // dehydrate the handle and insert items
    const
      item = await client.json.get(handle) as IItem,
      row = await sql`
INSERT INTO feed_item_tests (feed_id, item)
VALUES (${feed.id}, ${item} )
RETURNING id;`.fetchOne();
    if (!row) {
      throw new Error(`Item ${item.title} was not registered`);
    }
    item_IDs.push(row.id)
  }
  return item_IDs;
}