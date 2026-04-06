const REFRESH_INTERVAL_MS = 60_000;
const CLOCK_REFRESH_MS = 1_000;
const DEFAULT_RANGE = "3M";
const GROUP_ORDER = ["FX", "Rates", "Equities", "Commodities", "Brazil", "US", "Crypto"];

const assets = [
  { name: "BRL", symbol: "BRLUSD=X", group: "FX", source: "yahoo", formatter: formatUsd },
  {
    name: "DI 27",
    symbol: "DI27_PROXY",
    group: "Rates",
    source: "diProxy",
    formatter: formatRate,
    note: "Proxy ANBIMA ETTJ PRE para o vértice de jan/2027."
  },
  {
    name: "DI 28",
    symbol: "DI28_PROXY",
    group: "Rates",
    source: "diProxy",
    formatter: formatRate,
    note: "Proxy ANBIMA ETTJ PRE para o vértice de jan/2028."
  },
  {
    name: "DI 31",
    symbol: "DI31_PROXY",
    group: "Rates",
    source: "diProxy",
    formatter: formatRate,
    note: "Proxy ANBIMA ETTJ PRE para o vértice de jan/2031."
  },
  {
    name: "DI 36",
    symbol: "DI36_PROXY",
    group: "Rates",
    source: "diProxy",
    formatter: formatRate,
    note: "Proxy ANBIMA ETTJ PRE para o vértice de jan/2036."
  },
  { name: "USD", symbol: "USDBRL=X", group: "FX", source: "yahoo", formatter: formatBrl },
  { name: "MXN", symbol: "MXN=X", group: "FX", source: "yahoo" },
  { name: "JPY", symbol: "JPY=X", group: "FX", source: "yahoo" },
  { name: "ARS", symbol: "ARS=X", group: "FX", source: "yahoo" },
  { name: "EUR", symbol: "EURUSD=X", group: "FX", source: "yahoo", formatter: formatUsd },
  { name: "EURBRL", symbol: "EURBRL=X", group: "FX", source: "yahoo", formatter: formatBrl },
  { name: "IBOVESPA", symbol: "^BVSP", group: "Equities", source: "yahoo", formatter: formatBrl },
  { name: "S&P", symbol: "^GSPC", group: "Equities", source: "yahoo", formatter: formatUsd },
  { name: "GOLD", symbol: "GC=F", group: "Commodities", source: "yahoo", formatter: formatUsd },
  { name: "Brent 1st future", symbol: "BZ=F", group: "Commodities", source: "yahoo", formatter: formatUsd },
  { name: "WTI", symbol: "CL=F", group: "Commodities", source: "yahoo", formatter: formatUsd },
  { name: "Silver", symbol: "SI=F", group: "Commodities", source: "yahoo", formatter: formatUsd },
  { name: "Copper", symbol: "HG=F", group: "Commodities", source: "yahoo", formatter: formatUsd },
  { name: "Corn", symbol: "ZC=F", group: "Commodities", source: "yahoo", formatter: formatUsd },
  { name: "Soybeans", symbol: "ZS=F", group: "Commodities", source: "yahoo", formatter: formatUsd },
  { name: "Vale", symbol: "VALE3.SA", group: "Brazil", source: "yahoo", formatter: formatBrl },
  { name: "Petrobras", symbol: "PETR4.SA", group: "Brazil", source: "yahoo", formatter: formatBrl },
  { name: "Itau", symbol: "ITUB4.SA", group: "Brazil", source: "yahoo", formatter: formatBrl },
  { name: "B3", symbol: "B3SA3.SA", group: "Brazil", source: "yahoo", formatter: formatBrl },
  { name: "WEG", symbol: "WEGE3.SA", group: "Brazil", source: "yahoo", formatter: formatBrl },
  { name: "Nubank", symbol: "NU", group: "US", source: "yahoo", formatter: formatUsd },
  { name: "Apple", symbol: "AAPL", group: "US", source: "yahoo", formatter: formatUsd },
  { name: "Microsoft", symbol: "MSFT", group: "US", source: "yahoo", formatter: formatUsd },
  { name: "NVIDIA", symbol: "NVDA", group: "US", source: "yahoo", formatter: formatUsd },
  { name: "Amazon", symbol: "AMZN", group: "US", source: "yahoo", formatter: formatUsd },
  { name: "Meta", symbol: "META", group: "US", source: "yahoo", formatter: formatUsd },
  { name: "Tesla", symbol: "TSLA", group: "US", source: "yahoo", formatter: formatUsd },
  { name: "Bitcoin", symbol: "BTC-USD", group: "Crypto", source: "yahoo", formatter: formatUsd }
];

