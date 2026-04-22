const TESOURO_CSV_URL = "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv";

const UST_CONFIG = {
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
  return line
    .split(",")
    .map((item) => item.replace(/^"|"$/g, "").trim());
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
  const config = UST_CONFIG[symbol];
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
  const currentYearStart = Date.UTC(new Date(currentTimestamp * 1000).getUTCFullYear(), 0, 1) / 1000;
  const ytdReference = getClosestPastPoint(series, currentYearStart);

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

module.exports = async function handler(request, response) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");

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

  const results = [];
  const needsBrazilTesouro = symbols.some((symbol) => BR_TESOURO_CONFIG[symbol]);
  const brazilTesouroRows = needsBrazilTesouro ? await fetchTesouroBrazilRows() : null;

  for (const symbol of symbols) {
    try {
      let data;
      if (BR_TESOURO_CONFIG[symbol]) {
        data = buildBrazilTesouroSeries(brazilTesouroRows, symbol);
      } else if (UST_CONFIG[symbol]) {
        data = await fetchUsTreasurySeries(symbol);
      } else {
        results.push({ ok: false, symbol, error: "Ativo do Tesouro nao configurado." });
        continue;
      }

      results.push({ ok: true, symbol, data });
    } catch (error) {
      results.push({
        ok: false,
        symbol,
        error: error instanceof Error ? error.message : "Falha ao carregar Tesouro."
      });
    }
  }

  response.status(200).json({
    results,
    asOf: new Date().toISOString(),
    source: {
      brazil: TESOURO_CSV_URL,
      us: "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/"
    }
  });
};
