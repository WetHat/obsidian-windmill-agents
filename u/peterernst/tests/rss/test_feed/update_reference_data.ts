import * as wmill from "windmill-client"

export async function main(item_id: number, markdown: string) {
  const sql = wmill.datatable('rss');

  await sql`
    UPDATE test_feed_items
    SET item_markdown = ${markdown}
    WHERE id = ${item_id}
  `.execute();
  return item_id;
}
