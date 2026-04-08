$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8765
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "Pulse Terminal disponivel em http://localhost:$port"
Start-Process "http://localhost:$port/"

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg" = "image/svg+xml"
  ".png" = "image/png"
  ".jpg" = "image/jpeg"
  ".ico" = "image/x-icon"
}

$DiTargets = @{
  "DI27_PROXY" = @{ Label = "DI 27"; Year = 2027 }
  "DI28_PROXY" = @{ Label = "DI 28"; Year = 2028 }
  "DI31_PROXY" = @{ Label = "DI 31"; Year = 2031 }
  "DI36_PROXY" = @{ Label = "DI 36"; Year = 2036 }
}

$NewsFeeds = @{
  brazil = "https://news.google.com/rss/search?q=Brasil+economia+mercados+OR+copom+OR+inflacao+OR+fiscal+when:1d&hl=pt-BR&gl=BR&ceid=BR:pt-419"
  us = "https://news.google.com/rss/search?q=US+markets+economy+fed+OR+tariffs+OR+inflation+when:1d&hl=en-US&gl=US&ceid=US:en"
  world = "https://news.google.com/rss/search?q=world+war+geopolitics+markets+OR+china+OR+oil+when:1d&hl=en-US&gl=US&ceid=US:en"
}

$PalmeirasApiRoot = "https://apiverdao.palmeiras.com.br/wp-json/apiverdao/v1/jogos-mes/"
$PalmeirasCalendarUrl = "https://www.palmeiras.com.br/calendario/"
$FifaGamesUrl = "https://fifaworldcup26.suites.fifa.com/games/"
$TesouroCsvUrl = "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv"
$PalmeirasCityMap = @{
  "allianz parque" = "São Paulo"
  "arena crefisa barueri" = "Barueri"
  "arena fonte nova" = "Salvador"
  "neo química arena" = "São Paulo"
  "olímpico jaime morón león" = "Cartagena"
  "olimpico jaime moron leon" = "Cartagena"
  "cícero de souza marques" = "Bragança Paulista"
  "cicero de souza marques" = "Bragança Paulista"
  "nueva olla" = "Assunção"
}

function Send-Json {
  param(
    [Parameter(Mandatory = $true)] $Response,
    [Parameter(Mandatory = $true)] [int] $StatusCode,
    [Parameter(Mandatory = $true)] $Payload
  )

  $json = $Payload | ConvertTo-Json -Depth 10 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $Response.StatusCode = $StatusCode
  $Response.ContentType = "application/json; charset=utf-8"
  $Response.Headers["Cache-Control"] = "no-store"
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Response.Close()
}

function Send-File {
  param(
    [Parameter(Mandatory = $true)] $Response,
    [Parameter(Mandatory = $true)] [string] $Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    Send-Json -Response $Response -StatusCode 404 -Payload @{ error = "Arquivo nao encontrado." }
    return
  }

  $extension = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
  $contentType = $mimeTypes[$extension]
  if (-not $contentType) {
    $contentType = "application/octet-stream"
  }

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $Response.StatusCode = 200
  $Response.ContentType = $contentType
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Response.Close()
}

function Get-ClosestPastPoint {
  param(
    [Parameter(Mandatory = $true)] $Series,
    [Parameter(Mandatory = $true)] [double] $TargetTimestamp
  )

  $match = $null
  foreach ($point in $Series) {
    if ([double]$point.timestamp -le $TargetTimestamp) {
      $match = $point
    }
    else {
      break
    }
  }

  return $match
}

function Get-PercentChange {
  param(
    [double] $Current,
    [double] $Reference
  )

  if ($Reference -eq 0 -or [double]::IsNaN($Current) -or [double]::IsNaN($Reference)) {
    return $null
  }

  return (($Current / $Reference) - 1) * 100
}

