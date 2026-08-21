import { IItem } from "/f/lib/read_rss_feed"

export async function main(item: IItem) {
  return `FAIL: item ${item.item_index} of feed ${item.feed_id}`
}