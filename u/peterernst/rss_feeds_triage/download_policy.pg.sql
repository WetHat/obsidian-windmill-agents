SELECT scrape_article FROM rss_feeds
WHERE ID = $1::BIGINT
LIMIT 1