function Get-ShiftedBusinessDate {
  param(
    [Parameter(Mandatory = $true)] [datetime] $Date,
    [Parameter(Mandatory = $true)] [int] $BusinessDays
  )

  $shifted = $Date
  $remaining = [Math]::Abs($BusinessDays)
  $direction = if ($BusinessDays -ge 0) { 1 } else { -1 }

  while ($remaining -gt 0) {
    $shifted = $shifted.AddDays($direction)
    if ($shifted.DayOfWeek -ne [DayOfWeek]::Saturday -and $shifted.DayOfWeek -ne [DayOfWeek]::Sunday) {
      $remaining--
    }
  }

  return $shifted
}

function ConvertFrom-PtBrNumber {
  param(
    [Parameter(Mandatory = $false)] [string] $Value
  )

  $normalized = [string]$Value -replace "\.", "" -replace ",", "."
  $parsed = 0.0
  if ([double]::TryParse($normalized, [ref]$parsed)) {
    return $parsed
  }

  return $null
}

function ConvertFrom-PtBrDate {
  param(
    [Parameter(Mandatory = $false)] [string] $Value
  )

  try {
    return [datetime]::ParseExact($Value, "dd/MM/yyyy", $null)
  }
  catch {
    return $null
  }
}

function Get-YahooChart {
  param(
    [Parameter(Mandatory = $true)] [string] $Symbol
  )

  $encodedSymbol = [System.Uri]::EscapeDataString($Symbol)
  $headers = @{
    "User-Agent" = "Mozilla/5.0"
    "Accept" = "application/json"
  }

  $result = $null
  $sparkUrl = "https://query1.finance.yahoo.com/v7/finance/spark?symbols=$encodedSymbol&range=1y&interval=1d"

  try {
    $sparkResponse = Invoke-RestMethod -Uri $sparkUrl -Headers $headers -Method Get
    if ($sparkResponse.spark.result.Count -gt 0) {
      $result = $sparkResponse.spark.result[0].response[0]
    }
  }
  catch {
  }

  if (-not $result) {
    $chartUrl = "https://query1.finance.yahoo.com/v8/finance/chart/$Symbol?range=1y&interval=1d&includePrePost=false&events=div%2Csplits&lang=en-US&region=US"
    $chartResponse = Invoke-RestMethod -Uri $chartUrl -Headers $headers -Method Get
    $result = $chartResponse.chart.result[0]
  }

  if (-not $result) {
    throw "Sem dados para $Symbol."
  }

  $closes = $result.indicators.quote[0].close
  $timestamps = $result.timestamp
  $series = @()

  for ($i = 0; $i -lt $timestamps.Count; $i++) {
    $timestamp = $timestamps[$i]
    $close = $closes[$i]

    if ($null -ne $timestamp -and $null -ne $close) {
      $series += @{
        timestamp = [double]$timestamp
        close = [double]$close
      }
    }
  }

  if ($series.Count -eq 0) {
    throw "Historico vazio para $Symbol."
  }

  $meta = $result.meta
  $currentPrice = if ($null -ne $meta.regularMarketPrice) { [double]$meta.regularMarketPrice } else { [double]$series[-1].close }
  $currentTimestamp = if ($null -ne $meta.regularMarketTime) { [double]$meta.regularMarketTime } else { [double]$series[-1].timestamp }
  $oneDayReference = Get-ClosestPastPoint -Series $series -TargetTimestamp ($currentTimestamp - 2 * 24 * 60 * 60)
  $oneMonthReference = Get-ClosestPastPoint -Series $series -TargetTimestamp ($currentTimestamp - 31 * 24 * 60 * 60)
  $oneYearReference = Get-ClosestPastPoint -Series $series -TargetTimestamp ($currentTimestamp - 366 * 24 * 60 * 60)
  $yearStartTimestamp = [Math]::Floor(([DateTimeOffset]::new([DateTime]::new((Get-Date -Date ([DateTimeOffset]::FromUnixTimeSeconds([int64]$currentTimestamp).UtcDateTime)).Year, 1, 1, 0, 0, 0, [DateTimeKind]::Utc))).ToUnixTimeSeconds())
  $ytdReference = Get-ClosestPastPoint -Series $series -TargetTimestamp $yearStartTimestamp

  return @{
    symbol = $Symbol
    currency = $meta.currency
    exchangeName = $meta.exchangeName
    marketState = $meta.marketState
    regularMarketPrice = $currentPrice
    regularMarketTime = $currentTimestamp
    points = $series
    changes = @{
      day = if ($oneDayReference) { Get-PercentChange -Current $currentPrice -Reference ([double]$oneDayReference.close) } elseif ($null -ne $meta.previousClose) { Get-PercentChange -Current $currentPrice -Reference ([double]$meta.previousClose) } else { $null }
      month = if ($oneMonthReference) { Get-PercentChange -Current $currentPrice -Reference ([double]$oneMonthReference.close) } else { $null }
      ytd = if ($ytdReference) { Get-PercentChange -Current $currentPrice -Reference ([double]$ytdReference.close) } else { $null }
      year = if ($oneYearReference) { Get-PercentChange -Current $currentPrice -Reference ([double]$oneYearReference.close) } else { $null }
    }
  }
}

