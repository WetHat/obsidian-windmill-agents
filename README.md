# obsidian-agents

**Windmill workflows that collect RSS items, score their reading value, and write useful articles into an Obsidian vault.**

[![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1?logo=bun)](https://bun.sh)
[![Platform: Windmill](https://img.shields.io/badge/platform-Windmill-18181b?logo=windmill)](https://windmill.dev)

## What Is Here

The main workflow is `u/peterernst/rss_feeds_triage`. It reads feed definitions from the Windmill `rss` datatable, caches normalized items in Redis, asks an OpenRouter-backed AI agent to analyze each new item, and writes the resulting Markdown note to the `WetHat Lab` vault Inbox.

The repository also contains reusable vault, Markdown, RSS, Redis, and Browserless scripts, plus flows for RSS fixture testing. Browserless support is currently provided by shared scripts; there is no active `scrape_web_article` orchestration flow in the repository.

## Architecture

```mermaid
flowchart TD
    subgraph DATA["Windmill data"]
        RSS["rss datatable<br/>rss_feeds"]
        REDIS["Redis<br/>item JSON by handle"]
    end

    subgraph VAULT["Obsidian vault"]
        DOM["Context Data /<br/>Subject Matter Domains.md"]
        INBOX["Inbox/"]
    end

    subgraph TRIAGE["rss_feeds_triage flow"]
        direction TB
        SEL["select_feeds"]
        LD["load_vault_file"]
        READ["read_rss_feed<br/>fetch + parse + normalize"]
        HAS{"new item handles?"}
        subgraph ITEM["for each item"]
            direction TB
            DEHY["dehydrate_feed_item<br/>read Redis"]
            MD["html_to_markdown"]
            LLM["Article Analysis Agent<br/>OpenRouter / Gemini"]
            NOTE["assemble_note"]
            SAVE["save_to_Inbox"]
        end
        COLD["drop_packet"]
    end

    subgraph HELPERS["Reusable Browserless helpers"]
        URL["article URL"]
        SCRAPE["scrape_web_content_browserless"]
        EXTRACT["extract_article"]
        RESULT["Markdown article + time to read"]
    end

    RSS --> SEL
    DOM --> LD
    SEL --> READ
    LD --> LLM
    READ --> HAS
    HAS -- "yes" --> ITEM
    HAS -- "no" --> COLD
    DEHY --> REDIS
    REDIS --> DEHY
    DEHY --> MD
    MD --> LLM
    LLM --> NOTE
    NOTE --> SAVE
    SAVE --> INBOX
    URL --> SCRAPE
    SCRAPE --> REDIS
    SCRAPE --> EXTRACT
    REDIS --> EXTRACT
    EXTRACT --> RESULT
```

### Production flow

1. `select_feeds` runs `SELECT id, name, feed_url, item_limit, last_scan FROM rss_feeds` against the `rss` datatable.
2. `load_vault_file` reads `WetHat Lab/Context Data/Subject Matter Domains.md`; the file contents become part of the analysis agent's system prompt.
3. The feed loop runs sequentially. `read_rss_feed` parses RSS or Atom with `@extractus/feed-extractor`, normalizes authors, tags, images, media, and content, stores full items in Redis, and returns a lightweight feed descriptor with `item_handles`.
4. A feed enters item processing when `item_handles.length > 0`. Empty feeds go to `drop_packet`, which is a no-op sink.
5. Each item is rehydrated from Redis, converted from HTML to Markdown, and analyzed by the OpenRouter agent using `google/gemini-3.7-flash` with high reasoning effort.
6. The agent returns structured data containing highlights, relevance for every subject-matter domain, five reading-value axes (`actionability`, `novelty`, `impact`, `rigor`, and `depth`), analyst notes, and an expiration date.
7. `assemble_note` selects the most relevant domain, calculates a weighted reading value, and renders Obsidian frontmatter, highlights, reading values, analyst notes, metadata, and the article body.
8. `save_to_Inbox` writes the note below `/mnt/obsidianvaults/WetHat Lab/Inbox`.

The outer feed loop is sequential and skips failed feeds. Item processing is also sequential and skips failed items, so one bad feed or article does not discard the rest of the batch.

## Project Structure

```text
.
├── wmill.yaml                  # Windmill CLI and sync configuration
├── wmill-lock.yaml             # Content hashes for synced entities
├── package.json                # Local Windmill CLI dependency
├── tsconfig.json               # TypeScript project configuration
├── tsconfig.wmill.json         # Windmill TypeScript paths and settings
├── rt.d.ts                     # Windmill resource-type declarations
├── AGENTS.md                   # User-owned agent instructions
├── AGENTS.wmill.md             # Windmill-managed agent instructions
│
├── f/lib/                      # Shared scripts
│   ├── read_rss_feed.ts        # RSS/Atom parsing, normalization, and Redis cache
│   ├── html_to_markdown.ts     # HTML to Markdown conversion
│   ├── load_vault_file.ts      # Read a mounted vault file
│   ├── save_to_Inbox.ts        # Write a note to the vault Inbox
│   ├── write_to_vault.ts       # Write a file anywhere in the vault
│   ├── scrape_web_content_browserless.ts # Browserless scrape and Redis cache
│   └── extract_article.ts      # Extract and convert cached article HTML
│
└── u/peterernst/
    ├── rss_feeds_triage/       # Production feed scripts and SQL
    │   ├── select_feeds.pg.sql
    │   ├── select_hot_feeds.pg.sql # Alternate query, not used by the main flow
    │   ├── download_policy.pg.sql
    │   ├── q.pg.sql
    │   ├── dehydrate_feed_item.ts
    │   └── assemble_note.ts
    ├── rss_feeds_triage__flow/ # Production orchestration
    │   └── flow.yaml
    ├── tests/rss/               # Test-feed fixtures and regression flows
    │   ├── add_test_feed__flow/
    │   ├── dump_test_feed__flow/
    │   ├── test_feed__flow/
    │   └── *.ts
    ├── Sandbox__flow/           # Experimental flow
    ├── drop_packet.ts           # No-op sink for feeds with no new items
    └── *.resource.yaml          # Windmill resource definitions
```

The `__flow` directory suffix is enabled by `nonDottedPaths: true` in `wmill.yaml`; the Windmill entity paths used in commands omit that suffix.

## Dependencies and Resources

TypeScript scripts use these Windmill-resolved dependencies:

| Dependency | Used for |
| --- | --- |
| `@extractus/feed-extractor` | RSS 2.0, Atom, and RSS 1.0 parsing |
| `@extractus/article-extractor` | Main-article extraction from rendered HTML |
| `@xberg-io/html-to-markdown` | Markdown conversion with link and media handling |
| `redis` | Item and scraped-page storage |
| `windmill-client` | Windmill datatable access |

The main flow expects:

- A Windmill datatable named `rss` with an `rss_feeds` table containing `id`, `name`, `feed_url`, `item_limit`, `last_scan`, and `short_content`.
- Redis at `redis://redis:6379`.
- An OpenRouter resource at `u/peterernst/openrouter_windmill`.
- An Obsidian vault mounted at `/mnt/obsidianvaults/WetHat Lab` with `Context Data/Subject Matter Domains.md` and an existing `Inbox/` directory.
- Bun available on the Windmill worker, because the project default is `defaultTs: bun`.

The RSS fixture flows additionally use a `test_feeds` table in the `rss` datatable. The fixture lookup expects at least `id`, `name`, `url`, and `xml` columns.

## Local Development

Install the repository's CLI dependency and synchronize the local checkout with the configured `obsidian` workspace:

```powershell
npm install
wmill sync pull
```

Preview the production flow locally after the required Windmill resources and services are available:

```powershell
wmill flow preview u/peterernst/rss_feeds_triage -d '{}'
```

Push local entity changes back to Windmill only when you intend to synchronize them:

```powershell
wmill sync push
```

When a script import or argument list changes, regenerate its Windmill metadata before syncing:

```powershell
wmill generate-metadata
```

## RSS Fixture Tests

The test flows exercise feed parsing and Markdown conversion against reference content stored in the `test_feeds` table.

1. Add or refresh a fixture from an RSS or Atom URL:

   ```powershell
   wmill flow preview u/peterernst/tests/rss/add_test_feed -d '{"url":"https://example.com/feed.xml"}'
   ```

2. Dump selected fixture items to the `WetHat Lab` Inbox:

   ```powershell
   wmill flow preview u/peterernst/tests/rss/dump_test_feed -d '{"feed_id":1,"items":[0,1]}'
   ```

3. Compare converted item content with the stored reference. Use `update: true` to intentionally replace references:

   ```powershell
   wmill flow preview u/peterernst/tests/rss/test_feed -d '{"id":1}'
   wmill flow preview u/peterernst/tests/rss/test_feed -d '{"id":1,"update":true}'
   ```

There is no automated root-level test command yet; `npm test` is still the placeholder from `package.json`.

## Current Gaps

- No schedules or triggers are checked into this repository. Feed mining must be started manually or configured separately in Windmill.
- Browserless scraping and article extraction are reusable scripts, but they are not currently wired into a checked-in orchestration flow.
- `select_hot_feeds` and the related SQL helpers are available for experimentation but are not referenced by `rss_feeds_triage__flow`.

## License

See [LICENSE](LICENSE).
