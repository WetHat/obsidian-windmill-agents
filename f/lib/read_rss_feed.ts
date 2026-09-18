import * as wmill from "windmill-client"
import { createClient } from "redis";
import { extract, extractFromXml, FeedData, ParserOptions } from "@extractus/feed-extractor";

/**
 * Metadata describing an RSS feed configuration.
 *
 * Represents the static properties required to read, limit, and process
 * a feed during ingestion. This structure is provided as input
 * to the RSS scanning flow.
 */
export interface IFeedRecord {
  /**
   * Feed ID in the rss_feeds table.
   */
  id: number,
  /**
   * Human‑readable name of the feed.
   * Example: "Ars Technica – AI"
   */
  feed_name: string,
  /**
   * URL of the RSS or Atom feed.
   * Must be a valid HTTP/HTTPS URL.
   */
  feed_url: string,
  /**
   * ISO timestamp of the feed's publish date when items were last scanned.
   * If null, the feed has never been scanned.
   */
  last_scan: string | null,
  /**
   * The unique id of the last item retrievmd in the last scan
   */
  last_item_id: string | null,
  /**
   * The maximum number of items to retrieve for this feed.
   */
  item_limit: number,
  /**
   * Indicates whether the feed items have short summaries only.
   */
  short_content: boolean
}

interface IFeed extends FeedData {
  image?: IRssAsset;
  tags: string[]; // a list of tags describing the feed.
  /**
   * ISO date and time when the feed was published
   */
  published: string,
  scanned: string; // ISO date of item retrieval
}

export type TAssetType = '?' | 'audio' | 'video' | 'image';

/**
 * An RSS feed item (article). Extends a generic string-keyed map for Redis serialization.
 */
export interface IItem {
  [key: string]: any; // index signature for Redis
  /** Parent rss_table record id. */
  feed_id: number;
  /** Human readable title of the feed */
  feed_title: string;
  /** Url of website or blog the feed is for */
  site_link: string;
  /** Index of the item describing its position in the feed */
  item_index: number;
  /** Unique item identifier (e.g. GUID or URL hash). */
  id: string;
  /** Item title. */
  title: string;
  /** Link to the full article. */
  link: string;
  /** ISO 8601 publish date. */
  published: string;
  /** Short item description / summary. */
  description: string;
  /** One or more authors. */
  authors: string[];
  /** Tags / categories describing the item. */
  tags: string[];
  /** Item content as HTML fragment. */
  content: string;
  media: IRssAsset[];
}

export interface IRssAsset {
  src: string; // hyperlink to object
  type: TAssetType;
  width: number; // optional embedding width
  height: number; // optional embedding height
}

/**
 * Lightweight feed metadata (excludes full item bodies — items are stored separately in Redis).
 */
export interface IFlyweightFeed {
  /** rss_table record id. */
  id: number;
  /** Feed title. */
  title: string;
  /** Link to feed site */
  site: string;
  /** Optional feed-level image / icon. */
  image?: IRssAsset;
  /** Tags / categories describing the feed. */
  tags: string[];
  /** Publish date of the feed */
  published: string,
  /** Redis keys pointing to the feed's item objects. */
  item_handles: string[];
  /** ISO 8601 timestamp of the feed's publish date when items were last scanned. */
  scanned: string;
  /** Unique Id of the newest retrieved feed item; `null if no item was retrieved` */
  last_item_id: string | null,
  /** `true` if item content is short */
  short_content: boolean;
}

//=====================

/**
 * Gather media associated with an RSS item.
 * @param elem - The parsed RSS item
 * @returns A media content list.
 */