function Get-TesouroPrefixado {
  $response = Invoke-WebRequest -Uri $TesouroCsvUrl -Headers @{ "User-Agent" = "Mozilla/5.0" } -Method Get -UseBasicParsing
  $lines = @($response.Content -split "`r?`n" | Where-Object { $_.Trim() })
  if ($lines.Count -lt 2) {
    throw "Arquivo do Tesouro veio vazio."
  }

  $rows = @()
  foreach ($line in $lines[1..($lines.Count - 1)]) {
    $parts = $line.Split(";")
    if ($parts.Count -lt 8) {
      continue
    }

    $tipo = [string]$parts[0]
    $vencimentoRaw = [string]$parts[1]
    $dataBaseRaw = [string]$parts[2]
    $taxaCompra = ConvertFrom-PtBrNumber -Value ([string]$parts[3])
    $vencimento = ConvertFrom-PtBrDate -Value $vencimentoRaw
    $dataBase = ConvertFrom-PtBrDate -Value $dataBaseRaw

    if ($tipo -ne "Tesouro Prefixado" -or $null -eq $vencimento -or $null -eq $dataBase -or $null -eq $taxaCompra) {
      continue
    }

    $rows += @{
      tipo = $tipo
      vencimentoRaw = $vencimentoRaw
      dataBaseRaw = $dataBaseRaw
      taxaCompra = [double]$taxaCompra
      vencimento = $vencimento
      dataBase = $dataBase
    }
  }

  if ($rows.Count -eq 0) {
    throw "Sem dados de Tesouro Prefixado no arquivo oficial."
  }

  $latestBaseDate = ($rows | Sort-Object dataBase -Descending | Select-Object -First 1).dataBase
  $currentCandidates = @(
    $rows |
      Where-Object { $_.dataBase -eq $latestBaseDate -and $_.vencimento -gt $latestBaseDate } |
      Sort-Object vencimento
  )

  if ($currentCandidates.Count -eq 0) {
    throw "Nao foi possivel localizar um Tesouro Prefixado vigente na data-base atual."
  }

  $selected = $currentCandidates[0]
  $series = @(
    $rows |
      Where-Object { $_.vencimentoRaw -eq $selected.vencimentoRaw } |
      Sort-Object dataBase |
      ForEach-Object {
        @{
          timestamp = [Math]::Floor(([DateTimeOffset]$_.dataBase).ToUnixTimeSeconds())
          close = [double]$_.taxaCompra
        }
      }
  )

  $currentPrice = [double]$selected.taxaCompra
  $currentTimestamp = [Math]::Floor(([DateTimeOffset]$latestBaseDate).ToUnixTimeSeconds())
  $oneDayReference = Get-ClosestPastPoint -Series $series -TargetTimestamp ($currentTimestamp - 2 * 24 * 60 * 60)
  $oneMonthReference = Get-ClosestPastPoint -Series $series -TargetTimestamp ($currentTimestamp - 31 * 24 * 60 * 60)
  $oneYearReference = Get-ClosestPastPoint -Series $series -TargetTimestamp ($currentTimestamp - 366 * 24 * 60 * 60)
  $ytdStart = [Math]::Floor(([DateTimeOffset]::new([datetime]::new($latestBaseDate.Year, 1, 1, 0, 0, 0, [DateTimeKind]::Unspecified))).ToUnixTimeSeconds())
  $ytdReference = Get-ClosestPastPoint -Series $series -TargetTimestamp $ytdStart

  return @{
    symbol = "TESOURO_PREFIXADO"
    currency = "%"
    exchangeName = "Tesouro Prefixado $($selected.vencimentoRaw)"
    shortName = "Tesouro Prefixado $($selected.vencimentoRaw)"
    marketState = "Tesouro Transparente"
    regularMarketPrice = $currentPrice
    regularMarketTime = $currentTimestamp
    points = $series
    changes = @{
      day = if ($oneDayReference) { Get-PercentChange -Current $currentPrice -Reference ([double]$oneDayReference.close) } else { $null }
      month = if ($oneMonthReference) { Get-PercentChange -Current $currentPrice -Reference ([double]$oneMonthReference.close) } else { $null }
      ytd = if ($ytdReference) { Get-PercentChange -Current $currentPrice -Reference ([double]$ytdReference.close) } else { $null }
      year = if ($oneYearReference) { Get-PercentChange -Current $currentPrice -Reference ([double]$oneYearReference.close) } else { $null }
    }
  }
}