const cardsEl = document.querySelector("#cards");
const lastUpdatedEl = document.querySelector("#last-updated");
const detailEmptyEl = document.querySelector("#detail-empty");
const detailContentEl = document.querySelector("#detail-content");
const detailStatusEl = document.querySelector("#detail-status");
const detailGroupEl = document.querySelector("#detail-group");
const detailNameEl = document.querySelector("#detail-name");
const detailSymbolEl = document.querySelector("#detail-symbol");
const detailPriceEl = document.querySelector("#detail-price");
const detailDayEl = document.querySelector("#detail-day");
const detailMonthEl = document.querySelector("#detail-month");
const detailYtdEl = document.querySelector("#detail-ytd");
const detailYearEl = document.querySelector("#detail-year");
const detailWindowEl = document.querySelector("#detail-window");
const zoomSliderEl = document.querySelector("#zoom-slider");
const rangeButtonsEl = document.querySelector("#range-buttons");
const clockCards = Array.from(document.querySelectorAll("[data-clock-zone]"));
const newsBrazilEl = document.querySelector("#news-brazil");
const newsUsEl = document.querySelector("#news-us");
const newsWorldEl = document.querySelector("#news-world");

let latestResults = [];
let selectedSymbol = null;
let selectedRange = DEFAULT_RANGE;
let detailChart = null;

async function loadData() {
  cardsEl.innerHTML = `<div class="loading">Atualizando watchlist...</div>`;
  renderNewsLoading();

  const yahooAssets = assets.filter((asset) => asset.source !== "diProxy");
  const diAssets = assets.filter((asset) => asset.source === "diProxy");

  const [marketResult, newsResult] = await Promise.allSettled([
    fetchMarketPayload(
      yahooAssets.map((asset) => asset.symbol),
      diAssets.map((asset) => asset.symbol)
    ),
    fetchNewsPayload()
  ]);

  try {
    if (marketResult.status !== "fulfilled") {
      throw marketResult.reason;
    }

    const payload = marketResult.value;
    latestResults = payload.results;

    const firstAvailable = latestResults.find((entry) => entry.ok)?.symbol || null;
    if (!selectedSymbol || !latestResults.some((entry) => entry.symbol === selectedSymbol && entry.ok)) {
      selectedSymbol = firstAvailable;
    }

    renderCards(payload.results);
    renderDetail();
    updateTimestamp(payload.asOf, false, payload.mode);
  } catch (error) {
    latestResults = [];
    renderFetchError(error);
    renderDetailError(error);
    updateTimestamp(null, true);
  }

  if (newsResult.status === "fulfilled") {
    renderNews(newsResult.value);
  } else {
    renderNewsError(newsResult.reason);
  }
}

async function fetchMarketPayload(yahooSymbols, diSymbols) {
  if (window.location.protocol === "file:") {
    throw new Error(
      "Abra a pagina pelo arquivo 'Abrir Pulse Terminal.bat' para iniciar o servidor local automaticamente."
    );
  }

  const requests = [
    fetch(`/api/market?symbols=${encodeURIComponent(yahooSymbols.join(","))}`),
    fetch(`/api/di-proxy?symbols=${encodeURIComponent(diSymbols.join(","))}`)
  ];

  const [marketResponse, diResponse] = await Promise.all(requests);
  const [marketPayload, diPayload] = await Promise.all([marketResponse.json(), diResponse.json()]);

  if (!marketResponse.ok) {
    throw new Error(marketPayload.error || "Falha ao consultar a API local.");
  }

  if (!diResponse.ok) {
    throw new Error(diPayload.error || "Falha ao consultar a curva local dos DIs.");
  }

  return {
    results: [...marketPayload.results, ...diPayload.results],
    asOf: marketPayload.asOf || diPayload.asOf,
    mode: "proxy-local"
  };
}

async function fetchNewsPayload() {
  const response = await fetch("/api/news");
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Falha ao carregar noticias.");
  }

  return payload;
}

