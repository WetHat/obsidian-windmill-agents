import * as wmill from "windmill-client";
import { IFlyweightFeed, extract_rss_feed_from_xml } from "/f/lib/read_rss_feed";

export async function main(feed_url: string, item_limit: number): Promise<IFlyweightFeed> {
  const resp = await fetch(feed_url, {
    headers: {
      "Accept": "application/xml, text/xml, application/rss+xml"
    }
  });

  if (!resp.ok) {
    throw new Error(`Feed request failed: ${resp.status}`);
  }

  // 1. record in the feed test database to get its unique id
  const
    xml = await resp.text(),
    sql = wmill.datatable('rss'),
    row = await sql`
INSERT INTO feed_tests (feed_url, feed_xml, name)
VALUES (${feed_url}, ${xml}, ${"Test Feed"})
RETURNING id;`.fetchOne();

  if (!row?.id) {
    throw new Error('Feed registration failed');
  }

  // 2. parse the feed and get the requested number of items
  const feed = await extract_rss_feed_from_xml(xml, {
    id: row.id,
    feed_name: "Test Feed",
    feed_url,
    item_limit,
    last_scan: null,
    short_content: false
  });
  // update the feed title
  await sql`UPDATE feed_tests SET name = ${feed.title} WHERE id = ${row.id}`.execute();

  return feed;
}