function Get-BusinessDaysProxy {
  param(
    [Parameter(Mandatory = $true)] [datetime] $ReferenceDate,
    [Parameter(Mandatory = $true)] [datetime] $TargetDate
  )

  $days = ($TargetDate - $ReferenceDate).TotalDays
  if ($days -le 0) {
    return 1
  }

  return [Math]::Round($days * 252 / 365.25)
}

function Get-InterpolatedRate {
  param(
    [Parameter(Mandatory = $true)] $Rows,
    [Parameter(Mandatory = $true)] [double] $TargetVertex
  )

  $sorted = $Rows | Sort-Object vertex
  $lower = $sorted | Where-Object { $_.vertex -le $TargetVertex } | Select-Object -Last 1
  $upper = $sorted | Where-Object { $_.vertex -ge $TargetVertex } | Select-Object -First 1

  if (-not $lower -and -not $upper) {
    return $null
  }

  if (-not $lower) {
    return [double]$upper.rate
  }

  if (-not $upper) {
    return [double]$lower.rate
  }

  if ([double]$lower.vertex -eq [double]$upper.vertex) {
    return [double]$lower.rate
  }

  $weight = ($TargetVertex - [double]$lower.vertex) / ([double]$upper.vertex - [double]$lower.vertex)
  return [double]$lower.rate + ($weight * ([double]$upper.rate - [double]$lower.rate))
}

