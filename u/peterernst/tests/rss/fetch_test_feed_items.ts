import * as wmill from "windmill-client"
import { IFlyweightFeed, IFeedRecord, extract_rss_feed_from_xml } from "/f/lib/read_rss_feed"


export async function main(feed_id: number, item_indices: number[]): Promise<IFlyweightFeed> {
  // 1. lookup feed from the data table
  const
    sql = wmill.datatable('rss'),
    feed_data = await sql`SELECT * from test_feeds WHERE id=${feed_id}`.fetchOne();
  if (!feed_data) {
    throw new Error(`Test RSS feed with id=${feed_id} not found in test_feeds`)
  }

  // 2. Extract the requested feed items
  const rec: IFeedRecord = {
    feed_name: feed_data.name,
    feed_url: feed_data.url,
    item_limit:100,
    id: feed_id,
    last_scan: null,
    last_item_id: null,
    short_content: feed_data.short_content
  };
  return extract_rss_feed_from_xml(feed_data.xml, rec, item_indices);
}
