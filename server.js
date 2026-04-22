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
  Accept: "application/json,text/html,application/xhtml+xml"
};

const NEWS_FEEDS = {
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

const PALMEIRAS_API_ROOT = "https://apiverdao.palmeiras.com.br/wp-json/apiverdao/v1/jogos-mes/";
const PALMEIRAS_CALENDAR_URL = "https://www.palmeiras.com.br/calendario/";
const FIFA_GAMES_URL = "https://fifaworldcup26.suites.fifa.com/games/";
const TESOURO_CSV_URL = "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv";
const US_TREASURY_CONFIG = {
  UST_2Y: { column: "2 Yr", name: "UST 2y" },
  UST_5Y: { column: "5 Yr", name: "UST 5y" },
  UST_10Y: { column: "10 Yr", name: "UST 10y" },
  UST_30Y: { column: "30 Yr", name: "UST 30y" }
};
const BR_TESOURO_CONFIG = {
  TESOURO_PREFIXADO: { tipo: "Tesouro Prefixado", vencimentoRaw: null, name: "Tesouro Prefixado" },
  NTNB_2029: { tipo: "Tesouro IPCA+", vencimentoRaw: "15/05/2029", name: "NTN-B 2029" },
  NTNB_2035: { tipo: "Tesouro IPCA+", vencimentoRaw: "15/05/2035", name: "NTN-B 2035" },
  NTNB_2045: { tipo: "Tesouro IPCA+", vencimentoRaw: "15/05/2045", name: "NTN-B 2045" },
  NTNB_JS_2035: { tipo: "Tesouro IPCA+ com Juros Semestrais", vencimentoRaw: "15/05/2035", name: "NTN-B JS 2035" },
  NTNB_JS_2055: { tipo: "Tesouro IPCA+ com Juros Semestrais", vencimentoRaw: "15/05/2055", name: "NTN-B JS 2055" }
};

const PALMEIRAS_CITY_MAP = new Map([
  ["allianz parque", "São Paulo"],
  ["arena crefisa barueri", "Barueri"],
  ["arena fonte nova", "Salvador"],
  ["neo química arena", "São Paulo"],
  ["olímpico jaime morón león", "Cartagena"],
  ["olimpico jaime moron leon", "Cartagena"],
  ["cícero de souza marques", "Bragança Paulista"],
  ["cicero de souza marques", "Bragança Paulista"],
  ["nueva olla", "Assunção"]
]);

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

function getOneYearReference(series, currentTimestamp) {
  return getClosestPastPoint(series, currentTimestamp - 366 * 24 * 60 * 60) || series[0] || null;
}

function computePercentChange(current, reference) {
  if (!Number.isFinite(current) || !Number.isFinite(reference) || reference === 0) {
    return null;
  }

  return ((current / reference) - 1) * 100;
}

function parsePtBrNumber(value) {
  const normalized = String(value || "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePtBrDate(value) {
  const [day, month, year] = String(value || "").split("/").map(Number);
  if (!day || !month || !year) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
}

function parseUsDate(value) {
  const [month, day, year] = String(value || "").split("/").map(Number);
  if (!day || !month || !year) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
}

function parseCsvLine(line) {
  return String(line)
    .split(",")
    .map((item) => item.replace(/^"|"$/g, "").trim());
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

async function fetchTesouroBrazilRows() {
  const response = await fetch(TESOURO_CSV_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/csv,text/plain,*/*"
    }
  });

  if (!response.ok) {
    throw new Error(`Tesouro respondeu com status ${response.status}.`);
  }

  const csv = await response.text();
  const lines = csv.split(/\r?\n/).filter(Boolean);
  lines.shift();

  return lines
    .map((line) => line.split(";"))
    .filter((parts) => parts.length >= 8)
    .map((parts) => ({
      tipo: parts[0],
      vencimentoRaw: parts[1],
      dataBaseRaw: parts[2],
      taxaCompra: parsePtBrNumber(parts[3]),
      vencimento: parsePtBrDate(parts[1]),
      dataBase: parsePtBrDate(parts[2])
    }))
    .filter((row) => row.vencimento && row.dataBase && Number.isFinite(row.taxaCompra));
}

function buildBrazilTesouroSeries(rows, symbol) {
  const config = BR_TESOURO_CONFIG[symbol];
  if (!config) {
    throw new Error("Ativo do Tesouro nao configurado.");
  }

  const matchingRows = rows.filter((row) => row.tipo === config.tipo);
  if (!matchingRows.length) {
    throw new Error(`Sem dados oficiais para ${config.name}.`);
  }

  const latestBaseDate = rows.reduce((latest, row) => (row.dataBase > latest ? row.dataBase : latest), rows[0].dataBase);
  let selected;

  if (config.vencimentoRaw) {
    selected = matchingRows.find(
      (row) => row.dataBase.getTime() === latestBaseDate.getTime() && row.vencimentoRaw === config.vencimentoRaw
    );
  } else {
    const currentCandidates = matchingRows
      .filter((row) => row.dataBase.getTime() === latestBaseDate.getTime())
      .filter((row) => row.vencimento > latestBaseDate)
      .sort((a, b) => a.vencimento - b.vencimento);
    selected = currentCandidates[0];
  }

  if (!selected) {
    throw new Error(`Nao foi possivel localizar ${config.name} na data-base atual.`);
  }

  const series = matchingRows
    .filter((row) => row.vencimentoRaw === selected.vencimentoRaw)
    .sort((a, b) => a.dataBase - b.dataBase)
    .map((row) => ({
      timestamp: Math.floor(row.dataBase.getTime() / 1000),
      close: row.taxaCompra
    }));

  const currentPrice = selected.taxaCompra;
  const currentTimestamp = Math.floor(latestBaseDate.getTime() / 1000);
  const oneDayReference = getClosestPastPoint(series, currentTimestamp - 2 * 24 * 60 * 60);
  const oneMonthReference = getClosestPastPoint(series, currentTimestamp - 31 * 24 * 60 * 60);
  const oneYearReference = getOneYearReference(series, currentTimestamp);
  const ytdStart = Date.UTC(latestBaseDate.getUTCFullYear(), 0, 1) / 1000;
  const ytdReference = getClosestPastPoint(series, ytdStart);

  return {
    symbol,
    currency: "%",
    exchangeName: `${config.name} ${selected.vencimentoRaw}`,
    shortName: `${config.name} ${selected.vencimentoRaw}`,
    marketState: "Tesouro Transparente",
    regularMarketPrice: currentPrice,
    regularMarketTime: currentTimestamp,
    points: series,
    changes: {
      day: computePercentChange(currentPrice, oneDayReference?.close),
      month: computePercentChange(currentPrice, oneMonthReference?.close),
      ytd: computePercentChange(currentPrice, ytdReference?.close),
      year: computePercentChange(currentPrice, oneYearReference?.close)
    }
  };
}

async function fetchUsTreasuryCsv(year) {
  const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?_format=csv&type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page=`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/csv,text/plain,*/*"
    }
  });

  if (!response.ok) {
    throw new Error(`U.S. Treasury respondeu com status ${response.status} para ${year}.`);
  }

  return response.text();
}

async function fetchUsTreasurySeries(symbol) {
  const config = US_TREASURY_CONFIG[symbol];
  if (!config) {
    throw new Error("Ativo de Treasury dos EUA nao configurado.");
  }

  const currentYear = new Date().getUTCFullYear();
  const csvChunks = await Promise.all([fetchUsTreasuryCsv(currentYear - 1), fetchUsTreasuryCsv(currentYear)]);
  const rows = [];

  for (const csv of csvChunks) {
    const lines = csv.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      continue;
    }

    const headers = parseCsvLine(lines[0]);
    const dateIndex = headers.indexOf("Date");
    const valueIndex = headers.indexOf(config.column);

    if (dateIndex < 0 || valueIndex < 0) {
      continue;
    }

    for (const line of lines.slice(1)) {
      const parts = parseCsvLine(line);
      const date = parseUsDate(parts[dateIndex]);
      const close = Number(parts[valueIndex]);

      if (!date || !Number.isFinite(close)) {
        continue;
      }

      rows.push({
        timestamp: Math.floor(date.getTime() / 1000),
        close
      });
    }
  }

  const series = rows
    .sort((a, b) => a.timestamp - b.timestamp)
    .filter((row, index, array) => index === 0 || row.timestamp !== array[index - 1].timestamp);

  if (!series.length) {
    throw new Error(`Sem dados oficiais para ${config.name}.`);
  }

  const currentPoint = series[series.length - 1];
  const currentTimestamp = currentPoint.timestamp;
  const oneDayReference = getClosestPastPoint(series, currentTimestamp - 2 * 24 * 60 * 60);
  const oneMonthReference = getClosestPastPoint(series, currentTimestamp - 31 * 24 * 60 * 60);
  const oneYearReference = getOneYearReference(series, currentTimestamp);
  const ytdStart = Date.UTC(new Date(currentTimestamp * 1000).getUTCFullYear(), 0, 1) / 1000;
  const ytdReference = getClosestPastPoint(series, ytdStart);

  return {
    symbol,
    currency: "%",
    exchangeName: "U.S. Treasury",
    shortName: config.name,
    marketState: "Treasury",
    regularMarketPrice: currentPoint.close,
    regularMarketTime: currentTimestamp,
    points: series,
    changes: {
      day: computePercentChange(currentPoint.close, oneDayReference?.close),
      month: computePercentChange(currentPoint.close, oneMonthReference?.close),
      ytd: computePercentChange(currentPoint.close, ytdReference?.close),
      year: computePercentChange(currentPoint.close, oneYearReference?.close)
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

function shiftBusinessDays(date, businessDays) {
  const shifted = new Date(date.getTime());
  let remaining = Math.abs(businessDays);
  const direction = businessDays >= 0 ? 1 : -1;

  while (remaining > 0) {
    shifted.setUTCDate(shifted.getUTCDate() + direction);
    const weekDay = shifted.getUTCDay();
    if (weekDay !== 0 && weekDay !== 6) {
      remaining -= 1;
    }
  }

  return shifted;
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
      priorRate: Number(matches[index + 1][1].replace(",", ".")),
      rate: Number(matches[index + 2][1].replace(",", "."))
    });
  }

  const currentTimestamp = Math.floor(referenceDate.getTime() / 1000);
  const previousReferenceDate = shiftBusinessDays(referenceDate, -1);
  const previousTimestamp = Math.floor(previousReferenceDate.getTime() / 1000);
  return symbols.map((symbol) => {
    const target = DI_TARGETS[symbol];
    if (!target) {
      return { ok: false, symbol, error: "Proxy DI nao configurado." };
    }

    const targetDate = new Date(Date.UTC(target.year, 0, 2));
    const targetVertex = getBusinessDaysProxy(referenceDate, targetDate);
    const rate = getInterpolatedRate(rows, targetVertex);
    const previousRate = getInterpolatedRate(
      rows
        .filter((row) => Number.isFinite(row.priorRate))
        .map((row) => ({ vertex: row.vertex, rate: row.priorRate })),
      targetVertex
    );

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
        regularMarketTime: currentTimestamp,
        points: [
          { timestamp: previousTimestamp, close: Number((Number.isFinite(previousRate) ? previousRate : rate).toFixed(4)) },
          { timestamp: currentTimestamp, close: Number(rate.toFixed(4)) }
        ],
        changes: {
          day: computePercentChange(rate, previousRate),
          month: null,
          ytd: null,
          year: null
        }
      }
    };
  });
}