function Get-AnbimaDiProxy {
  param(
    [Parameter(Mandatory = $true)] [string[]] $Symbols
  )

  $headers = @{
    "User-Agent" = "Mozilla/5.0"
    "Accept" = "text/html,application/xhtml+xml"
  }

  $html = Invoke-WebRequest -Uri "https://www.anbima.com.br/informacoes/curvas-intradiarias/CIntra.asp" -Headers $headers -Method Get -UseBasicParsing
  $content = $html.Content

  $dateMatch = [regex]::Match($content, "<th colspan='3' align='center' width='20%'>(\d{2}/\d{2}/\d{4})</th>")
  if (-not $dateMatch.Success) {
    throw "Nao foi possivel identificar a data de referencia da curva ANBIMA."
  }

  $referenceDate = [datetime]::ParseExact($dateMatch.Groups[1].Value, "dd/MM/yyyy", $null)
  $startIndex = $content.IndexOf("ETTJ PREFIXADOS (%a.a./252)")
  if ($startIndex -lt 0) {
    throw "Nao foi possivel localizar a tabela ETTJ PRE da ANBIMA."
  }

  $subContent = $content.Substring($startIndex)
  $endIndex = $subContent.IndexOf("</table>")
  if ($endIndex -gt 0) {
    $subContent = $subContent.Substring(0, $endIndex)
  }

  $matches = [regex]::Matches($subContent, "<td align='center'>\s*([0-9]+(?:,[0-9]+)?)\s*</td>")
  if ($matches.Count -lt 6) {
    throw "Nao foi possivel extrair os vertices da curva ANBIMA."
  }

  $rows = @()
  for ($i = 0; $i -le $matches.Count - 3; $i += 3) {
    $vertex = [double]($matches[$i].Groups[1].Value -replace ",", ".")
    $priorRate = [double]($matches[$i + 1].Groups[1].Value -replace ",", ".")
    $rate = [double]($matches[$i + 2].Groups[1].Value -replace ",", ".")
    $rows += @{ vertex = $vertex; priorRate = $priorRate; rate = $rate }
  }

  $currentTimestamp = [DateTimeOffset]::new($referenceDate.ToUniversalTime()).ToUnixTimeSeconds()
  $previousReferenceDate = Get-ShiftedBusinessDate -Date $referenceDate -BusinessDays -1
  $previousTimestamp = [DateTimeOffset]::new($previousReferenceDate.ToUniversalTime()).ToUnixTimeSeconds()
  $results = @()
  foreach ($symbol in $Symbols) {
    if (-not $DiTargets.ContainsKey($symbol)) {
      $results += @{ ok = $false; symbol = $symbol; error = "Proxy DI nao configurado." }
      continue
    }

    $targetYear = [int]$DiTargets[$symbol].Year
    $targetDate = Get-Date -Date "01/02/$targetYear"
    $targetVertex = Get-BusinessDaysProxy -ReferenceDate $referenceDate -TargetDate $targetDate
    $rate = Get-InterpolatedRate -Rows $rows -TargetVertex $targetVertex
    $previousRows = @($rows | Where-Object { $null -ne $_.priorRate } | ForEach-Object { @{ vertex = $_.vertex; rate = $_.priorRate } })
    $previousRate = Get-InterpolatedRate -Rows $previousRows -TargetVertex $targetVertex

    if ($null -eq $rate) {
      $results += @{ ok = $false; symbol = $symbol; error = "Nao foi possivel interpolar a curva ANBIMA." }
      continue
    }

    $previousClose = if ($null -ne $previousRate) { [double]$previousRate } else { [double]$rate }
    $results += @{
      ok = $true
      symbol = $symbol
      data = @{
        symbol = $symbol
        currency = "%"
        exchangeName = "ANBIMA ETTJ PRE (proxy)"
        marketState = "Rates"
        regularMarketPrice = [Math]::Round($rate, 4)
        regularMarketTime = $currentTimestamp
        points = @(
          @{ timestamp = $previousTimestamp; close = [Math]::Round($previousClose, 4) },
          @{ timestamp = $currentTimestamp; close = [Math]::Round($rate, 4) }
        )
        changes = @{
          day = if ($null -ne $previousRate) { Get-PercentChange -Current ([double]$rate) -Reference ([double]$previousRate) } else { $null }
          month = $null
          ytd = $null
          year = $null
        }
      }
    }
  }

  return $results
}

function Get-NewsFeedItems {
  param(
    [Parameter(Mandatory = $true)] [string] $Url
  )

  $response = Invoke-WebRequest -Uri $Url -Headers @{ "User-Agent" = "Mozilla/5.0" } -Method Get -UseBasicParsing
  $xml = [xml]$response.Content
  $items = @()

  foreach ($item in @($xml.rss.channel.item) | Select-Object -First 6) {
    $source = ""
    if ($item.source) {
      $source = [string]$item.source.'#text'
    }

    $items += @{
      title = [string]$item.title
      link = [string]$item.link
      published = [string]$item.pubDate
      source = $source
    }
  }

  return @($items | Sort-Object {
    try { [DateTime]::Parse($_.published) } catch { [DateTime]::MinValue }
  } -Descending)
}

