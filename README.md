# obsidian-agents

**Windmill-powered AI agents that mine, filter, and enrich RSS feeds — surfacing high-signal content for Obsidian.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1?logo=bun)](https://bun.sh)
[![Platform: Windmill](https://img.shields.io/badge/platform-Windmill-18181b?logo=windmill)](https://windmill.dev)

---

## Architecture

```
┌──────────────┐     ┌─────────────────────┐     ┌──────────────┐
│  PostgreSQL  │────▶│  mine_rss_feeds flow │────▶│  LLM (OpenAI/ │
│  (rss_feeds) │     │  ┌───────┐ ┌───────┐│     │  OpenRouter)  │
└──────────────┘     │  │select │ │forloop││     └──────────────┘
                     │  │ feeds │ │──────▶││
                     │  └───────┘ │ read  ││
                     │            │ feed  ││
                     │            └───────┘│
                     └─────────────────────┘
```

- **`select_feeds`** → queries `rss_feeds` table for feeds + last-scan state
- **`read_rss_feed`** → fetches & parses RSS via `@extractus/feed-extractor`, enriches with images/media/authors/tags
- **LLM step** (planned) → scores/filters/tags items by relevance; OpenRouter + OpenAI resources provisioned
- **Output** → high-signal items land in Obsidian (or downstream sink)

---

## Project Structure

```
.
├── wmill.yaml                  # Windmill CLI config (Bun runtime, sync rules)
├── wmill-lock.yaml             # Content-hash lockfile for sync integrity
├── tsconfig.json               # TS config (extends tsconfig.wmill.json)
├── tsconfig.wmill.json         # Windmill-managed TS paths & settings
├── rt.d.ts                     # Windmill resource-type declarations
├── AGENTS.md                   # AI agent instructions (user-owned)
├── AGENTS.wmill.md             # Windmill-managed agent guidance
│
└── u/peterernst/
    ├── read_rss_feed.ts                 # Core: RSS fetch + parse script
    ├── read_rss_feed.script.yaml        # Script metadata & JSON schema
    │
    ├── mine_rss_feeds/                  # Feed-mining pipeline scripts
    │   ├── a.pg.sql                     # Select all feeds from DB
    │   ├── g.pg.sql                     # Select "hot" feeds variant
    │   └── j.ts                         # Browserless fetch placeholder
    │
    ├── mine_rss_feeds__flow/            # Orchestration flow
    │   ├── flow.yaml                    # Flow DAG: SQL select → forloop → read_rss_feed
    │   └── select_feeds.pg.sql          # Embedded SQL for feed selection
    │
    ├── openai_windmill.resource.yaml    # OpenAI API key resource
    ├── openrouter_windmill.resource.yaml# OpenRouter API key resource
    └── openrouter_windmill.variable.yaml# OpenRouter token (secret)
```

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| **Bun runtime** | Faster cold starts, native TS, better `feed-extractor` compat than Deno |
| **`@extractus/feed-extractor`** | Handles RSS 2.0, Atom, RSS 1.0; normalizes to uniform `FeedData` |
| **Custom `IFeed`/`IItem` interfaces** | Extends `FeedEntry` with `tags`, `authors`, `image`, `media[]`, `content` |
| **Forloop + `skip_failures: true`** | One bad feed won't kill the batch; partial results preserved |
| **`cache_ttl: 300` on read script** | 5-minute dedup cache on feed fetch — avoids rate-limit & duplicate work |
| **OpenRouter as LLM gateway** | Multi-model access (GPT-4, Claude, Gemini) through one API key |
| **Windmill secrets for credentials** | API keys stored as Windmill secrets, never synced to git (`skipSecrets: true`) |

---

## Quick Start

```powershell
# Install Windmill CLI & deps
npm install
npx windmill init

# Pull latest from Windmill workspace
npx windmill sync pull

# Push local changes to Windmill
npx windmill sync push

# Run the mine_rss_feeds flow locally
npx windmill flow run u/peterernst/mine_rss_feeds
```

### Prerequisites

- **Windmill workspace** (self-hosted or cloud) with a PostgreSQL resource named `rss`
- **`rss_feeds` table** with columns: `id`, `feed_url`, `item_limit`, `last_scan`, `scrape_article`, `feed_data`
- **OpenAI** and/or **OpenRouter** resource configured in Windmill

---

## Flow: `mine_rss_feeds`

1. **`a`** — `SELECT id, feed_url, item_limit, last_scan FROM rss_feeds` (PostgreSQL rawscript)
2. **`b`** — Forloop over results: each feed → `u/peterernst/read_rss_feed` with `feed_desc` from iter value
   - `parallel: false`, `skip_failures: true`, `squash: true`

### Script: `read_rss_feed`

| Input | Type | Description |
|---|---|---|
| `id` | `number` | Feed row ID |
| `feed_url` | `string` | RSS/Atom feed URL |
| `item_limit` | `number` | Max items to return |
| `last_scan` | `string` | ISO timestamp for incremental fetch |

Returns: enriched `IFeed` with `IFeedItem[]` including images, media assets, tags, authors, and HTML content.

---

## Roadmap

- [ ] **LLM scoring module** — score/rank items via OpenRouter; keep only high-signal
- [ ] **Obsidian sink** — write filtered items as Markdown notes to an Obsidian vault
- [ ] **Browserless fetch** (`j.ts`) — headless article scraping for full-text extraction
- [ ] **Scheduled trigger** — cron-based periodic feed mining
- [ ] **Tag classification** — LLM auto-tagging of items by topic/domain
- [ ] **Deduplication** — cross-feed duplicate detection via embedding similarity

---

## License

MIT © 2026 Peter Ernst ([WetHat](https://github.com/WetHat))