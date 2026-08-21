import * as wmill from "windmill-client"
import { IItem } from '/f/lib/read_rss_feed'

export interface IItemRecord {
  id: number;
  feed_id: number;
  item_index: number;
  item_markdown: string;
}

export async function main(item: IItem): Promise<IItemRecord> {
  const
    sql = wmill.datatable('rss'),
    item_data = await sql`SELECT * from test_feed_items WHERE feed_id=${item.feed_id} and item_index=${item.item_index}`.fetchOne();

  if (!item_data) {
    throw new Error(`Reference data for feed ${item.feed_id}; item_index ${item.item_index} missing!`)
  }
  return item_data as IItemRecord;
}
