# Lokaler Demo-Server für den Prototyp (Windows, ohne Installation).
# Start: Doppelklick auf "Demo starten.bat" im Projektordner.
#
# - liefert den Projektordner unter http://localhost:8765/ aus
# - öffnet die App (demo.html) und den Café-Bildschirm (tv-demo.html)
# - Fernseher/Tablet im selben WLAN: http://<IP dieses PCs>:8765/tv-demo.html?bildschirm=haupt
#   Der Bildschirm zeigt dann live, was in der Demo-App am PC eingestellt wird.
# Beenden: Fenster schließen oder Strg+C.
param([int]$Port = 8765, [switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8';
  '.json' = 'application/json; charset=utf-8'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg';
  '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'; '.ico' = 'image/x-icon'; '.webmanifest' = 'application/manifest+json';
  '.mp4' = 'video/mp4'; '.webm' = 'video/webm'; '.txt' = 'text/plain; charset=utf-8'; '.md' = 'text/plain; charset=utf-8';
  '.woff2' = 'font/woff2'; '.pdf' = 'application/pdf'
}
$Relay = [hashtable]::Synchronized(@{})   # Bildschirm-ID -> letzter Stand aus der Demo-App (JSON-Bytes)

# Jede Verbindung läuft in einem eigenen Runspace, damit ein hängender Browser die anderen nicht blockiert.
$Handler = {
  param($client, $Root, $Mime, $Relay)
  function Send-Response($stream, [int]$status, [string]$type, [byte[]]$body) {
    $reason = @{200 = 'OK'; 204 = 'No Content'; 400 = 'Bad Request'; 403 = 'Forbidden'; 404 = 'Not Found'; 405 = 'Method Not Allowed'}[$status]
    $head = "HTTP/1.1 $status $reason`r`nContent-Type: $type`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
    $hb = [System.Text.Encoding]::ASCII.GetBytes($head)
    $stream.Write($hb, 0, $hb.Length)
    if ($body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
    $stream.Flush()
  }
  function Read-Request($stream) {
    $buf = New-Object byte[] 65536
    $ms = New-Object System.IO.MemoryStream
    $headerEnd = -1
    while ($headerEnd -lt 0) {
      $n = $stream.Read($buf, 0, $buf.Length)
      if ($n -le 0) { return $null }
      $ms.Write($buf, 0, $n)
      $all = $ms.ToArray()
      for ($i = [Math]::Max(0, $all.Length - $n - 3); $i -le $all.Length - 4; $i++) {
        if ($all[$i] -eq 13 -and $all[$i + 1] -eq 10 -and $all[$i + 2] -eq 13 -and $all[$i + 3] -eq 10) { $headerEnd = $i; break }
      }
      if ($ms.Length -gt 1048576 -and $headerEnd -lt 0) { return $null }
    }
    $all = $ms.ToArray()
    $lines = [System.Text.Encoding]::ASCII.GetString($all, 0, $headerEnd) -split "`r`n"
    $parts = $lines[0] -split ' '
    $len = 0
    foreach ($l in $lines) { if ($l -match '^Content-Length:\s*(\d+)') { $len = [int]$Matches[1] } }
    if ($len -gt 30MB) { return $null }
    $body = New-Object System.IO.MemoryStream
    $start = $headerEnd + 4
    if ($all.Length -gt $start) { $body.Write($all, $start, $all.Length - $start) }
    while ($body.Length -lt $len) {
      $n = $stream.Read($buf, 0, $buf.Length)
      if ($n -le 0) { break }
      $body.Write($buf, 0, $n)
    }
    return @{ Method = $parts[0]; Path = $parts[1]; Body = $body.ToArray() }
  }
  try {
    $client.ReceiveTimeout = 15000; $client.SendTimeout = 15000
    $stream = $client.GetStream()
    $req = Read-Request $stream
    if ($null -eq $req) { return }
    $path = [System.Uri]::UnescapeDataString(($req.Path -split '\?')[0])
    $empty = New-Object byte[] 0
    # Demo-Kopplung: App schickt den Stand, Bildschirme holen ihn ab
    if ($path -match '^/demo-relay/tv/([A-Za-z0-9_-]+)$') {
      $id = $Matches[1]
      if ($req.Method -eq 'POST') { $Relay[$id] = $req.Body; Send-Response $stream 204 'text/plain' $empty; return }
      if ($Relay.ContainsKey($id)) { Send-Response $stream 200 'application/json; charset=utf-8' $Relay[$id]; return }
      Send-Response $stream 404 'text/plain; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes('Noch keine Demo-App geöffnet')); return
    }
    if ($req.Method -ne 'GET' -and $req.Method -ne 'HEAD') { Send-Response $stream 405 'text/plain' $empty; return }
    if ($path -eq '/') { $path = '/demo.html' }
    $rootFull = [System.IO.Path]::GetFullPath($Root)
    $file = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($rootFull, $path.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)))
    if (-not $file.StartsWith($rootFull)) { Send-Response $stream 403 'text/plain' $empty; return }
    if (-not [System.IO.File]::Exists($file)) { Send-Response $stream 404 'text/plain; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes("Nicht gefunden: $path")); return }
    $type = $Mime[[System.IO.Path]::GetExtension($file).ToLower()]
    if (-not $type) { $type = 'application/octet-stream' }
    Send-Response $stream 200 $type ([System.IO.File]::ReadAllBytes($file))
  } catch { } finally { $client.Close() }
}

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
try { $listener.Start() } catch {
  Write-Host ""
  Write-Host "  Port $Port ist schon belegt. Läuft die Demo bereits in einem anderen Fenster?" -ForegroundColor Yellow
  Write-Host "  Sonst mit anderem Port starten:  powershell -File tools\demo-server.ps1 -Port 8790"
  Read-Host "  Enter zum Schließen"
  exit 1
}

$ips = @()
try { $ips = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) | Where-Object { $_.AddressFamily -eq 'InterNetwork' -and -not $_.ToString().StartsWith('127.') } | ForEach-Object { $_.ToString() } } catch { }

