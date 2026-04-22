const ASSET_CONFIG = {
  "BRLUSD=X": { label: "BRL", marketState: "FX" },
  "USDBRL=X": { label: "USD", marketState: "FX" },
  "^BVSP": { label: "IBOVESPA", marketState: "Index" },
  "^GSPC": { label: "S&P", marketState: "Index" },
  "GC=F": { label: "GOLD", marketState: "Future" },
  "BZ=F": { label: "Brent 1st future", marketState: "Future" }
};

const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Accept: "application/json"
};

function formatTimestampSeries(timestamps, closes) {
  return timestamps
    .map((timestamp, index) => ({
      timestamp,
      close: closes[index]
    }))
    .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.close));
}

function getClosestPastPoint(series, targetTimestamp) {
  let match = null;

  for (const point of series) {
    if (point.timestamp <= targetTimestamp) {
      match = point;
    } else {
      break;
    }
  }

  return match;
}

function getOneYearReference(series, currentTimestamp) {
  return getClosestPastPoint(series, currentTimestamp - 366 * 24 * 60 * 60) || series[0] || null;
}

function computePercentChange(current, reference) {
  if (!Number.isFinite(current) || !Number.isFinite(reference) || reference === 0) {
    return null;
  }

  return ((current / reference) - 1) * 100;
}

async function fetchYahooChart(symbol, range = "1y", interval = "1d") {
  let payload;
  let result;

  const sparkEndpoint = new URL("https://query1.finance.yahoo.com/v7/finance/spark");
  sparkEndpoint.searchParams.set("symbols", symbol);
  sparkEndpoint.searchParams.set("range", range);
  sparkEndpoint.searchParams.set("interval", interval);

  try {
    const sparkResponse = await fetch(sparkEndpoint, { headers: YAHOO_HEADERS });
    if (sparkResponse.ok) {
      payload = await sparkResponse.json();
      result = payload?.spark?.result?.[0]?.response?.[0];
    }
  } catch {
  }

  if (!result) {
    const chartEndpoint = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
    chartEndpoint.searchParams.set("range", range);
    chartEndpoint.searchParams.set("interval", interval);
    chartEndpoint.searchParams.set("includePrePost", "false");
    chartEndpoint.searchParams.set("events", "div,splits");
    chartEndpoint.searchParams.set("lang", "en-US");
    chartEndpoint.searchParams.set("region", "US");

    const chartResponse = await fetch(chartEndpoint, { headers: YAHOO_HEADERS });

    if (!chartResponse.ok) {
      throw new Error(`Yahoo respondeu com status ${chartResponse.status} para ${symbol}.`);
    }

    payload = await chartResponse.json();
    result = payload?.chart?.result?.[0];
  }

  const error = payload?.chart?.error || payload?.spark?.error;

  if (error || !result) {
    throw new Error(error?.description || `Sem dados para ${symbol}.`);
  }

  const closes = result?.indicators?.quote?.[0]?.close || [];
  const timestamps = result?.timestamp || [];
  const series = formatTimestampSeries(timestamps, closes);

  if (!series.length) {
    throw new Error(`Historico vazio para ${symbol}.`);
  }

  const meta = result.meta || {};
  const currentPrice = meta.regularMarketPrice ?? series[series.length - 1].close;
  const currentTimestamp = meta.regularMarketTime ?? series[series.length - 1].timestamp;
  const oneDayReference = getClosestPastPoint(series, currentTimestamp - 2 * 24 * 60 * 60);
  const oneMonthReference = getClosestPastPoint(series, currentTimestamp - 31 * 24 * 60 * 60);
  const oneYearReference = getOneYearReference(series, currentTimestamp);
  const currentYear = new Date(currentTimestamp * 1000).getUTCFullYear();
  const ytdStart = Date.UTC(currentYear, 0, 1) / 1000;
  const ytdReference = getClosestPastPoint(series, ytdStart);

  return {
    symbol,
    label: ASSET_CONFIG[symbol]?.label || meta.shortName || symbol,
    currency: meta.currency || "",
    exchangeName: meta.exchangeName || "",
    marketState: meta.marketState || ASSET_CONFIG[symbol]?.marketState || "",
    previousClose: meta.previousClose ?? null,
    regularMarketPrice: currentPrice,
    regularMarketTime: currentTimestamp,
    chartPreviousClose: meta.chartPreviousClose ?? null,
    points: series,
    changes: {
      day: computePercentChange(currentPrice, oneDayReference?.close ?? meta.previousClose ?? meta.chartPreviousClose),
      month: computePercentChange(currentPrice, oneMonthReference?.close),
      ytd: computePercentChange(currentPrice, ytdReference?.close),
      year: computePercentChange(currentPrice, oneYearReference?.close)
    }
  };
}

module.exports = async function handler(request, response) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");

  if (request.method !== "GET") {
    response.status(405).json({ error: "Metodo nao permitido." });
    return;
  }

  const symbolsParam = request.query.symbols;

  if (!symbolsParam) {
    response.status(400).json({ error: "Informe ao menos um simbolo." });
    return;
  }

  const symbols = String(symbolsParam)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  try {
    const results = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const data = await fetchYahooChart(symbol);
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
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Falha inesperada."
    });
  }
};