function assembleMedia(elem: Record<string, any>): IRssAsset[] {
  let
    mediaContent = elem["media:content"] || elem["enclosure"],
    media: IRssAsset[] | null = null;

  if (!mediaContent) {
    let group = elem["media:group"];
    if (group) {
      mediaContent = group["media:content"];
    }
  }

  if (mediaContent && !Array.isArray(mediaContent)) {
    mediaContent = [mediaContent];
  }

  if (mediaContent) {
    media = mediaContent.map((mc: Record<string, any>): IRssAsset => {
      const type: string = mc["@_type"] || mc["@_medium"];
      let mediumType: TAssetType = '?';
      if (type) {
        if (type.includes("image")) {
          mediumType = 'image';
        } else if (type.match(/video|shock/)) {
          mediumType = 'video';
        } else if (type.includes("audio")) {
          mediumType = 'audio';
        }
      }

      let medium: IRssAsset = { src: mc["@_url"], type: mediumType, width: -1, height: -1 };
      const
        width: string = mc["@_width"],
        height: string = mc["@_height"];
      if (width && height) {
        medium["width"] = parseInt(width);
        medium["height"] = parseInt(height);
      }
      return medium;
    });
  }
  return media ?? [];
}

/**
 * Get the _signature_ image associated with a feed or item
 * @param elem
 * @returns Image medium object, if available.
 */
function assembleImage(elem: Record<string, unknown>): IRssAsset | null {
  let { image } = elem as any;

  if (typeof image === 'string') {
    return { src: image, type: 'image', width: -1, height: -1 };
  }

  if (image && image.url) {
    const
      { url, width, height } = image as any,
      img: IRssAsset = { src: url, type: 'image', width: width ?? -1, height: height ?? -1 };
    return img;
  }

  let thumb = elem["media:thumbnail"] as any;
  if (!thumb) {
    const group = elem["media:group"] as any;
    if (group) {
      thumb = group["media:thumbnail"] as any;
    }
  }

  if (thumb) {
    const
      [width, height] = [thumb["@_width"], thumb["@_height"]],
      img: IRssAsset = { src: thumb["@_url"], type: 'image', width: width ?? -1, height: height ?? -1 };
    return img;
  }

  const enc = elem.enclosure as any;
  if (enc?.["@_type"]?.includes("image")) {
    return { src: enc["@_url"], type: 'image', width: -1, height: -1 };
  }

  let media = elem["media:content"] as any;
  if (media && media["@_type"]?.includes("image")) {
    const
      [width, height] = [media["@_width"], media["@_height"]],
      img: IRssAsset = { src: media["@_url"], type: 'image', width: width ?? -1, height: height ?? -1 };
    return img;
  }
  return null;
}

function assembleDescription(elem: Record<string, any>): string | null {
  let description = elem.description || elem["media:description"];
  if (!description) {
    const group = elem["media:group"];
    if (group) {
      description = group["media:description"];
    }
  }

  if (typeof description === 'object') {
    description = description["#text"] ?? null;
  }
  return description ?? null;
}

/**
 * Normalizes and extracts tag/category information from a feed element.
 *
 * This utility handles the inconsistent ways RSS/Atom feeds encode tags:
 * - Some feeds expose a single `category` field as a string.
 * - Others provide an array of category objects.
 * - Some use custom structures such as `{ term: string }` or `{ name: string }`.
 * - Some embed tags inside nested metadata objects.
 *
 * `assembleTags` unifies all of these into a clean `string[]` of tag names.
 *
 * @param elem - A feed element or parsed RSS/Atom item. The function inspects
 *               known tag-related fields such as `category`, `categories`,
 *               `tags`, or nested objects like `{ category: { term } }`.
 *
 * @returns A normalized array of tag strings. Returns an empty array when no
 *          tag-like fields are present or when all extracted values are invalid.
 *
 * @remarks
 * - The function is defensive: it ignores non-string values.
 * - Duplicate tags are removed.
 * - Leading/trailing whitespace is trimmed.
 * - Nested objects are inspected for common tag keys (`term`, `name`, `label`).
 *
 * @see
 * - `assembleImage` — similar normalization helper for image assets.
 * - RSS 2.0 Specification: https://www.rssboard.org/rss-specification
 * - Atom Format: https://datatracker.ietf.org/doc/html/rfc4287
 */
