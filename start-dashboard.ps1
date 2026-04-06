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
    $rate = [double]($matches[$i + 2].Groups[1].Value -replace ",", ".")
    $rows += @{ vertex = $vertex; rate = $rate }
  }

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

    if ($null -eq $rate) {
      $results += @{ ok = $false; symbol = $symbol; error = "Nao foi possivel interpolar a curva ANBIMA." }
      continue
    }

    $pointNow = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $results += @{
      ok = $true
      symbol = $symbol
      data = @{
        symbol = $symbol
        currency = "%"
        exchangeName = "ANBIMA ETTJ PRE (proxy)"
        marketState = "Rates"
        regularMarketPrice = [Math]::Round($rate, 4)
        regularMarketTime = $pointNow
        points = @(
          @{ timestamp = $pointNow - 86400; close = [Math]::Round($rate, 4) },
          @{ timestamp = $pointNow; close = [Math]::Round($rate, 4) }
        )
        changes = @{
          day = $null
          month = $null
          ytd = $null
          year = $null
        }
      }
    }
  }

  return $results
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    try {
      $path = $request.Url.AbsolutePath

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