Write-Host ""
Write-Host "  Billardcafé Merzig · Demo läuft" -ForegroundColor Green
Write-Host "  ------------------------------------------------------------"
Write-Host "  App (Spieler/Inhaber/Theke):  http://localhost:$Port/demo.html"
Write-Host "  Café-Bildschirm auf diesem PC: http://localhost:$Port/tv-demo.html?bildschirm=haupt"
foreach ($ip in $ips) { Write-Host "  Fernseher/Tablet im WLAN:      http://${ip}:$Port/tv-demo.html?bildschirm=haupt" -ForegroundColor Cyan }
Write-Host "  (Turnierecke: ?bildschirm=turnier)"
Write-Host ""
Write-Host "  Fragt Windows nach der Firewall: 'Private Netzwerke' erlauben, damit der Fernseher zugreifen kann."
Write-Host "  Beenden: dieses Fenster schließen oder Strg+C."
Write-Host ""

if (-not $NoBrowser) {
  try { Start-Process "http://localhost:$Port/demo.html" } catch { }
  Start-Sleep -Milliseconds 800
  try { Start-Process "http://localhost:$Port/tv-demo.html?bildschirm=haupt" } catch { }
}

$pool = [runspacefactory]::CreateRunspacePool(1, 24)
$pool.Open()
$jobs = New-Object System.Collections.ArrayList
try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    $ps = [powershell]::Create()
    $ps.RunspacePool = $pool
    [void]$ps.AddScript($Handler).AddArgument($client).AddArgument($Root).AddArgument($Mime).AddArgument($Relay)
    [void]$jobs.Add(@{ P = $ps; H = $ps.BeginInvoke() })
    for ($i = $jobs.Count - 1; $i -ge 0; $i--) {
      if ($jobs[$i].H.IsCompleted) { try { $jobs[$i].P.EndInvoke($jobs[$i].H) } catch { }; $jobs[$i].P.Dispose(); $jobs.RemoveAt($i) }
    }
  }
} finally { $listener.Stop(); $pool.Close() }
