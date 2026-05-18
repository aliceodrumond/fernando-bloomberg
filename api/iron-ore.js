const PAGE_URL = "https://www.investing.com/commodities/iron-ore-62-cfr-futures";

function parseNumber(value) {
  const normalized = String(value || "").replace(/,/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFaqMetric(html, questionPattern) {
  const regex = new RegExp(`"name":"${questionPattern}","acceptedAnswer":\\{"@type":"Answer","text":"([^"]+)`, "i");
  const match = html.match(regex);
  return match ? match[1] : "";
}

function parseCurrentPrice(html) {
  const text = parseFaqMetric(html, "What Is the Current Price of Iron Ore 62% Futures\\?");
  const match = text.match(/is ([0-9.,]+)/i);
  return parseNumber(match?.[1]);
}

function parsePreviousClose(html) {
  const text = parseFaqMetric(html, "What Is the Current Price of Iron Ore 62% Futures\\?");
  const match = text.match(/previous close of ([0-9.,]+)/i);
  return parseNumber(match?.[1]);
}

function parseYearChange(html) {
  const text =
    parseFaqMetric(html, "How Much Has Iron Ore 62% Changed Over the Past Year\\?") ||
    parseFaqMetric(html, "How Has Iron Ore 62% Futures Performed Over the Past Year\\?");
  const match = text.match(/changed by ([0-9.+-]+)%/i);
  return parseNumber(match?.[1]);
}

async function fetchIronOreData() {
  const response = await fetch(PAGE_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(`Fonte do minerio respondeu com status ${response.status}.`);
  }

  const html = await response.text();
  const currentPrice = parseCurrentPrice(html);
  const previousClose = parsePreviousClose(html);
  const yearChange = parseYearChange(html);

  if (!Number.isFinite(currentPrice)) {
    throw new Error("Nao foi possivel extrair o preco do minerio 62%.");
  }

  const currentTimestamp = Math.floor(Date.now() / 1000);
  const yearReference = Number.isFinite(yearChange) ? currentPrice / (1 + yearChange / 100) : null;
  const dayChange = Number.isFinite(previousClose) && previousClose !== 0
    ? ((currentPrice / previousClose) - 1) * 100
    : null;

  const points = Number.isFinite(yearReference)
    ? [
        { timestamp: currentTimestamp - 366 * 24 * 60 * 60, close: Number(yearReference.toFixed(2)) },
        { timestamp: currentTimestamp, close: Number(currentPrice.toFixed(2)) }
      ]
    : [{ timestamp: currentTimestamp, close: Number(currentPrice.toFixed(2)) }];

  return {
    symbol: "SCOA",
    currency: "USD",
    exchangeName: "Iron Ore 62% 1st future",
    shortName: "SCOA 1st future",
    marketState: "Investing front future",
    regularMarketPrice: Number(currentPrice.toFixed(2)),
    regularMarketTime: currentTimestamp,
    points,
    changes: {
      day: dayChange,
      month: null,
      ytd: null,
      year: yearChange
    }
  };
}

module.exports = async function handler(request, response) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  if (request.method !== "GET") {
    response.status(405).json({ error: "Metodo nao permitido." });
    return;
  }

  const symbolsParam = request.query.symbols;
  const symbols = String(symbolsParam || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!symbols.length) {
    response.status(200).json({ results: [], asOf: new Date().toISOString() });
    return;
  }

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      if (symbol !== "SCOA") {
        return { ok: false, symbol, error: "Ativo de minerio nao configurado." };
      }

      try {
        const data = await fetchIronOreData();
        return { ok: true, symbol, data };
      } catch (error) {
        return {
          ok: false,
          symbol,
          error: error instanceof Error ? error.message : "Erro desconhecido."
        };
      }
    })
  );

  response.status(200).json({
    results,
    asOf: new Date().toISOString()
  });
};
