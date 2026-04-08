const REFRESH_INTERVAL_MS = 60_000;
const CLOCK_REFRESH_MS = 1_000;
const DEFAULT_RANGE = "3M";
const GROUP_ORDER = ["FX", "Rates", "Equities", "Commodities", "Brazil", "US", "Crypto"];

const assets = [
  { name: "BRL", symbol: "USDBRL=X", group: "FX", source: "yahoo", formatter: formatBrl, invertChangeColors: true },
  {
    name: "DI 27",
    symbol: "DI27_PROXY",
    group: "Rates",
    source: "diProxy",
    formatter: formatRate,
    changeDisplay: "bps",
    note: "Proxy ANBIMA ETTJ PRE para o vértice de jan/2027."
  },
  {
    name: "DI 28",
    symbol: "DI28_PROXY",
    group: "Rates",
    source: "diProxy",
    formatter: formatRate,
    changeDisplay: "bps",
    note: "Proxy ANBIMA ETTJ PRE para o vértice de jan/2028."
  },
  {
    name: "DI 31",
    symbol: "DI31_PROXY",
    group: "Rates",
    source: "diProxy",
    formatter: formatRate,
    changeDisplay: "bps",
    note: "Proxy ANBIMA ETTJ PRE para o vértice de jan/2031."
  },
  {
    name: "DI 36",
    symbol: "DI36_PROXY",
    group: "Rates",
    source: "diProxy",
    formatter: formatRate,
    changeDisplay: "bps",
    note: "Proxy ANBIMA ETTJ PRE para o vértice de jan/2036."
  },
  {
    name: "Tesouro Prefixado",
    symbol: "TESOURO_PREFIXADO_HIDDEN",
    hidden: true,
    group: "Rates",
    source: "tesouro",
    formatter: formatRate,
    changeDisplay: "bps",
    note: "Taxa oficial diária do Tesouro Transparente para o prefixado mais curto disponível."
  },
  { name: "UST 2y", symbol: "UST_2Y", group: "Rates", source: "tesouro", formatter: formatRate, changeDisplay: "bps" },
  { name: "UST 5y", symbol: "UST_5Y", group: "Rates", source: "tesouro", formatter: formatRate, changeDisplay: "bps" },
  { name: "UST 10y", symbol: "UST_10Y", group: "Rates", source: "tesouro", formatter: formatRate, changeDisplay: "bps" },
  { name: "UST 30y", symbol: "UST_30Y", group: "Rates", source: "tesouro", formatter: formatRate, changeDisplay: "bps" },
  { name: "DXY", symbol: "DX-Y.NYB", group: "FX", source: "yahoo", formatter: formatNumber, invertChangeColors: true },
  { name: "MXN", symbol: "MXN=X", group: "FX", source: "yahoo", invertChangeColors: true },
  { name: "JPY", symbol: "JPY=X", group: "FX", source: "yahoo", invertChangeColors: true },
  { name: "ARS", symbol: "ARS=X", group: "FX", source: "yahoo", invertChangeColors: true },
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
const detailSourceEl = document.querySelector("#detail-source");
const zoomSliderEl = document.querySelector("#zoom-slider");
const rangeButtonsEl = document.querySelector("#range-buttons");
const clockCards = Array.from(document.querySelectorAll("[data-clock-zone]"));
const newsBrazilEl = document.querySelector("#news-brazil");
const newsUsEl = document.querySelector("#news-us");
const newsWorldEl = document.querySelector("#news-world");
const topBreakingEl = document.querySelector("#top-breaking");
const topMacroEl = document.querySelector("#top-macro");
const gamesBoxEl = document.querySelector("#games-box");
const gamesStatusEl = document.querySelector("#games-status");
const secondaryDetailPanelEl = document.querySelector("#secondary-detail-panel");
const secondaryDetailGroupEl = document.querySelector("#secondary-detail-group");
const secondaryDetailNameEl = document.querySelector("#secondary-detail-name");
const secondaryDetailSymbolEl = document.querySelector("#secondary-detail-symbol");
const secondaryDetailPriceEl = document.querySelector("#secondary-detail-price");
const secondaryDetailDayEl = document.querySelector("#secondary-detail-day");
const secondaryDetailMonthEl = document.querySelector("#secondary-detail-month");
const secondaryDetailYtdEl = document.querySelector("#secondary-detail-ytd");
const secondaryDetailYearEl = document.querySelector("#secondary-detail-year");
const secondaryDetailWindowEl = document.querySelector("#secondary-detail-window");
const secondaryDetailSourceEl = document.querySelector("#secondary-detail-source");

let latestResults = [];
let selectedSymbol = null;
let previousSelectedSymbol = null;
let selectionHistory = [];
let selectedRange = DEFAULT_RANGE;
let detailChart = null;
let secondaryDetailChart = null;

async function loadData() {
  cardsEl.innerHTML = `<div class="loading">Atualizando watchlist...</div>`;
  renderNewsLoading();
  renderGamesLoading();

  const visibleAssets = assets.filter((asset) => !asset.hidden);
  const yahooAssets = visibleAssets.filter((asset) => asset.source !== "diProxy");
  const diAssets = visibleAssets.filter((asset) => asset.source === "diProxy");
  const tesouroAssets = visibleAssets.filter((asset) => asset.source === "tesouro");

  const [marketResult, newsResult, gamesResult] = await Promise.allSettled([
    fetchMarketPayload(
      yahooAssets.filter((asset) => asset.source === "yahoo").map((asset) => asset.symbol),
      diAssets.map((asset) => asset.symbol),
      tesouroAssets.map((asset) => asset.symbol)
    ),
    fetchNewsPayload(),
    fetchGamesPayload()
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
    if (selectedSymbol) {
      rememberSelection(selectedSymbol);
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

  if (gamesResult.status === "fulfilled") {
    renderGames(gamesResult.value);
  } else {
    renderGamesError(gamesResult.reason);
  }
}

async function fetchMarketPayload(yahooSymbols, diSymbols, tesouroSymbols) {
  if (window.location.protocol === "file:") {
    throw new Error(
      "Abra a pagina pelo arquivo 'Abrir Pulse Terminal.bat' para iniciar o servidor local automaticamente."
    );
  }

  const requests = [
    fetch(`/api/market?symbols=${encodeURIComponent(yahooSymbols.join(","))}`),
    fetch(`/api/di-proxy?symbols=${encodeURIComponent(diSymbols.join(","))}`),
    fetch(`/api/tesouro?symbols=${encodeURIComponent(tesouroSymbols.join(","))}`)
  ];

  const [marketResponse, diResponse, tesouroResponse] = await Promise.all(requests);
  const [marketPayload, diPayload, tesouroPayload] = await Promise.all([
    marketResponse.json(),
    diResponse.json(),
    tesouroResponse.json()
  ]);

  if (!marketResponse.ok) {
    throw new Error(marketPayload.error || "Falha ao consultar a API local.");
  }

  if (!diResponse.ok) {
    throw new Error(diPayload.error || "Falha ao consultar a curva local dos DIs.");
  }

  if (!tesouroResponse.ok) {
    throw new Error(tesouroPayload.error || "Falha ao consultar as taxas do Tesouro.");
  }

  return {
    results: [...marketPayload.results, ...diPayload.results, ...tesouroPayload.results],
    asOf: marketPayload.asOf || diPayload.asOf || tesouroPayload.asOf,
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

async function fetchGamesPayload() {
  const response = await fetch("/api/games");
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Falha ao carregar jogos.");
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
    const groupAssets = assets.filter((asset) => asset.group === groupName && !asset.hidden);
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
  const displayName = result?.data?.shortName || asset.name;

  if (!result || !result.ok) {
    return `
      <button type="button" class="table-row ${isActive ? "is-active" : ""}" data-symbol="${escapeHtml(asset.symbol)}">
        <div class="asset-cell">
          <div class="asset-line">
            <strong class="asset-name">${escapeHtml(displayName)}</strong>
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
          <strong class="asset-name">${escapeHtml(displayName)}</strong>
          ${renderProxyBadge(asset)}
        </div>
        <span class="asset-symbol">${escapeHtml(asset.symbol)}</span>
      </div>
      <div class="spot-cell">
        ${priceFormatter(result.data.regularMarketPrice)}
        <span class="meta">${escapeHtml(result.data.currency || result.data.exchangeName || "Yahoo")}</span>
      </div>
      ${renderChangeCell(result.data.changes.day, asset, "day", result.data)}
      ${renderChangeCell(result.data.changes.month, asset, "month", result.data)}
      ${renderChangeCell(result.data.changes.ytd, asset, "ytd", result.data)}
      ${renderChangeCell(result.data.changes.year, asset, "year", result.data)}
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
  const activeAsset = assets.find((asset) => asset.symbol === selectedSymbol && !asset.hidden);
  const activeResult = latestResults.find((entry) => entry.symbol === selectedSymbol && entry.ok);

  if (!activeAsset || !activeResult) {
    detailEmptyEl.classList.remove("hidden");
    detailContentEl.classList.add("hidden");
    detailStatusEl.textContent = "Selecione um ativo";
    destroyCharts();
    return;
  }

  detailEmptyEl.classList.add("hidden");
  detailContentEl.classList.remove("hidden");
  detailStatusEl.textContent = `${activeAsset.group} | ${activeResult.data.exchangeName || activeResult.data.marketState || "Yahoo"}`;

  renderDetailPanel({
    asset: activeAsset,
    result: activeResult,
    chartKey: "primary",
    groupEl: detailGroupEl,
    nameEl: detailNameEl,
    symbolEl: detailSymbolEl,
    priceEl: detailPriceEl,
    dayEl: detailDayEl,
    monthEl: detailMonthEl,
    ytdEl: detailYtdEl,
    yearEl: detailYearEl,
    windowEl: detailWindowEl,
    sourceEl: detailSourceEl
  });

  const secondarySymbol = selectionHistory.length > 1 ? selectionHistory[selectionHistory.length - 2] : null;
  const secondaryAsset = assets.find((asset) => asset.symbol === secondarySymbol && !asset.hidden);
  const secondaryResult = latestResults.find((entry) => entry.symbol === secondarySymbol && entry.ok);

  if (secondaryAsset && secondaryResult && secondarySymbol !== selectedSymbol) {
    secondaryDetailPanelEl.classList.remove("hidden");
    renderDetailPanel({
      asset: secondaryAsset,
      result: secondaryResult,
      chartKey: "secondary",
      groupEl: secondaryDetailGroupEl,
      nameEl: secondaryDetailNameEl,
      symbolEl: secondaryDetailSymbolEl,
      priceEl: secondaryDetailPriceEl,
      dayEl: secondaryDetailDayEl,
      monthEl: secondaryDetailMonthEl,
      ytdEl: secondaryDetailYtdEl,
      yearEl: secondaryDetailYearEl,
      windowEl: secondaryDetailWindowEl,
      sourceEl: secondaryDetailSourceEl
    });
  } else {
    secondaryDetailPanelEl.classList.add("hidden");
    destroySecondaryChart();
  }
}

function renderDetailError(error) {
  detailEmptyEl.classList.remove("hidden");
  detailContentEl.classList.add("hidden");
  detailStatusEl.textContent = "Sem conexão";
  detailEmptyEl.textContent = `Nao foi possivel carregar o painel de detalhe. ${error.message || ""}`.trim();
  destroyCharts();
}

function renderChart(points, formatter, label) {
  const canvas = document.querySelector("#detail-chart");
  if (!canvas || !points.length) {
    destroyPrimaryChart();
    return;
  }

  destroyPrimaryChart();

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

function renderDetailPanel(config) {
  const { asset, result, chartKey, groupEl, nameEl, symbolEl, priceEl, dayEl, monthEl, ytdEl, yearEl, windowEl, sourceEl } = config;
  const { data } = result;
  const formatter = asset.formatter || inferFormatter(data.currency);
  const filteredPoints = getFilteredPoints(data.points || [], selectedRange, Number(zoomSliderEl.value));
  const firstLabel = filteredPoints[0];
  const lastLabel = filteredPoints[filteredPoints.length - 1];
  const displayName = data.shortName || asset.name;

  groupEl.textContent = asset.group;
  nameEl.innerHTML = `
    <span class="detail-title-line">
      <span>${escapeHtml(displayName)}</span>
      ${renderProxyBadge(asset)}
    </span>
  `;
  symbolEl.textContent = asset.symbol;
  priceEl.textContent = formatter(data.regularMarketPrice);
  setChangeText(dayEl, data.changes.day, asset, "day", data);
  setChangeText(monthEl, data.changes.month, asset, "month", data);
  setChangeText(ytdEl, data.changes.ytd, asset, "ytd", data);
  setChangeText(yearEl, data.changes.year, asset, "year", data);
  windowEl.textContent = firstLabel && lastLabel
    ? `Janela: ${formatPointDate(firstLabel.timestamp)} a ${formatPointDate(lastLabel.timestamp)}`
    : "Janela: --";
  sourceEl.textContent = `Fonte: ${data.exchangeName || data.marketState || "Yahoo Finance"}`;

  if (chartKey === "secondary") {
    renderSecondaryChart(filteredPoints, formatter, displayName);
  } else {
    renderChart(filteredPoints, formatter, displayName);
  }
}

function renderSecondaryChart(points, formatter, label) {
  const canvas = document.querySelector("#secondary-detail-chart");
  if (!canvas || !points.length) {
    destroySecondaryChart();
    return;
  }

  destroySecondaryChart();

  secondaryDetailChart = new Chart(canvas, {
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

function destroyPrimaryChart() {
  if (detailChart) {
    detailChart.destroy();
    detailChart = null;
  }
}

function destroySecondaryChart() {
  if (secondaryDetailChart) {
    secondaryDetailChart.destroy();
    secondaryDetailChart = null;
  }
}

function destroyCharts() {
  destroyPrimaryChart();
  destroySecondaryChart();
}

function renderProxyBadge(asset) {
  if (asset.source !== "diProxy") {
    return "";
  }

  return `<span class="proxy-badge">ANBIMA proxy</span>`;
}

function renderNewsLoading() {
  topBreakingEl.innerHTML = `<div class="news-empty">Carregando breaking news...</div>`;
  topMacroEl.innerHTML = `<div class="news-empty">Carregando manchetes macro...</div>`;
  newsBrazilEl.innerHTML = `<div class="news-empty">Carregando notícias do Brasil...</div>`;
  newsUsEl.innerHTML = `<div class="news-empty">Carregando notícias dos EUA...</div>`;
  newsWorldEl.innerHTML = `<div class="news-empty">Carregando notícias do mundo...</div>`;
}

function renderGamesLoading() {
  gamesStatusEl.textContent = "Atualizando...";
  gamesBoxEl.innerHTML = `<div class="games-empty">Carregando agenda de Palmeiras e Brasil...</div>`;
}

function renderNews(payload) {
  renderTopHeadlines(payload);
  renderNewsColumn(newsBrazilEl, payload.brazil || [], "Sem notícias do Brasil agora.");
  renderNewsColumn(newsUsEl, payload.us || [], "Sem notícias dos EUA agora.");
  renderNewsColumn(newsWorldEl, payload.world || [], "Sem notícias globais agora.");
}

function renderNewsError(error) {
  const message = escapeHtml(error?.message || "Falha ao carregar notícias.");
  topBreakingEl.innerHTML = `<div class="news-empty">${message}</div>`;
  topMacroEl.innerHTML = `<div class="news-empty">${message}</div>`;
  newsBrazilEl.innerHTML = `<div class="news-empty">${message}</div>`;
  newsUsEl.innerHTML = `<div class="news-empty">${message}</div>`;
  newsWorldEl.innerHTML = `<div class="news-empty">${message}</div>`;
}

function renderGames(payload) {
  const sections = [];

  if (Array.isArray(payload.palmeiras) && payload.palmeiras.length) {
    sections.push(payload.palmeiras.map((game) => renderGameItem(game)).join(""));
  }

  if (Array.isArray(payload.brazil) && payload.brazil.length) {
    sections.push(renderGamesSection("Brasil", payload.brazil));
  }

  if (payload.errors?.palmeiras) {
    sections.push(renderGamesErrorBlock(`Palmeiras: ${payload.errors.palmeiras}`));
  }

  if (payload.errors?.brazil) {
    sections.push(renderGamesErrorBlock(`Brasil: ${payload.errors.brazil}`));
  }

  gamesBoxEl.innerHTML = sections.length
    ? sections.join("")
    : `<div class="games-empty">Sem jogos próximos confirmados nas fontes oficiais agora.</div>`;

  const formatted = payload.asOf
    ? new Date(payload.asOf).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "oficial";

  gamesStatusEl.textContent = `Atualizado ${formatted}`;
}

function renderGamesError(error) {
  gamesStatusEl.textContent = "Sem agenda";
  gamesBoxEl.innerHTML = `
    <div class="games-error">
      Não foi possível carregar os próximos jogos.<br />
      ${escapeHtml(error?.message || "Erro desconhecido.")}
    </div>
  `;
}

function renderGamesSection(title, games) {
  return `
    <section class="games-section">
      <div class="games-section-title">${escapeHtml(title)}</div>
      ${games.map((game) => renderGameItem(game)).join("")}
    </section>
  `;
}

function renderGameItem(game) {
  return `
    <article class="game-item">
      <div class="game-title">${escapeHtml(game.label || `${game.team} x ${game.opponent}`)}</div>
      <div class="game-meta">
        <span>${escapeHtml(game.date || "--")}</span>
        <span>${escapeHtml(game.time || "--")}</span>
        <span>${escapeHtml(game.city || game.stadium || "--")}</span>
      </div>
      <div class="game-submeta">${escapeHtml([game.competition, game.stadium].filter(Boolean).join(" | "))}</div>
    </article>
  `;
}

function renderGamesErrorBlock(message) {
  return `<div class="games-error">${escapeHtml(message)}</div>`;
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

function renderTopHeadlines(payload) {
  const mixed = [...(payload.brazil || []), ...(payload.world || [])];
  const enriched = mixed.map((item) => ({
    ...item,
    breakingScore: scoreHeadline(item.title, item.published, "breaking"),
    macroScore: scoreHeadline(item.title, item.published, "macro")
  }));

  const breaking = enriched
    .filter((item) => item.breakingScore > 0)
    .sort((a, b) => b.breakingScore - a.breakingScore)
    .slice(0, 3);

  const macro = enriched
    .filter((item) => item.macroScore > 0)
    .sort((a, b) => b.macroScore - a.macroScore)
    .slice(0, 3);

  topBreakingEl.innerHTML = breaking.length
    ? renderHeadlineItems(breaking)
    : `<div class="news-empty">Sem breaking news agora.</div>`;

  topMacroEl.innerHTML = macro.length
    ? renderHeadlineItems(macro)
    : `<div class="news-empty">Sem manchetes macro agora.</div>`;
}

function renderHeadlineItems(items) {
  return items
    .map(
      (item) => `
        <article class="headline-item">
          <a href="${escapeHtml(item.link)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>
          <span class="headline-meta">${escapeHtml(item.source || "News")} | ${escapeHtml(item.published || "")}</span>
        </article>
      `
    )
    .join("");
}

function scoreHeadline(title, published, mode = "macro") {
  const text = String(title || "").toLowerCase();
  let score = 0;

  const breakingTerms = [
    "war",
    "guerra",
    "trump",
    "attack",
    "ataque",
    "missile",
    "bomb",
    "sanction",
    "strike",
    "ceasefire",
    "tariff",
    "tarifa",
    "breaking"
  ];

  const macroTerms = [
    "fed",
    "china",
    "inflation",
    "inflação",
    "copom",
    "bcb",
    "bc",
    "fiscal",
    "petrobras",
    "vale",
    "oil",
    "petróleo",
    "brazil",
    "brasil"
  ];

  const terms = mode === "breaking" ? breakingTerms : macroTerms;

  for (const term of terms) {
    if (text.includes(term)) {
      score += mode === "breaking" ? 14 : 10;
    }
  }

  if (mode === "breaking" && !breakingTerms.some((term) => text.includes(term))) {
    score -= 15;
  }

  if (mode === "macro" && !macroTerms.some((term) => text.includes(term))) {
    score -= 10;
  }

  score += Math.max(0, 80 - text.length / 2);

  const publishedMs = Date.parse(published || "");
  if (Number.isFinite(publishedMs)) {
    const ageHours = (Date.now() - publishedMs) / (1000 * 60 * 60);
    if (ageHours <= 6) {
      score += 35;
    } else if (ageHours <= 12) {
      score += 24;
    } else if (ageHours <= 24) {
      score += 14;
    } else if (ageHours <= 48) {
      score += 6;
    } else {
      score -= Math.min(30, ageHours / 6);
    }
  }

  return score;
}

function getFilteredPoints(points, range, zoomValue) {
  const rangePoints = applyRange(points, range);
  const ratio = Math.max(0.2, Math.min(1, zoomValue / 100));
  const visibleCount = Math.max(20, Math.floor(rangePoints.length * ratio));
  return rangePoints.slice(-visibleCount);
}

function getClosestPastPoint(points, targetTimestamp) {
  let match = null;

  for (const point of points) {
    if (point.timestamp <= targetTimestamp) {
      match = point;
    } else {
      break;
    }
  }

  return match;
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

function renderChangeCell(value, asset, period, data) {
  const normalized = normalizeChangeValue(value, asset, period, data);
  const state = getChangeState(normalized, asset);
  const content = formatChangeValue(normalized, asset, period);
  return `<div class="change-value ${state}">${content}</div>`;
}

function setChangeText(element, value, asset, period, data) {
  const normalized = normalizeChangeValue(value, asset, period, data);
  const state = getChangeState(normalized, asset);
  const content = formatChangeValue(normalized, asset, period);
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

function formatTnxRate(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return `${(value / 10).toFixed(2)}%`;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value > 100 ? 2 : 4
  }).format(value);
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

function getChangeState(value, asset) {
  if (!Number.isFinite(value)) {
    return "neutral";
  }

  const isInverted = Boolean(asset?.invertChangeColors);

  if (value > 0) {
    return isInverted ? "negative" : "positive";
  }

  if (value < 0) {
    return isInverted ? "positive" : "negative";
  }

  return "neutral";
}

function normalizeChangeValue(value, asset, period, data) {
  if (asset?.changeDisplay === "bps") {
    const points = Array.isArray(data?.points) ? data.points.filter((point) => Number.isFinite(point?.close)) : [];
    if (!points.length) {
      return null;
    }

    const currentPoint = points[points.length - 1];
    let referencePoint = null;

    if (period === "day" && points.length >= 2) {
      referencePoint = points[points.length - 2];
    } else if (period === "month") {
      referencePoint = getClosestPastPoint(points, currentPoint.timestamp - 31 * 24 * 60 * 60);
    } else if (period === "year") {
      referencePoint = getClosestPastPoint(points, currentPoint.timestamp - 366 * 24 * 60 * 60);
    } else if (period === "ytd") {
      const currentYear = new Date(currentPoint.timestamp * 1000).getUTCFullYear();
      const yearStart = Date.UTC(currentYear, 0, 1) / 1000;
      referencePoint = getClosestPastPoint(points, yearStart);
    }

    if (referencePoint && Number.isFinite(referencePoint.close)) {
      return (currentPoint.close - referencePoint.close) * (asset?.bpsMultiplier || 100);
    }

    return null;
  }

  if (Number.isFinite(value)) {
    return value;
  }

  return value;
}

function formatChangeValue(value, asset, period) {
  if (!Number.isFinite(value)) {
    return "--";
  }

  if (asset?.changeDisplay === "bps") {
    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}bp`;
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatPointDate(timestamp) {
  return new Date(timestamp * 1000).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  });
}

function rememberSelection(symbol) {
  if (!symbol) {
    return;
  }

  selectionHistory = selectionHistory.filter((item) => item !== symbol);
  selectionHistory.push(symbol);

  if (selectionHistory.length > 2) {
    selectionHistory = selectionHistory.slice(-2);
  }

  previousSelectedSymbol = selectionHistory.length > 1 ? selectionHistory[0] : null;
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

  if (symbol !== selectedSymbol) {
    previousSelectedSymbol = selectedSymbol;
  }
  selectedSymbol = symbol;
  rememberSelection(symbol);
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
