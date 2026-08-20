import * as wmill from "windmill-client"
import { IFeedMeta, extract_rss_feed_from_xml } from "/f/lib/read_rss_feed";

export async function main(feed_url: string) {

  // 1. Obtein the fedd's xml 
  const resp = await fetch(feed_url, {
    headers: {
      "Accept": "application/xml, text/xml, application/rss+xml"
    }
  });

  if (!resp.ok) {
    throw new Error(`Feed request failed: ${resp.status}`);
  }

  const
    xml = await resp.text(),
    meta: IFeedMeta = {
      id: 99,
      feed_name: "Test Feed",
      feed_url,
      last_scan: null,
      short_content: false
    };

  // 2. parse the feed but get no items at this point
  const feed = await extract_rss_feed_from_xml(xml, meta, []);

  // 3. Register the feed in the test database

  const
    sql = wmill.datatable('rss'),
    row = await sql`
INSERT INTO test_feeds (name, url, xml)
VALUES (${feed.title}, ${feed_url}, ${xml})`.fetchOne();

  return {
    status: resp.status,
    row
  };
}