function renderCards(results) {
  const html = [
    `
      <section class="market-table">
        <div class="table-head">
          <span>Ticker</span>
          <span>Last</span>
          <span>Day</span>
          <span>1M</span>
          <span>YTD</span>
          <span>1Y</span>
        </div>
    `
  ];

  for (const groupName of GROUP_ORDER) {
    const groupAssets = assets.filter((asset) => asset.group === groupName);
    if (!groupAssets.length) {
      continue;
    }

    html.push(`
      <div class="row-group">
        <span>${escapeHtml(groupName)}</span>
      </div>
    `);

    for (const asset of groupAssets) {
      if (!asset.symbol) {
        html.push(renderOfflineRow(asset));
        continue;
      }

      const result = results.find((entry) => entry.symbol === asset.symbol);
      html.push(renderLiveRow(asset, result));
    }
  }

  html.push(`</section>`);
  cardsEl.innerHTML = html.join("");
}

function renderLiveRow(asset, result) {
  const isActive = asset.symbol === selectedSymbol;

  if (!result || !result.ok) {
    return `
      <button type="button" class="table-row ${isActive ? "is-active" : ""}" data-symbol="${escapeHtml(asset.symbol)}">
        <div class="asset-cell">
          <div class="asset-line">
            <strong class="asset-name">${escapeHtml(asset.name)}</strong>
            ${renderProxyBadge(asset)}
          </div>
          <span class="asset-symbol">${escapeHtml(asset.symbol)}</span>
        </div>
        <div class="spot-cell">--</div>
        <div class="change-value neutral">--</div>
        <div class="change-value neutral">--</div>
        <div class="change-value neutral">--</div>
        <div class="change-value neutral">--</div>
        <div class="row-note">${escapeHtml(result?.error || "Sem resposta do Yahoo Finance.")}</div>
      </button>
    `;
  }

  const priceFormatter = asset.formatter || inferFormatter(result.data.currency);

  return `
    <button type="button" class="table-row ${isActive ? "is-active" : ""}" data-symbol="${escapeHtml(asset.symbol)}">
      <div class="asset-cell">
        <div class="asset-line">
          <strong class="asset-name">${escapeHtml(asset.name)}</strong>
          ${renderProxyBadge(asset)}
        </div>
        <span class="asset-symbol">${escapeHtml(asset.symbol)}</span>
      </div>
      <div class="spot-cell">
        ${priceFormatter(result.data.regularMarketPrice)}
        <span class="meta">${escapeHtml(result.data.currency || result.data.exchangeName || "Yahoo")}</span>
      </div>
      ${renderChangeCell(result.data.changes.day)}
      ${renderChangeCell(result.data.changes.month)}
      ${renderChangeCell(result.data.changes.ytd)}
      ${renderChangeCell(result.data.changes.year)}
    </button>
  `;
}

function renderOfflineRow(asset) {
  return `
    <button type="button" class="table-row" disabled>
      <div class="asset-cell">
        <div class="asset-line">
          <strong class="asset-name">${escapeHtml(asset.name)}</strong>
          ${renderProxyBadge(asset)}
        </div>
        <span class="asset-symbol">${asset.source === "diProxy" ? "Proxy local" : "Ticker pendente"}</span>
      </div>
      <div class="spot-cell">--</div>
      <div class="change-value neutral">--</div>
      <div class="change-value neutral">--</div>
      <div class="change-value neutral">--</div>
      <div class="change-value neutral">--</div>
      <div class="row-note">${escapeHtml(asset.note || "Defina um ticker do Yahoo Finance para ativar este ativo.")}</div>
    </button>
  `;
}

function renderFetchError(error) {
  cardsEl.innerHTML = `
    <section class="market-table">
      <div class="error-note">
        Nao foi possivel atualizar os dados ao vivo agora.<br />
        ${escapeHtml(error.message || "Erro desconhecido.")}
      </div>
    </section>
  `;
}

