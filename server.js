const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon"
};

const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Accept: "application/json"
};

const DI_TARGETS = {
  DI27_PROXY: { label: "DI 27", year: 2027 },
  DI28_PROXY: { label: "DI 28", year: 2028 },
  DI31_PROXY: { label: "DI 31", year: 2031 },
  DI36_PROXY: { label: "DI 36", year: 2036 }
};

const ASSET_CONFIG = {
  "BRLUSD=X": { label: "BRL", marketState: "FX" },
  "USDBRL=X": { label: "USD", marketState: "FX" },
  "^BVSP": { label: "IBOVESPA", marketState: "Index" },
  "^GSPC": { label: "S&P", marketState: "Index" },
  "GC=F": { label: "GOLD", marketState: "Future" },
  "BZ=F": { label: "Brent 1st future", marketState: "Future" }
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendFile(response, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      if (error.code === "ENOENT") {
        sendJson(response, 404, { error: "Arquivo nao encontrado." });
        return;
      }

      sendJson(response, 500, { error: "Falha ao ler arquivo." });
      return;
    }

    response.writeHead(200, { "Content-Type": type });
    response.end(contents);
  });
}

function isSafePath(targetPath) {
  const resolved = path.resolve(ROOT, `.${targetPath}`);
  return resolved.startsWith(ROOT);
}

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
  const oneYearReference = getClosestPastPoint(series, currentTimestamp - 366 * 24 * 60 * 60);
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

function getBusinessDaysProxy(referenceDate, targetDate) {
  const diffDays = (targetDate.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays <= 0) {
    return 1;
  }

  return Math.round((diffDays * 252) / 365.25);
}

function getInterpolatedRate(rows, targetVertex) {
  const sorted = [...rows].sort((a, b) => a.vertex - b.vertex);
  const lower = [...sorted].reverse().find((row) => row.vertex <= targetVertex);
  const upper = sorted.find((row) => row.vertex >= targetVertex);

  if (!lower && !upper) {
    return null;
  }

  if (!lower) {
    return upper.rate;
  }

  if (!upper) {
    return lower.rate;
  }

  if (lower.vertex === upper.vertex) {
    return lower.rate;
  }

  const weight = (targetVertex - lower.vertex) / (upper.vertex - lower.vertex);
  return lower.rate + weight * (upper.rate - lower.rate);
}

async function fetchDiProxy(symbols) {
  const response = await fetch("https://www.anbima.com.br/informacoes/curvas-intradiarias/CIntra.asp", {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(`ANBIMA respondeu com status ${response.status}.`);
  }

  const html = await response.text();
  const dateMatch = html.match(/<th colspan='3' align='center' width='20%'>(\d{2}\/\d{2}\/\d{4})<\/th>/);

  if (!dateMatch) {
    throw new Error("Nao foi possivel identificar a data de referencia da curva ANBIMA.");
  }

  const [day, month, year] = dateMatch[1].split("/").map(Number);
  const referenceDate = new Date(Date.UTC(year, month - 1, day));
  const marker = "ETTJ PREFIXADOS (%a.a./252)";
  const startIndex = html.indexOf(marker);

  if (startIndex < 0) {
    throw new Error("Nao foi possivel localizar a tabela ETTJ PRE da ANBIMA.");
  }

  let tableChunk = html.slice(startIndex);
  const endIndex = tableChunk.indexOf("</table>");
  if (endIndex > 0) {
    tableChunk = tableChunk.slice(0, endIndex);
  }

  const matches = [...tableChunk.matchAll(/<td align='center'>\s*([0-9]+(?:,[0-9]+)?)\s*<\/td>/g)];
  const rows = [];

  for (let index = 0; index <= matches.length - 3; index += 3) {
    rows.push({
      vertex: Number(matches[index][1].replace(",", ".")),
      rate: Number(matches[index + 2][1].replace(",", "."))
    });
  }

  const nowTs = Math.floor(Date.now() / 1000);
  return symbols.map((symbol) => {
    const target = DI_TARGETS[symbol];
    if (!target) {
      return { ok: false, symbol, error: "Proxy DI nao configurado." };
    }

    const targetDate = new Date(Date.UTC(target.year, 0, 2));
    const targetVertex = getBusinessDaysProxy(referenceDate, targetDate);
    const rate = getInterpolatedRate(rows, targetVertex);

    if (!Number.isFinite(rate)) {
      return { ok: false, symbol, error: "Nao foi possivel interpolar a curva ANBIMA." };
    }

    return {
      ok: true,
      symbol,
      data: {
        symbol,
        currency: "%",
        exchangeName: "ANBIMA ETTJ PRE (proxy)",
        marketState: "Rates",
        regularMarketPrice: Number(rate.toFixed(4)),
        regularMarketTime: nowTs,
        points: [
          { timestamp: nowTs - 86400, close: Number(rate.toFixed(4)) },
          { timestamp: nowTs, close: Number(rate.toFixed(4)) }
        ],
        changes: {
          day: null,
          month: null,
          ytd: null,
          year: null
        }
      }
    };
  });
}

async function handleMarketApi(requestUrl, response) {
  const symbolsParam = requestUrl.searchParams.get("symbols");

  if (!symbolsParam) {
    sendJson(response, 400, { error: "Informe ao menos um simbolo." });
    return;
  }

  const symbols = symbolsParam
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

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

  sendJson(response, 200, { results, asOf: new Date().toISOString() });
}

async function handleDiProxyApi(requestUrl, response) {
  const symbolsParam = requestUrl.searchParams.get("symbols");

  if (!symbolsParam) {
    sendJson(response, 400, { error: "Informe ao menos um simbolo DI." });
    return;
  }

  const symbols = symbolsParam
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const results = await fetchDiProxy(symbols);
  sendJson(response, 200, { results, asOf: new Date().toISOString() });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (requestUrl.pathname === "/api/market") {
    try {
      await handleMarketApi(requestUrl, response);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Falha inesperada."
      });
    }
    return;
  }

  if (requestUrl.pathname === "/api/di-proxy") {
    try {
      await handleDiProxyApi(requestUrl, response);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Falha inesperada."
      });
    }
    return;
  }

  const targetPath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;

  if (!isSafePath(targetPath)) {
    sendJson(response, 403, { error: "Acesso negado." });
    return;
  }

  sendFile(response, path.resolve(ROOT, `.${targetPath}`));
});

server.listen(PORT, () => {
  console.log(`Bloomberg Yahoo dashboard em http://localhost:${PORT}`);
});
