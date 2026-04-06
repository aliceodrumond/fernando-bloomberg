const PALMEIRAS_API_ROOT = "https://apiverdao.palmeiras.com.br/wp-json/apiverdao/v1/jogos-mes/";
const PALMEIRAS_CALENDAR_URL = "https://www.palmeiras.com.br/calendario/";
const FIFA_GAMES_URL = "https://fifaworldcup26.suites.fifa.com/games/";

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Accept: "application/json,text/html,application/xhtml+xml"
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

function normalizeText(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
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
    refs.push({
      year: cursor.getFullYear(),
      month: cursor.getMonth() + 1
    });
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

async function fetchPalmeirasGames() {
  const refs = buildMonthRefs(3);
  const responses = await Promise.all(
    refs.map(async ({ month, year }) => {
      const url = `${PALMEIRAS_API_ROOT}?mes=${month}&ano=${year}`;
      const response = await fetch(url, { headers: DEFAULT_HEADERS });

      if (!response.ok) {
        throw new Error(`Palmeiras respondeu com status ${response.status}.`);
      }

      const payload = await response.json();
      return { month, year, games: payload?.jogos || [] };
    })
  );

  const now = Date.now();
  const upcoming = responses
    .flatMap(({ year, games }) =>
      games.map((game) => {
        const timestamp = parseMatchTimestamp(year, game.data_jogo, game.hora1 || game.hora);
        return {
          timestamp,
          label: buildPalmeirasLabel(game.time_casa, game.time_visitante),
          team: "Palmeiras",
          opponent: toSlugKey(game.time_casa) === "palmeiras"
            ? normalizeText(game.time_visitante)
            : normalizeText(game.time_casa),
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
    .filter((game) => Number.isFinite(game.timestamp))
    .filter((game) => game.timestamp >= now)
    .sort((a, b) => a.timestamp - b.timestamp);

  return upcoming.slice(0, 2);
}

async function fetchBrazilGames() {
  const now = new Date();
  if (now.getMonth() < 5) {
    return [];
  }

  const response = await fetch(FIFA_GAMES_URL, { headers: DEFAULT_HEADERS });
  if (!response.ok) {
    throw new Error(`FIFA respondeu com status ${response.status}.`);
  }

  const html = await response.text();
  const matches = [...html.matchAll(/<script type="application\/ld\+json">(\{[\s\S]*?\})<\/script>/g)];
  const nowTimestamp = Date.now();

  const games = matches
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
      return {
        timestamp: date ? date.getTime() : Number.NaN,
        label: buildBrazilLabel(entry.name),
        team: "Brasil",
        opponent: buildBrazilLabel(entry.name).replace(/^Brasil x /, ""),
        date: date ? formatDateLabel(date) : "",
        time: date ? formatTimeLabel(date) : "",
        city: normalizeText(entry.location?.address?.addressLocality || ""),
        stadium: normalizeText(entry.location?.name || ""),
        competition: "Copa do Mundo 2026",
        source: "FIFA oficial",
        link: FIFA_GAMES_URL
      };
    })
    .filter((game) => Number.isFinite(game.timestamp))
    .filter((game) => game.timestamp >= nowTimestamp)
    .sort((a, b) => a.timestamp - b.timestamp);

  return games.slice(0, 3);
}

module.exports = async function handler(request, response) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=1800");

  if (request.method !== "GET") {
    response.status(405).json({ error: "Metodo nao permitido." });
    return;
  }

  const errors = {};
  const [palmeirasResult, brazilResult] = await Promise.allSettled([
    fetchPalmeirasGames(),
    fetchBrazilGames()
  ]);

  const palmeiras = palmeirasResult.status === "fulfilled" ? palmeirasResult.value : [];
  const brazil = brazilResult.status === "fulfilled" ? brazilResult.value : [];

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

  response.status(200).json({
    palmeiras,
    brazil,
    errors,
    asOf: new Date().toISOString(),
    sources: {
      palmeiras: PALMEIRAS_CALENDAR_URL,
      brazil: FIFA_GAMES_URL
    }
  });
};