function renderDetail() {
  const activeAsset = assets.find((asset) => asset.symbol === selectedSymbol);
  const activeResult = latestResults.find((entry) => entry.symbol === selectedSymbol && entry.ok);

  if (!activeAsset || !activeResult) {
    detailEmptyEl.classList.remove("hidden");
    detailContentEl.classList.add("hidden");
    detailStatusEl.textContent = "Selecione um ativo";
    destroyChart();
    return;
  }

  const { data } = activeResult;
  const formatter = activeAsset.formatter || inferFormatter(data.currency);
  const filteredPoints = getFilteredPoints(data.points || [], selectedRange, Number(zoomSliderEl.value));
  const firstLabel = filteredPoints[0];
  const lastLabel = filteredPoints[filteredPoints.length - 1];

  detailEmptyEl.classList.add("hidden");
  detailContentEl.classList.remove("hidden");

  detailStatusEl.textContent = `${activeAsset.group} | ${data.exchangeName || data.marketState || "Yahoo"}`;
  detailGroupEl.textContent = activeAsset.group;
  detailNameEl.innerHTML = `
    <span class="detail-title-line">
      <span>${escapeHtml(activeAsset.name)}</span>
      ${renderProxyBadge(activeAsset)}
    </span>
  `;
  detailSymbolEl.textContent = activeAsset.symbol;
  detailPriceEl.textContent = formatter(data.regularMarketPrice);

  setChangeText(detailDayEl, data.changes.day);
  setChangeText(detailMonthEl, data.changes.month);
  setChangeText(detailYtdEl, data.changes.ytd);
  setChangeText(detailYearEl, data.changes.year);

  detailWindowEl.textContent = firstLabel && lastLabel
    ? `Janela: ${formatPointDate(firstLabel.timestamp)} a ${formatPointDate(lastLabel.timestamp)}`
    : "Janela: --";

  renderChart(filteredPoints, formatter, activeAsset.name);
}

function renderDetailError(error) {
  detailEmptyEl.classList.remove("hidden");
  detailContentEl.classList.add("hidden");
  detailStatusEl.textContent = "Sem conexão";
  detailEmptyEl.textContent = `Nao foi possivel carregar o painel de detalhe. ${error.message || ""}`.trim();
  destroyChart();
}

function renderChart(points, formatter, label) {
  const canvas = document.querySelector("#detail-chart");
  if (!canvas || !points.length) {
    destroyChart();
    return;
  }

  destroyChart();

  detailChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: points.map((point) => formatPointDate(point.timestamp)),
      datasets: [
        {
          label,
          data: points.map((point) => point.close),
          borderColor: "#ffb01f",
          borderWidth: 2,
          backgroundColor: "rgba(255, 176, 31, 0.10)",
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.16
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: "index",
          intersect: false,
          displayColors: false,
          callbacks: {
            label(context) {
              return ` ${formatter(context.parsed.y)}`;
            }
          }
        }
      },
      interaction: {
        intersect: false,
        mode: "index"
      },
      scales: {
        x: {
          ticks: {
            color: "#8f8f8f",
            maxTicksLimit: 8
          },
          grid: {
            color: "rgba(255,255,255,0.06)"
          }
        },
        y: {
          ticks: {
            color: "#8f8f8f",
            callback(value) {
              return formatter(value);
            }
          },
          grid: {
            color: "rgba(255,255,255,0.06)"
          }
        }
      }
    }
  });
}

function renderProxyBadge(asset) {
  if (asset.source !== "diProxy") {
    return "";
  }

  return `<span class="proxy-badge">ANBIMA proxy</span>`;
}

function renderNewsLoading() {
  newsBrazilEl.innerHTML = `<div class="news-empty">Carregando notícias do Brasil...</div>`;
  newsUsEl.innerHTML = `<div class="news-empty">Carregando notícias dos EUA...</div>`;
  newsWorldEl.innerHTML = `<div class="news-empty">Carregando notícias do mundo...</div>`;
}

function renderNews(payload) {
  renderNewsColumn(newsBrazilEl, payload.brazil || [], "Sem notícias do Brasil agora.");
  renderNewsColumn(newsUsEl, payload.us || [], "Sem notícias dos EUA agora.");
  renderNewsColumn(newsWorldEl, payload.world || [], "Sem notícias globais agora.");
}

function renderNewsError(error) {
  const message = escapeHtml(error?.message || "Falha ao carregar notícias.");
  newsBrazilEl.innerHTML = `<div class="news-empty">${message}</div>`;
  newsUsEl.innerHTML = `<div class="news-empty">${message}</div>`;
  newsWorldEl.innerHTML = `<div class="news-empty">${message}</div>`;
}

function renderNewsColumn(element, items, emptyText) {
  if (!items.length) {
    element.innerHTML = `<div class="news-empty">${escapeHtml(emptyText)}</div>`;
    return;
  }

  element.innerHTML = items
    .map(
      (item) => `
        <article class="news-item">
          <a href="${escapeHtml(item.link)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>
          <span class="news-source">${escapeHtml(item.source || "News")} | ${escapeHtml(item.published || "")}</span>
        </article>
      `
    )
    .join("");
}

