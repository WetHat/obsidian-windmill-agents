import * as wmill from "windmill-client"

export async function main(feed_id: number): Promise<number[]> {
  const
    sql = wmill.datatable('rss'),
    item_data = await sql`SELECT item_index from test_feed_items WHERE feed_id=${feed_id}`.fetch();

  if (!item_data) {
    throw new Error(`No items to test found for feed ${feed_id} in 'test_feed_items'`)
  }
  return item_data.map(i => i.item_index);
}
