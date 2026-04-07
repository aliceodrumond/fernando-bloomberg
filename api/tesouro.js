const TESOURO_CSV_URL = "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv";

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

async function fetchTesouroPrefixado() {
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

  const rows = lines
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
    .filter((row) => row.tipo === "Tesouro Prefixado" && row.vencimento && row.dataBase && Number.isFinite(row.taxaCompra));

  if (!rows.length) {
    throw new Error("Sem dados de Tesouro Prefixado no arquivo oficial.");
  }

  const latestBaseDate = rows.reduce((latest, row) => (row.dataBase > latest ? row.dataBase : latest), rows[0].dataBase);
  const currentCandidates = rows
    .filter((row) => row.dataBase.getTime() === latestBaseDate.getTime())
    .filter((row) => row.vencimento > latestBaseDate)
    .sort((a, b) => a.vencimento - b.vencimento);

  const selected = currentCandidates[0];
  if (!selected) {
    throw new Error("Nao foi possivel localizar um Tesouro Prefixado vigente na data-base atual.");
  }

  const series = rows
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
  const oneYearReference = getClosestPastPoint(series, currentTimestamp - 366 * 24 * 60 * 60);
  const ytdStart = Date.UTC(latestBaseDate.getUTCFullYear(), 0, 1) / 1000;
  const ytdReference = getClosestPastPoint(series, ytdStart);

  return {
    symbol: "TESOURO_PREFIXADO",
    currency: "%",
    exchangeName: `Tesouro Prefixado ${selected.vencimentoRaw}`,
    shortName: `Tesouro Prefixado ${selected.vencimentoRaw}`,
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
  for (const symbol of symbols) {
    if (symbol !== "TESOURO_PREFIXADO") {
      results.push({ ok: false, symbol, error: "Ativo do Tesouro nao configurado." });
      continue;
    }

    try {
      const data = await fetchTesouroPrefixado();
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
    source: TESOURO_CSV_URL
  });
};
