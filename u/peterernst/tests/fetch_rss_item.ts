
import * as wmill from "windmill-client"
import { IItem } from "/f/lib/read_rss_feed"

export async function main(item_id: number): Promise<{ item_id: number, item: IItem }> {

  // fetch item from database
  const
    sql = wmill.datatable('rss'),
    item_row = await sql`select * from feed_item_tests where id = ${item_id}`.fetchOne();

  if (!item_row) {
    throw new Error(`RSS item with in rss_item_tests`);
  }
  return {
    item_id,
    item: item_row.item as IItem
  }
}