function destroyChart() {
  if (detailChart) {
    detailChart.destroy();
    detailChart = null;
  }
}

function getFilteredPoints(points, range, zoomValue) {
  const rangePoints = applyRange(points, range);
  const ratio = Math.max(0.2, Math.min(1, zoomValue / 100));
  const visibleCount = Math.max(20, Math.floor(rangePoints.length * ratio));
  return rangePoints.slice(-visibleCount);
}

function applyRange(points, range) {
  if (!points.length) {
    return [];
  }

  if (range === "1Y") {
    return points;
  }

  const nowTimestamp = points[points.length - 1].timestamp;
  const dayInSeconds = 24 * 60 * 60;

  if (range === "1M") {
    return points.filter((point) => point.timestamp >= nowTimestamp - 31 * dayInSeconds);
  }

  if (range === "3M") {
    return points.filter((point) => point.timestamp >= nowTimestamp - 92 * dayInSeconds);
  }

  if (range === "6M") {
    return points.filter((point) => point.timestamp >= nowTimestamp - 183 * dayInSeconds);
  }

  if (range === "YTD") {
    const currentYear = new Date(nowTimestamp * 1000).getUTCFullYear();
    const yearStart = Date.UTC(currentYear, 0, 1) / 1000;
    return points.filter((point) => point.timestamp >= yearStart);
  }

  return points;
}

function renderChangeCell(value) {
  const state = getChangeState(value);
  const content = Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}%` : "--";
  return `<div class="change-value ${state}">${content}</div>`;
}

function setChangeText(element, value) {
  const state = getChangeState(value);
  const content = Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}%` : "--";
  element.textContent = content;
  element.className = state;
}

function updateTimestamp(isoDate, errored = false, mode = "") {
  if (errored || !isoDate) {
    lastUpdatedEl.textContent = "ultima tentativa sem sucesso";
    return;
  }

  const formatted = new Date(isoDate).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium"
  });

  const suffix = mode === "proxy-local" ? " | proxy local" : "";
  lastUpdatedEl.textContent = `atualizado em ${formatted}${suffix}`;
}

function inferFormatter(currency) {
  if (currency === "BRL") {
    return formatBrl;
  }

  if (currency === "USD") {
    return formatUsd;
  }

  if (currency === "%") {
    return formatRate;
  }

  return (value) => formatCurrency(value, currency);
}

function formatRate(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return `${value.toFixed(2)}%`;
}

function formatUsd(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value > 100 ? 2 : 4
  }).format(value);
}

function formatBrl(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: value > 100 ? 2 : 4
  }).format(value);
}

function formatCurrency(value, currency) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: value > 100 ? 2 : 4
    }).format(value);
  } catch {
    return `${value.toFixed(4)} ${currency || ""}`.trim();
  }
}

function getChangeState(value) {
  if (!Number.isFinite(value)) {
    return "neutral";
  }

  if (value > 0) {
    return "positive";
  }

  if (value < 0) {
    return "negative";
  }

  return "neutral";
}

function formatPointDate(timestamp) {
  return new Date(timestamp * 1000).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function updateClocks() {
  for (const card of clockCards) {
    const zone = card.dataset.clockZone;
    const timeEl = card.querySelector(".clock-time");
    if (!timeEl || !zone) {
      continue;
    }

    timeEl.textContent = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date());
  }
}

cardsEl.addEventListener("click", (event) => {
  const row = event.target.closest("[data-symbol]");
  if (!row) {
    return;
  }

  const symbol = row.dataset.symbol;
  if (!symbol) {
    return;
  }

  selectedSymbol = symbol;
  renderCards(latestResults);
  renderDetail();
});

rangeButtonsEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-range]");
  if (!button) {
    return;
  }

  selectedRange = button.dataset.range;
  for (const item of rangeButtonsEl.querySelectorAll(".range-button")) {
    item.classList.toggle("active", item === button);
  }
  renderDetail();
});

zoomSliderEl.addEventListener("input", () => {
  renderDetail();
});

updateClocks();
setInterval(updateClocks, CLOCK_REFRESH_MS);
loadData();
setInterval(loadData, REFRESH_INTERVAL_MS);