function assembleTags(elem: Record<string, unknown>): string[] {
  if (elem.category === null) {
    elem.category = [];
  } else if (typeof elem.category === 'string') {
    elem.category = [elem.category];
  }

  if (Array.isArray(elem.category)) {
    const tags: string[] = (elem.category as Array<string | object> ?? [])
      .map((c: string | object) => {
        let tag: string | object;
        if (typeof c === "string") {
          tag = c;
        } else if (typeof c === "object") {
          const cObj = c as { [key: string]: string };
          tag = cObj["#text"] || cObj["@_term"] || cObj["@_label"] || c.toString();
        } else {
          tag = '?'
        }
        tag = tag?.replace(/[-+&/]/g, " ");
        tag = tag.replace(/\b\w/g, c => c.toUpperCase());
        return tag.replace(/\s+/, '');

      })
      .join(",") // turn everything into a comma separated list to catch internal commas
      .split(",") // abd pull it apart again
      .map(c => {
        // return one cleaned up category
        return c.trim()
          .replace(/^#|\s*[;"\]\}\)\{\[\(]+\s*/g, "")
          .replaceAll("#", "＃")
          .replaceAll("\s*:\s*", "꞉")
          .replaceAll(".", "۔")
          .replace(/"'/g, "ʹ")
          .replace(/\s*\\+\s*/g, "/")
          .replace(/\s+/g, "_");
      })
      .filter(c => !!c) // remove empty strings;

    // make unique and sort
    return Array.from(new Set<string>(tags)).sort();
  }
  return [];
}

/**
 * Collect author information for the article described by
 * an RSS item.
 * @param elem - The parsed RSS item.
 * @returns Author(s), if available.
 */
function assembleAuthors(elem: Record<string, unknown>): string[] {

  const creator: any = elem.creator || elem["dc:creator"];
  if (creator) {
    return typeof creator === "string" ? [creator] : [creator["#text"] as string];
  }

  const author = elem.author as any;
  if (author) {
    if (typeof author === "string") {
      return [author as string];
    }

    if (typeof author.name === 'string') {
      return [author.name];
    }

    if (Array.isArray(author)) {
      return author
        .filter(a => typeof a?.name === 'string')
        .map((a: any) => a.name as string);
    }
  }
  return [];
}

function assembleLink(elem: Record<string, unknown>): string | null {
  let link = elem.link as any;

  if (Array.isArray(link)) {
    for (let l of link) {
      if (l["@_rel"] !== 'self') {
        return l["@_href"];
      }
    }
  }

  if (link === null) {
    return null
  }

  return link["@_href"] || link.toString();
}

// ====================

const READER_OPTIONS: ParserOptions = {
  normalization: true,
  useISODateFormat: true,
  getExtraFeedFields: (feed_data: Record<string, unknown>): Record<string, unknown> => {

    const image = assembleImage(feed_data);
    if (image) {
      feed_data.image = image;
    }

    feed_data.tags = assembleTags(feed_data);

    const link = assembleLink(feed_data);
    if (link) {
      feed_data.link = link;
    }

    // determine the feed publish date
    const published = feed_data.lastBuildDate
      || feed_data.pubDate
      || feed_data.updated
      || feed_data["dc:date"]
      || feed_data.modified;
    feed_data.published = typeof published === 'string'
      ? new Date(published).toISOString()
      : new Date().toISOString();
    return feed_data;
  },

  getExtraEntryFields: (entry_data: Record<string, unknown>): Record<string, unknown> => {

    let { id, guid } = entry_data as any;
    entry_data.id = id || guid?.["#text"] || entry_data.link

    const link = assembleLink(entry_data);
    if (link) {
      entry_data.link = link;
    }

    const description = assembleDescription(entry_data)
    if (description) {
      entry_data.description = description;
    }

    const published = entry_data.published || entry_data.pubDate || entry_data.updated || entry_data["dc:date"];
    if (typeof published === 'string') {
      entry_data.published = new Date(published).toISOString()
    }

    entry_data.tags = assembleTags(entry_data);
    entry_data.authors = assembleAuthors(entry_data);

    const media = assembleMedia(entry_data) ?? [];

    // const image = assembleImage(entry_data);
    // if (image) {
    //   media.push(image);
    // }
    entry_data.media = media;

    const content: any = entry_data["content:encoded"] || entry_data.content || entry_data["dc:content"];
    if (content) {
      entry_data.content = (typeof content === "string" ? content : content["#text"]) ?? entry_data.description as string;
    }
    let title = entry_data.title as any;
    title = title?.["#text"] ?? title;

    if (!title) {
      // a title is mandatory - synthesize one
      title = entry_data.published;
    }
    // remove linefeeds and extra spaces
    entry_data.title = title.toString().replace(/[\s\r\n]+/g, " ");

    return entry_data;
  }
};


/**
 * Scans a feed from XML that is already in hand, instead of fetching it.
 *
 * Parses `xml` through the same `READER_OPTIONS` pipeline as `main` — so title,
 * link, image, tags, authors, media and publish dates are normalized the same
 * way — and hands the result to `build_rss_feed` together with the entry
 * positions the caller asks for.
 *
 * Where it deliberately differs from `main`:
 *
 * - Nothing is fetched. `xml` *is* the feed body; `rec.feed_url` is read only to
 *   derive the base URL used to resolve relative links inside entries.
 * - The entries to keep are given directly rather than derived from
 *   `rec.item_limit`, which is therefore ignored here. There is no cap and no
 *   direction: the positions are used as given, in the order given, which makes
 *   this the entry point when the caller wants to choose the entries itself.
 * - Items are stored under the `xml_` prefix (`xml_<feed_id>_<item_index>`)
 *   instead of `web_`, so a scan read from XML never collides with one `main`
 *   fetched for the same feed.
 * - The `rss_feeds` row is left untouched: this function does not advance
 *   `last_scan` or `last_item_id`. Recording the scan is the caller's job — see
 *   `@remarks`.
 *
 * @param xml - The feed document as a string. Any XML the parser accepts is
 *   fine: the caller may have read it from storage, received it in a webhook,
 *   or fetched it itself.
 *
 * @param rec - The feed the entries belong to. Its `id` numbers the stored
 *   items, and `feed_name`, `last_scan`, `last_item_id` and `short_content` are
 *   used exactly as in `main` — including the `short_content` trick where a
 *   summary is promoted to the item content. `feed_url` is required (it is
 *   parsed as a URL) but never requested, and `item_limit` is ignored.
 *
 * @param item_indices - Zero-based positions of the entries to keep, in the
 *   order they should come out. Positions at or past the end of the feed are
 *   dropped silently; negative ones are not valid and will throw when the
 *   corresponding entry is read.
 *
 * @returns A promise resolving to the flyweight feed, shaped as in `main`:
 *   feed-level metadata, the `scanned` timestamp, the `last_item_id` newest
 *   selected item, and the `item_handles` of the stored items — here under the
 *   `xml_` prefix. Item bodies stay in Redis and are not returned.
 *
 * @throws If `xml` is not parsable as a feed, or if the Redis writes fail.
 *   There is no fetch-failure path, since nothing is fetched.
 *
 * @remarks
 * - Persistence is not handled here. Unlike `main`, which updates the
 *   `rss_feeds` row as its last step, this function only returns the flyweight
 *   feed; the caller must store `published` / `last_item_id` itself if it wants
 *   the next scan to know where this one stopped.
 * - `rec.last_scan` still filters, because that happens inside
 *   `build_rss_feed`: entries published before it are dropped, so asking for
 *   positions that are all older than the previous scan yields no items even
 *   though the XML contained them.
 *
 * @example
 * // the caller owns the feed body and the entry selection
 * const feed = await extract_rss_feed_from_xml(xml, rec, [0, 1, 2]);
 * console.log(feed.item_handles); // e.g. ["xml_1_0", "xml_1_1", "xml_1_2"]
 *
 * @see `main` for the variant that fetches the feed and records the scan.
 */
export async function extract_rss_feed_from_xml(xml: string, rec: IFeedRecord, item_indices: number[]): Promise<IFlyweightFeed> {
  const url = new URL(rec.feed_url);
  READER_OPTIONS.baseUrl = `${url.protocol}://${url.hostname}`;

  const feed_data = extractFromXml(xml, READER_OPTIONS) as IFeed;
  return build_rss_feed(feed_data, rec, item_indices, 'xml');
}

async function build_rss_feed(feed_data: IFeed, rec: IFeedRecord, item_indices: number[], handle_prefix: string): Promise<IFlyweightFeed> {
  // 1. Normalize items
  const entries = Array.isArray(feed_data.entries) ? feed_data.entries : [];

  // 2. Make items
  let feed_items = item_indices
    .filter(i => i < entries.length)
    .map(i => {
      const item_data = entries[i] as Record<string, any>;

      if (!rec.short_content && !item_data.content && item_data.description) {
        // we need to produce content as feed is not marked short (no article download)
        item_data.content = item_data.description;
        item_data.description = "🚫"
      }
      const item: IItem = {
        feed_id: rec.id,
        feed_title: feed_data.title ?? rec.feed_name,
        site_link: feed_data.link ?? '🚫',
        id: item_data.id,
        item_index: i,
        title: item_data.title ?? "🚫",
        description: item_data.description ?? "🚫",
        link: item_data.link ?? "🚫",
        authors: item_data.authors,
        published: item_data.published ? item_data.published : feed_data.published,
        tags: item_data.tags,
        content: item_data.content ?? '🚫',
        media: item_data.media
      };
      return item;
    }) ?? [];

  // 3. filter items only if scan date is available
  if (rec.last_scan) {
    const cutoff = new Date(rec.last_scan);
    feed_items = feed_items.filter(i => {
      const pubdate = new Date(i.published);
      return pubdate >= cutoff;
    });
  }

  // Get the last_item_id before trimming items
  const last_item_id = feed_items.length > 0 ? feed_items[0].id : rec.last_item_id;

  // 4. store item objects in Redis
  const
    client = createClient({ url: "redis://redis:6379" }),
    item_handles: string[] = [];

  await client.connect();

  for (const item of feed_items) {
    if (item.id === rec.last_item_id) {
      console.log(`Feed ${rec.id} Item Index ${item.item_index} id "${item.id}" already found last time`);
      break; // this item we already had in the previous scan
    }
    const handle = `${handle_prefix}_${item.feed_id}_${item.item_index}`;
    await client.json.set(handle, "$", item);
    item_handles.push(handle);
  }

  // 5. build the flyweight return object
  const feed: IFlyweightFeed = {
    id: rec.id, // rss_feeds record id
    title: feed_data.title || rec.feed_name,
    site: feed_data.link || "-",
    tags: feed_data.tags,
    published: feed_data.published,
    scanned: new Date().toISOString(),
    last_item_id,
    short_content: rec.short_content,
    item_handles,
  };

  if (feed_data.image) { feed.image = feed_data.image };
  return feed;
}

/**
 * Scans one RSS/Atom feed and returns a flyweight description of the scan.
 *
 * Fetches `feed_record.feed_url`, parses it through the shared
 * `READER_OPTIONS` pipeline (which normalizes title, link, image, tags,
 * authors, media and publish dates), then keeps `|item_limit|` entries of the
 * feed, dropping any entry published before `feed_record.last_scan`.
 *
 * Each kept entry is stored as a JSON document in Redis under the handle
 * `web_<feed_id>_<item_index>`; only those handles are returned, not the item
 * bodies. As a side effect, the matching `rss_feeds` datatable row is updated
 * with `last_scan` (set to the feed's publish date) and `last_item_id`, so a
 * later scan knows where it left off.
 *
 * @param feed_record - The feed to scan, as read from the `rss_feeds` table:
 *   its `id`, `feed_name`, `feed_url`, and `item_limit` — a backstop on how many
 *   entries a single scan hands over, there to hold down model costs on
 *   high-frequency feeds. Its absolute value is capped by the number of entries
 *   the feed actually has, and its sign picks the reading direction: a positive
 *   value walks the parsed entries top-down, a zero or negative value walks the
 *   selected run of indices backwards (`len-1 … 0`), which is how feeds that
 *   append new items at the bottom come out newest item first. The record also
 *   carries the previous `last_scan` ISO timestamp (`null` on a first scan),
 *   `last_item_id`, and `short_content`, which marks feeds that carry summaries
 *   only — for those the summary is used as the item content.
 *
 * @returns A promise resolving to the flyweight feed: feed-level metadata, the
 *   `scanned` timestamp, the Redis `item_handles` of the stored items, and the
 *   `last_item_id` newest retrieved item.
 *
 * @throws If the feed cannot be fetched or parsed, or if the Redis or
 *   `rss_feeds` writes fail.
 *
 * @remarks
 * - `item_limit` bounds a single scan only — it is a cost backstop on
 *   high-frequency feeds, not a cursor. Entries past it are left unprocessed on
 *   purpose, and since this run advances the stored scan date no later scan
 *   goes back for them. Losing those items is the intended trade-off.
 * - The feed URL is also used to derive `READER_OPTIONS.baseUrl`, so relative
 *   links inside entries resolve against the feed's own site.
 *
 * @example
 * const feed = await main({
 *   id: 1,
 *   feed_name: "Ars Technica – AI",
 *   feed_url: "https://feeds.arstechnica.com/arstechnica/technology-lab",
 *   last_scan: null,
 *   last_item_id: null,
 *   item_limit: 10,
 *   short_content: false,
 * });
 * console.log(feed.item_handles); // e.g. ["web_1_0", "web_1_1", ...]
 *
 * @see `extract_rss_feed_from_xml` to scan from already-fetched feed XML.
 */
export async function main(feed_record: IFeedRecord): Promise<IFlyweightFeed> {
  // 0.determine a base URL
  const url = new URL(feed_record.feed_url);
  READER_OPTIONS.baseUrl = `${url.protocol}://${url.hostname}`;

  // 1. Fetch + parse RSS feed
  const
    feed_data = await extract(feed_record.feed_url, READER_OPTIONS) as IFeed,
    len = Math.min(Math.abs(feed_record.item_limit), (feed_data.entries ?? []).length),
    // Most feeds list the newest item first, so index 0 is
    // the newest one and a positive item_limit walks the parsed entries
    // top-down. Some feeds instead append new items at the bottom, leaving the
    // newest item at the end of the array; a zero or negative item_limit walks
    // the selected run of indices backwards, so the items come out newest
    // first within that run for these bottom-appending feeds.
    //
    // item_limit is a backstop on how much a single scan hands over, there to
    // hold down model costs on high-frequency feeds — it is not a cursor.
    // Entries beyond it go unprocessed on purpose: this run advances the stored
    // scan date, so no later scan goes back for them. Dropping them is a design
    // decision, not an oversight.
    range = feed_record.item_limit > 0
      ? Array.from({ length: len }, (_, i) => i)
      : Array.from({ length: len }, (_, i) => len - i - 1),
    feed = await build_rss_feed(feed_data, feed_record, range, 'web');

  // 2. Update feed timestamp
  const
    last_item_id = feed.last_item_id ?? feed_record.last_item_id,
    sql = wmill.datatable('rss');
  await sql`UPDATE rss_feeds
    SET last_scan    = CAST(${feed.published} AS timestamptz),
        last_item_id = ${last_item_id}
    WHERE id = ${feed.id}`.execute();
  return feed;
}
