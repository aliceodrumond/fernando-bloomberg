const DI_TARGETS = {
  DI27_PROXY: { label: "DI 27", year: 2027 },
  DI28_PROXY: { label: "DI 28", year: 2028 },
  DI31_PROXY: { label: "DI 31", year: 2031 },
  DI36_PROXY: { label: "DI 36", year: 2036 }
};

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

async function fetchAnbimaCurve() {
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

  const referenceDateParts = dateMatch[1].split("/");
  const referenceDate = new Date(Date.UTC(Number(referenceDateParts[2]), Number(referenceDateParts[1]) - 1, Number(referenceDateParts[0])));

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
  if (matches.length < 6) {
    throw new Error("Nao foi possivel extrair os vertices da curva ANBIMA.");
  }

  const rows = [];
  for (let index = 0; index <= matches.length - 3; index += 3) {
    rows.push({
      vertex: Number(matches[index][1].replace(",", ".")),
      rate: Number(matches[index + 2][1].replace(",", "."))
    });
  }

  return { referenceDate, rows };
}

module.exports = async function handler(request, response) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");

  if (request.method !== "GET") {
    response.status(405).json({ error: "Metodo nao permitido." });
    return;
  }

  const symbols = String(request.query.symbols || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!symbols.length) {
    response.status(400).json({ error: "Informe ao menos um simbolo DI." });
    return;
  }

  try {
    const curve = await fetchAnbimaCurve();
    const nowTs = Math.floor(Date.now() / 1000);

    const results = symbols.map((symbol) => {
      const target = DI_TARGETS[symbol];
      if (!target) {
        return { ok: false, symbol, error: "Proxy DI nao configurado." };
      }

      const targetDate = new Date(Date.UTC(target.year, 0, 2));
      const targetVertex = getBusinessDaysProxy(curve.referenceDate, targetDate);
      const rate = getInterpolatedRate(curve.rows, targetVertex);

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

    response.status(200).json({
      results,
      asOf: new Date().toISOString()
    });
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao consultar a curva ANBIMA."
    });
  }
};