function Normalize-Text {
  param(
    [Parameter(Mandatory = $false)] [string] $Value
  )

  if ($null -eq $Value) {
    return ""
  }

  return ($Value `
    -replace "<[^>]+>", " " `
    -replace "&nbsp;", " " `
    -replace "&amp;", "&" `
    -replace "&quot;", '"' `
    -replace "&#39;", "'" `
    -replace "\s+", " ").Trim()
}

function Get-SlugKey {
  param(
    [Parameter(Mandatory = $true)] [string] $Value
  )

  $normalized = Normalize-Text -Value $Value
  $decomposed = $normalized.Normalize([Text.NormalizationForm]::FormD)
  $builder = New-Object System.Text.StringBuilder

  foreach ($char in $decomposed.ToCharArray()) {
    $category = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($char)
    if ($category -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$builder.Append($char)
    }
  }

  return $builder.ToString().ToLowerInvariant()
}

function Get-MonthReferences {
  param(
    [int] $Count = 3
  )

  $refs = @()
  $today = Get-Date

  for ($offset = 0; $offset -lt $Count; $offset++) {
    $cursor = Get-Date -Year $today.Year -Month $today.Month -Day 1
    $cursor = $cursor.AddMonths($offset)
    $refs += @{
      year = $cursor.Year
      month = $cursor.Month
    }
  }

  return $refs
}

function Get-MatchTimestamp {
  param(
    [Parameter(Mandatory = $true)] [int] $Year,
    [Parameter(Mandatory = $true)] [string] $DateLabel,
    [Parameter(Mandatory = $false)] [string] $TimeLabel
  )

  $parts = $DateLabel.Split("/")
  if ($parts.Count -lt 2) {
    return $null
  }

  $day = [int]$parts[0]
  $month = [int]$parts[1]
  $sourceTime = if ([string]::IsNullOrWhiteSpace($TimeLabel)) { "00:00" } else { $TimeLabel }
  $cleanTime = $sourceTime -replace "[Hh]", ":"
  $timeParts = $cleanTime.Split(":")
  if ($timeParts.Count -lt 2) {
    return $null
  }

  $hour = [int]$timeParts[0]
  $minute = [int]$timeParts[1]
  return (Get-Date -Year $Year -Month $month -Day $day -Hour $hour -Minute $minute -Second 0).Ticks
}

function Format-DateLabel {
  param(
    [Parameter(Mandatory = $true)] [datetime] $Date
  )

  return $Date.ToString("dd/MM/yyyy")
}

function Format-TimeLabel {
  param(
    [Parameter(Mandatory = $true)] [datetime] $Date
  )

  return $Date.ToString("HH:mm")
}

function Resolve-PalmeirasCity {
  param(
    [Parameter(Mandatory = $false)] [string] $Stadium
  )

  $key = Get-SlugKey -Value $Stadium
  foreach ($needle in $PalmeirasCityMap.Keys) {
    if ($key.Contains($needle)) {
      return $PalmeirasCityMap[$needle]
    }
  }

  return Normalize-Text -Value $Stadium
}

