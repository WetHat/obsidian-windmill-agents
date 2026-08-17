import * as wmill from "windmill-client"
import { createClient } from "redis";
import { extract, extractFromXml, FeedData, ParserOptions } from "@extractus/feed-extractor";

/**
 * Metadata describing an RSS feed configuration.
 *
 * Represents the static properties required to read, limit, and process
 * a feed during ingestion. This structure is typically provided as input
 * to the RSS scanning flow.
 */
export interface IFeedMeta {
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
   * Maximum number of items to retrieve from the feed.
   * Used to cap ingestion for large feeds.
   */
  item_limit: number,
  /**
   * ISO timestamp of the last successful scan.
   * If null, the feed has never been scanned.
   */
  last_scan: string | null,
  /**
   * Indicates whether the feed items have short summaries only.
   */
  short_content: boolean
}

interface IFeed extends FeedData {
  image?: IRssAsset;
  tags: string[]; // a list of tags describing the feed.
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
}

export interface IRssAsset {
  src: string; // hyperlink to object
  type: TAssetType;
  width?: string; // optional embedding width
  height?: string; // optional embedding height
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
  /** Redis keys pointing to the feed's item objects. */
  item_handles: string[];
  /** ISO 8601 timestamp of the most recent item scan. */
  scanned: string;
  /** `true` if item content is short */
  short_content: boolean;
}

//=====================

/**
 * Get the _signature_ image associated with a feed or item
 * @param elem
 * @returns Image medium object, if available.
 */
