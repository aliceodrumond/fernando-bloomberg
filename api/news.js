const FEEDS = {
  brazil: [
    "https://news.google.com/rss/search?q=Brasil+economia+mercados+OR+copom+OR+inflacao+OR+fiscal+when:1d&hl=pt-BR&gl=BR&ceid=BR:pt-419",
    "https://news.google.com/rss/search?q=Brasil+economia+mercado+financeiro+when:1d&hl=pt-BR&gl=BR&ceid=BR:pt-419",
    "https://news.google.com/rss/search?q=site:agenciabrasil.ebc.com.br+economia+when:1d&hl=pt-BR&gl=BR&ceid=BR:pt-419"
  ],
  us: [
    "https://news.google.com/rss/search?q=US+markets+economy+fed+OR+tariffs+OR+inflation+when:1d&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=US+markets+fed+inflation+when:1d&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=site:reuters.com+US+markets+when:1d&hl=en-US&gl=US&ceid=US:en"
  ],
  world: [
    "https://news.google.com/rss/search?q=world+war+geopolitics+markets+OR+china+OR+oil+when:1d&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=world+geopolitics+markets+when:1d&hl=en-US&gl=US&ceid=US:en",
    "https://news.google.com/rss/search?q=site:reuters.com+world+news+markets+when:1d&hl=en-US&gl=US&ceid=US:en"
  ]
};

function decodeXml(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function parseItems(xml) {
  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 6);
  return itemMatches.map((match) => {
    const chunk = match[1];
    const title = chunk.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
    const link = chunk.match(/<link>(.*?)<\/link>/);
    const pubDate = chunk.match(/<pubDate>(.*?)<\/pubDate>/);
    const source = chunk.match(/<source[^>]*>(.*?)<\/source>/);

    return {
      title: decodeXml(title?.[1] || title?.[2] || ""),
      link: decodeXml(link?.[1] || ""),
      published: decodeXml(pubDate?.[1] || ""),
      source: decodeXml(source?.[1] || "")
    };
  })
    .filter((item) => item.title && item.link)
    .sort((a, b) => Date.parse(b.published || "") - Date.parse(a.published || ""));
}

async function fetchFeed(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/rss+xml,application/xml,text/xml"
    }
  });

  if (!response.ok) {
    throw new Error(`Feed respondeu com status ${response.status}.`);
  }

  const xml = await response.text();
  return parseItems(xml);
}

async function fetchFeedWithRetry(url, attempts = 2) {
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetchFeed(url);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

async function fetchFeedGroup(urls) {
  let lastError = null;

  for (const url of urls) {
    try {
      const items = await fetchFeedWithRetry(url, 3);
      if (items.length) {
        return items;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Nenhum feed de noticias respondeu.");
}

module.exports = async function handler(request, response) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  if (request.method !== "GET") {
    response.status(405).json({ error: "Metodo nao permitido." });
    return;
  }

  const [brazil, us, world] = await Promise.allSettled([
    fetchFeedGroup(FEEDS.brazil),
    fetchFeedGroup(FEEDS.us),
    fetchFeedGroup(FEEDS.world)
  ]);

  response.status(200).json({
    brazil: brazil.status === "fulfilled" ? brazil.value : [],
    us: us.status === "fulfilled" ? us.value : [],
    world: world.status === "fulfilled" ? world.value : [],
    errors: {
      ...(brazil.status === "rejected" ? { brazil: brazil.reason?.message || "Falha ao carregar feed do Brasil." } : {}),
      ...(us.status === "rejected" ? { us: us.reason?.message || "Falha ao carregar feed dos EUA." } : {}),
      ...(world.status === "rejected" ? { world: world.reason?.message || "Falha ao carregar feed global." } : {})
    },
    asOf: new Date().toISOString()
  });
};