function Get-PalmeirasGames {
  $refs = Get-MonthReferences -Count 3
  $games = @()
  $headers = @{ "User-Agent" = "Mozilla/5.0" }

  foreach ($ref in $refs) {
    $url = "$PalmeirasApiRoot?mes=$($ref.month)&ano=$($ref.year)"
    $response = Invoke-WebRequest -Uri $url -Headers $headers -Method Get -UseBasicParsing
    $payload = $null

    try {
      $payload = $response.Content | ConvertFrom-Json
    }
    catch {
      continue
    }

    foreach ($game in @($payload.jogos)) {
      $rawTime = if ([string]::IsNullOrWhiteSpace([string]$game.hora1)) { [string]$game.hora } else { [string]$game.hora1 }
      $ticks = Get-MatchTimestamp -Year $ref.year -DateLabel ([string]$game.data_jogo) -TimeLabel $rawTime
      if ($null -eq $ticks) {
        continue
      }

      $date = [datetime]::new($ticks)
      if ($date -lt (Get-Date)) {
        continue
      }

      $home = Normalize-Text -Value ([string]$game.time_casa)
      $away = Normalize-Text -Value ([string]$game.time_visitante)
      $opponent = if ((Get-SlugKey -Value $home) -eq "palmeiras") { $away } else { $home }

      $games += @{
        timestamp = $ticks
        label = "Palmeiras x $opponent"
        team = "Palmeiras"
        opponent = $opponent
        date = Format-DateLabel -Date $date
        time = (Normalize-Text -Value $rawTime) -replace "[Hh]", ":"
        city = Resolve-PalmeirasCity -Stadium ([string]$game.estadio)
        stadium = Normalize-Text -Value ([string]$game.estadio)
        competition = Normalize-Text -Value ([string]$game.campeonato)
        source = "Palmeiras oficial"
        link = $PalmeirasCalendarUrl
      }
    }
  }

  return @($games | Sort-Object timestamp | Select-Object -First 2)
}

function Parse-FifaStartDate {
  param(
    [Parameter(Mandatory = $true)] [string] $Value
  )

  $match = [regex]::Match($Value, "^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})")
  if (-not $match.Success) {
    return $null
  }

  return Get-Date -Year ([int]$match.Groups[1].Value) -Month ([int]$match.Groups[2].Value) -Day ([int]$match.Groups[3].Value) -Hour ([int]$match.Groups[4].Value) -Minute ([int]$match.Groups[5].Value) -Second 0
}