function decodeXml(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function normalizeText(value) {
  return decodeXml(String(value || ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSlugKey(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function buildMonthRefs(count = 3) {
  const refs = [];
  const today = new Date();

  for (let offset = 0; offset < count; offset += 1) {
    const cursor = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    refs.push({ year: cursor.getFullYear(), month: cursor.getMonth() + 1 });
  }

  return refs;
}

function parseMatchTimestamp(year, dateLabel, timeLabel) {
  const [day, month] = String(dateLabel || "")
    .split("/")
    .map((item) => Number(item));
  const cleanTime = String(timeLabel || "00:00").replace(/[Hh]/g, ":");
  const [hour, minute] = cleanTime.split(":").map((item) => Number(item));

  if (!day || !month || Number.isNaN(hour) || Number.isNaN(minute)) {
    return Number.NaN;
  }

  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

function formatDateLabel(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatTimeLabel(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function resolvePalmeirasCity(stadium) {
  const key = toSlugKey(stadium);
  for (const [needle, city] of PALMEIRAS_CITY_MAP.entries()) {
    if (key.includes(needle)) {
      return city;
    }
  }

  return normalizeText(stadium);
}

function buildPalmeirasLabel(homeTeam, awayTeam) {
  const home = normalizeText(homeTeam);
  const away = normalizeText(awayTeam);
  const opponent = toSlugKey(home) === "palmeiras" ? away : home;
  return `Palmeiras x ${opponent}`;
}

function buildBrazilLabel(name) {
  const [left = "", right = ""] = normalizeText(name).split(/\s+vs\.\s+/i);
  const leftKey = toSlugKey(left);
  const rightKey = toSlugKey(right);
  const opponent = leftKey === "brazil" ? right : rightKey === "brazil" ? left : normalizeText(name);
  return `Brasil x ${opponent}`;
}

function parseFifaStartDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) {
    return null;
  }

  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    0,
    0
  );
}

function parseNewsItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .slice(0, 6)
    .map((match) => {
      const chunk = match[1];
      const title = chunk.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/);
      const link = chunk.match(/<link>(.*?)<\/link>/);
      const published = chunk.match(/<pubDate>(.*?)<\/pubDate>/);
      const source = chunk.match(/<source[^>]*>(.*?)<\/source>/);

      return {
        title: decodeXml(title?.[1] || title?.[2] || ""),
        link: decodeXml(link?.[1] || ""),
        published: decodeXml(published?.[1] || ""),
        source: decodeXml(source?.[1] || "")
      };
    })
    .filter((item) => item.title && item.link)
    .sort((a, b) => Date.parse(b.published || "") - Date.parse(a.published || ""));
}

async function fetchNewsFeed(url) {
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
  return parseNewsItems(xml);
}

async function fetchNewsFeedWithRetry(url, attempts = 2) {
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetchNewsFeed(url);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

async function fetchNewsFeedGroup(urls) {
  let lastError = null;

  for (const url of urls) {
    try {
      const items = await fetchNewsFeedWithRetry(url, 3);
      if (items.length) {
        return items;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Nenhum feed de noticias respondeu.");
}

async function fetchPalmeirasGames() {
  const refs = buildMonthRefs(3);
  const responses = await Promise.all(
    refs.map(async ({ month, year }) => {
      const url = `${PALMEIRAS_API_ROOT}?mes=${month}&ano=${year}`;
      const response = await fetch(url, { headers: YAHOO_HEADERS });

      if (!response.ok) {
        return { year, games: [] };
      }

      const raw = await response.text();
      let payload = null;

      try {
        payload = JSON.parse(raw);
      } catch {
        return { year, games: [] };
      }

      return { year, games: Array.isArray(payload?.jogos) ? payload.jogos : [] };
    })
  );

  const now = Date.now();
  return responses
    .flatMap(({ year, games }) =>
      games.map((game) => {
        const timestamp = parseMatchTimestamp(year, game.data_jogo, game.hora1 || game.hora);
        const opponent = toSlugKey(game.time_casa) === "palmeiras"
          ? normalizeText(game.time_visitante)
          : normalizeText(game.time_casa);

        return {
          timestamp,
          label: buildPalmeirasLabel(game.time_casa, game.time_visitante),
          team: "Palmeiras",
          opponent,
          date: Number.isFinite(timestamp) ? formatDateLabel(new Date(timestamp)) : `${normalizeText(game.data_jogo)}/${year}`,
          time: normalizeText(game.hora1 || game.hora).replace(/[Hh]/g, ":"),
          city: resolvePalmeirasCity(game.estadio),
          stadium: normalizeText(game.estadio),
          competition: normalizeText(game.campeonato),
          source: "Palmeiras oficial",
          link: PALMEIRAS_CALENDAR_URL
        };
      })
    )
    .filter((game) => Number.isFinite(game.timestamp) && game.timestamp >= now)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(0, 2);
}

async function fetchBrazilGames() {
  const now = new Date();
  if (now.getMonth() < 5) {
    return [];
  }

  const response = await fetch(FIFA_GAMES_URL, { headers: YAHOO_HEADERS });
  if (!response.ok) {
    throw new Error(`FIFA respondeu com status ${response.status}.`);
  }

  const html = await response.text();
  const matches = [...html.matchAll(/<script type="application\/ld\+json">(\{[\s\S]*?\})<\/script>/g)];
  const nowTimestamp = Date.now();

  return matches
    .map((match) => {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((entry) => entry["@type"] === "Event" && /Brazil/i.test(entry.name || ""))
    .map((entry) => {
      const date = parseFifaStartDate(entry.startDate);
      const label = buildBrazilLabel(entry.name);

      return {
        timestamp: date ? date.getTime() : Number.NaN,
        label,
        team: "Brasil",
        opponent: label.replace(/^Brasil x /, ""),
        date: date ? formatDateLabel(date) : "",
        time: date ? formatTimeLabel(date) : "",
        city: normalizeText(entry.location?.address?.addressLocality || ""),
        stadium: normalizeText(entry.location?.name || ""),
        competition: "Copa do Mundo 2026",
        source: "FIFA oficial",
        link: FIFA_GAMES_URL
      };
    })
    .filter((game) => Number.isFinite(game.timestamp) && game.timestamp >= nowTimestamp)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(0, 3);
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

async function handleTesouroApi(requestUrl, response) {
  const symbolsParam = requestUrl.searchParams.get("symbols");

  if (!symbolsParam) {
    sendJson(response, 400, { error: "Informe ao menos um simbolo do Tesouro." });
    return;
  }

  const symbols = symbolsParam
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const needsBrazilTesouro = symbols.some((symbol) => BR_TESOURO_CONFIG[symbol]);
  const brazilTesouroRows = needsBrazilTesouro ? await fetchTesouroBrazilRows() : null;

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        let data;
        if (BR_TESOURO_CONFIG[symbol]) {
          data = buildBrazilTesouroSeries(brazilTesouroRows, symbol);
        } else if (US_TREASURY_CONFIG[symbol]) {
          data = await fetchUsTreasurySeries(symbol);
        } else {
          return { ok: false, symbol, error: "Ativo do Tesouro nao configurado." };
        }

        return { ok: true, symbol, data };
      } catch (error) {
        return {
          ok: false,
          symbol,
          error: error instanceof Error ? error.message : "Falha ao carregar Tesouro."
        };
      }
    })
  );

  sendJson(response, 200, { results, asOf: new Date().toISOString() });
}

async function handleNewsApi(response) {
  const [brazil, us, world] = await Promise.allSettled([
    fetchNewsFeedGroup(NEWS_FEEDS.brazil),
    fetchNewsFeedGroup(NEWS_FEEDS.us),
    fetchNewsFeedGroup(NEWS_FEEDS.world)
  ]);

  sendJson(response, 200, {
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
}

async function handleGamesApi(response) {
  const [palmeirasResult, brazilResult] = await Promise.allSettled([
    fetchPalmeirasGames(),
    fetchBrazilGames()
  ]);

  const errors = {};
  if (palmeirasResult.status !== "fulfilled") {
    errors.palmeiras = palmeirasResult.reason instanceof Error
      ? palmeirasResult.reason.message
      : "Falha ao carregar agenda do Palmeiras.";
  }

  if (brazilResult.status !== "fulfilled") {
    errors.brazil = brazilResult.reason instanceof Error
      ? brazilResult.reason.message
      : "Falha ao carregar agenda do Brasil.";
  }

  sendJson(response, 200, {
    palmeiras: palmeirasResult.status === "fulfilled" ? palmeirasResult.value : [],
    brazil: brazilResult.status === "fulfilled" ? brazilResult.value : [],
    errors,
    asOf: new Date().toISOString(),
    sources: {
      palmeiras: PALMEIRAS_CALENDAR_URL,
      brazil: FIFA_GAMES_URL
    }
  });
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

  if (requestUrl.pathname === "/api/tesouro") {
    try {
      await handleTesouroApi(requestUrl, response);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Falha inesperada."
      });
    }
    return;
  }

  if (requestUrl.pathname === "/api/news") {
    try {
      await handleNewsApi(response);
    } catch (error) {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Falha inesperada."
      });
    }
    return;
  }

  if (requestUrl.pathname === "/api/games") {
    try {
      await handleGamesApi(response);
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