function assembleImage(elem: Record<string, unknown>): IRssAsset | null {
  let { image } = elem as any;

  if (typeof image === 'string') {
    return { src: image, type: 'image' };
  }

  if (image && image.url) {
    const
      { url, width, height } = image as any,
      img: IRssAsset = { src: url, type: 'image' };
    if (width) {
      img.width = width;
    }
    if (height) {
      img.height = height;
    }
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
      img: IRssAsset = { src: thumb["@_url"], type: 'image' };
    if (width) {
      img.width = width;
    }
    if (height) {
      img.height = height;
    }
    return img;
  }

  const enc = elem.enclosure as any;
  if (enc?.["@_type"]?.includes("image")) {
    return { src: enc["@_url"], type: 'image' };
  }

  let media = elem["media:content"] as any;
  if (media && media["@_type"]?.includes("image")) {
    const
      [width, height] = [media["@_width"], media["@_height"]],
      img: IRssAsset = { src: media["@_url"], type: 'image' };
    if (width) {
      img.width = width;
    }
    if (height) {
      img.height = height;
    }
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
  } else if (elem.category === 'string') {
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

    if (author.name === 'string') {
      return [author.name];
    }

    if (Array.isArray(author)) {
      return author.map((a: any) => a.name as string);
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

    return feed_data;
  },

  getExtraEntryFields: (entry_data: Record<string, unknown>): Record<string, unknown> => {

    let { id, guid } = entry_data as any;
    id = id || guid?.["#text"] || entry_data.link

    const link = assembleLink(entry_data);
    if (link) {
      entry_data.link = link;
    }

    const description = assembleDescription(entry_data)
    if (description) {
      entry_data.description = description;
    }

    entry_data.published = entry_data.published || entry_data.pubDate || entry_data.updated || new Date().toISOString();
    entry_data.tags = assembleTags(entry_data);
    entry_data.authors = assembleAuthors(entry_data);

    const image = assembleImage(entry_data);
    if (image) {
      entry_data.image = image;
    }

    const content: any = entry_data["content:encoded"] || entry_data.content || entry_data["dc:content"];
    if (content) {
      entry_data.content = (typeof content === "string" ? content : content["#text"]) ?? entry_data.description as string;
    } else {
      entry_data.content = entry_data.description
    }

    let title = entry_data.title as any;
    if (!title) {
      // a title is mandatory - synthesize one
      title = entry_data.published;
    }
    // remove linefeeds and extra spaces
    entry_data.title = (title["#text"] ?? title).toString().replace(/[\s\r\n]+/g, " ");

    return entry_data;
  },
};


export async function extract_rss_feed_from_xml(xml: string, meta: IFeedMeta, item_indices: number[]): Promise<IFlyweightFeed> {
  const feed_data = extractFromXml(xml, READER_OPTIONS) as IFeed;
  return build_rss_feed(feed_data, meta, item_indices, 'xml');
}

async function build_rss_feed(feed_data: IFeed, meta: IFeedMeta, item_indices: number[], handle_prefix: string): Promise<IFlyweightFeed> {
  // 1. Normalize items
  const entries = Array.isArray(feed_data.entries) ? feed_data.entries : [];

  // 2. Make items
  let feed_items = item_indices
    .map(i => {
      const
        item_data = entries[i] as Record<string, any>,
        item: IItem = {
          feed_id: meta.id,
          feed_title: feed_data.title ?? meta.feed_name,
          site_link: feed_data.link ?? '-',
          id: item_data.id,
          item_index: i,
          title: item_data.title ?? "-",
          description: item_data.description ?? "-",
          link: item_data.link ?? "-",
          authors: item_data.authors,
          published: (item_data.published ? new Date(item_data.published) : new Date()).toISOString(),
          tags: item_data.tags,
          content: item_data.content ?? '.',
        }
      return item;
    }) ?? [];

  // 3. keep new items only if scan date is availble
  if (meta.last_scan) {
    const cutoff = new Date(meta.last_scan);
    feed_items = feed_items.filter(i => {
      const pubdate = new Date(i.published);
      return pubdate >= cutoff;
    });
  }

  // 4. store item objects in Redis
  const
    client = createClient({ url: "redis://redis:6379" }),
    item_handles: string[] = [];

  await client.connect();

  for (const item of feed_items) {
    const handle = `${handle_prefix}_${item.feed_id}_${item.item_index}`;
    await client.json.set(handle, "$", item);
    item_handles.push(handle);
  }

  // 5. build the flyweight return object
  const feed: IFlyweightFeed = {
    id: meta.id, // rss_feeds record id
    title: feed_data.title || meta.feed_name,
    site: feed_data.link || "-",
    tags: feed_data.tags,
    scanned: new Date().toISOString(),
    short_content: meta.short_content,
    item_handles,
  }

  if (feed_data.image) { feed.image = feed_data.image };
  return feed;
}

/**
 * Ingests an RSS/Atom feed, normalizes its entries, and returns a list of
 * str ctured `IItem` objects suitable for downstream processing in Windmill.
 *
 *  @param id
 *   Database identifier of the RSS feed from the `rss_feeds` table.
 *
 *  @param feed_url
 *   URL of the RSS/Atom feed to fetch. Used both for retrieval and as the
 *   `baseUrl` for resolving relative links inside feed entries.
 *
 *  @param item_limit
 *   Maximum number of normalized feed items to return.
 *
 *  @param last_scan
 *   ISO timestamp of the previous scan. Included to filter new items.
 *
 *  @returns 
 *   A promise resolving to flyyweight feed representation.
 */
export async function main(id: number, feed_name: string, feed_url: string, item_limit: number, last_scan: string | null, short_content: boolean): Promise<IFlyweightFeed> {
  // 1. Fetch + parse RSS feed
  READER_OPTIONS.baseUrl = feed_url;
  const
    feed_data = await extract(feed_url, READER_OPTIONS) as IFeed,
    range = Array.from({ length: item_limit }, (_, i) => i),
    feed = await build_rss_feed(feed_data, {
      id,
      feed_url,
      feed_name,
      item_limit,
      last_scan,
      short_content
    }, range, 'web');

  // 2. Update feed timestamp
  const sql = wmill.datatable('rss');
  await sql`
  UPDATE rss_feeds
    SET last_scan = CAST(${feed.scanned} AS timestamptz)
    WHERE id = ${id}`.execute();
  return feed;
}