function Get-BrazilGames {
  if ((Get-Date).Month -lt 6) {
    return @()
  }

  $response = Invoke-WebRequest -Uri $FifaGamesUrl -Headers @{ "User-Agent" = "Mozilla/5.0" } -Method Get -UseBasicParsing
  $matches = [regex]::Matches($response.Content, '<script type="application/ld\+json">(\{[\s\S]*?\})</script>')
  $games = @()

  foreach ($match in $matches) {
    try {
      $entry = $match.Groups[1].Value | ConvertFrom-Json
    }
    catch {
      continue
    }

    if ($entry.'@type' -ne "Event" -or -not [string]$entry.name -or $entry.name -notmatch "Brazil") {
      continue
    }

    $date = Parse-FifaStartDate -Value ([string]$entry.startDate)
    if ($null -eq $date -or $date -lt (Get-Date)) {
      continue
    }

    $parts = (Normalize-Text -Value ([string]$entry.name)) -split "\s+vs\.\s+"
    $left = if ($parts.Count -ge 1) { $parts[0] } else { "" }
    $right = if ($parts.Count -ge 2) { $parts[1] } else { "" }
    $opponent = if ((Get-SlugKey -Value $left) -eq "brazil") { $right } elseif ((Get-SlugKey -Value $right) -eq "brazil") { $left } else { Normalize-Text -Value ([string]$entry.name) }

    $games += @{
      timestamp = $date.Ticks
      label = "Brasil x $opponent"
      team = "Brasil"
      opponent = $opponent
      date = Format-DateLabel -Date $date
      time = Format-TimeLabel -Date $date
      city = Normalize-Text -Value ([string]$entry.location.address.addressLocality)
      stadium = Normalize-Text -Value ([string]$entry.location.name)
      competition = "Copa do Mundo 2026"
      source = "FIFA oficial"
      link = $FifaGamesUrl
    }
  }

  return @($games | Sort-Object timestamp | Select-Object -First 3)
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    try {
      $path = $request.Url.AbsolutePath

      if ($path -eq "/api/news") {
        Send-Json -Response $response -StatusCode 200 -Payload @{
          brazil = Get-NewsFeedItems -Url $NewsFeeds.brazil
          us = Get-NewsFeedItems -Url $NewsFeeds.us
          world = Get-NewsFeedItems -Url $NewsFeeds.world
          asOf = [DateTime]::UtcNow.ToString("o")
        }
        continue
      }

      if ($path -eq "/api/games") {
        $errors = @{}
        $palmeiras = @()
        $brazil = @()

        try {
          $palmeiras = Get-PalmeirasGames
        }
        catch {
          $errors.palmeiras = $_.Exception.Message
        }

        try {
          $brazil = Get-BrazilGames
        }
        catch {
          $errors.brazil = $_.Exception.Message
        }

        Send-Json -Response $response -StatusCode 200 -Payload @{
          palmeiras = $palmeiras
          brazil = $brazil
          errors = $errors
          asOf = [DateTime]::UtcNow.ToString("o")
          sources = @{
            palmeiras = $PalmeirasCalendarUrl
            brazil = $FifaGamesUrl
          }
        }
        continue
      }

      if ($path -eq "/api/di-proxy") {
        $symbolsParam = $request.QueryString["symbols"]
        if (-not $symbolsParam) {
          Send-Json -Response $response -StatusCode 400 -Payload @{ error = "Informe ao menos um simbolo DI." }
          continue
        }

        $symbols = $symbolsParam.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ }
        $results = Get-AnbimaDiProxy -Symbols $symbols
        Send-Json -Response $response -StatusCode 200 -Payload @{
          results = $results
          asOf = [DateTime]::UtcNow.ToString("o")
        }
        continue
      }

      if ($path -eq "/api/tesouro") {
        $symbolsParam = $request.QueryString["symbols"]
        if (-not $symbolsParam) {
          Send-Json -Response $response -StatusCode 400 -Payload @{ error = "Informe ao menos um simbolo do Tesouro." }
          continue
        }

        $symbols = $symbolsParam.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ }
        $results = @()

        foreach ($symbol in $symbols) {
          if ($symbol -ne "TESOURO_PREFIXADO") {
            $results += @{ ok = $false; symbol = $symbol; error = "Ativo do Tesouro nao configurado." }
            continue
          }

          try {
            $data = Get-TesouroPrefixado
            $results += @{ ok = $true; symbol = $symbol; data = $data }
          }
          catch {
            $results += @{ ok = $false; symbol = $symbol; error = $_.Exception.Message }
          }
        }

        Send-Json -Response $response -StatusCode 200 -Payload @{
          results = $results
          asOf = [DateTime]::UtcNow.ToString("o")
        }
        continue
      }

      if ($path -eq "/api/market") {
        $symbolsParam = $request.QueryString["symbols"]
        if (-not $symbolsParam) {
          Send-Json -Response $response -StatusCode 400 -Payload @{ error = "Informe ao menos um simbolo." }
          continue
        }

        $symbols = $symbolsParam.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ }
        $results = @()

        foreach ($symbol in $symbols) {
          try {
            $data = Get-YahooChart -Symbol $symbol
            $results += @{ ok = $true; symbol = $symbol; data = $data }
          }
          catch {
            $results += @{ ok = $false; symbol = $symbol; error = $_.Exception.Message }
          }
        }

        Send-Json -Response $response -StatusCode 200 -Payload @{
          results = $results
          asOf = [DateTime]::UtcNow.ToString("o")
        }
        continue
      }

      $relativePath = if ($path -eq "/") { "index.html" } else { $path.TrimStart("/") }
      $safePath = [System.IO.Path]::GetFullPath((Join-Path $root $relativePath))

      if (-not $safePath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
        Send-Json -Response $response -StatusCode 403 -Payload @{ error = "Acesso negado." }
        continue
      }

      Send-File -Response $response -Path $safePath
    }
    catch {
      try {
        if ($response.OutputStream.CanWrite) {
          Send-Json -Response $response -StatusCode 500 -Payload @{ error = $_.Exception.Message }
        }
      }
      catch {
      }
    }
  }
}
finally {
  if ($listener.IsListening) {
    $listener.Stop()
  }
}
