$ErrorActionPreference = "Stop"
$root = "D:\nextjs\web_novel"
$cfExe = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (-not (Test-Path $cfExe)) { $cfExe = "C:\Program Files\cloudflared\cloudflared.exe" }
$caddyExe = "$env:LOCALAPPDATA\Microsoft\WinGet\Links\caddy.exe"
if (-not (Test-Path $caddyExe)) {
    $caddyExe = Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter "caddy.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $caddyExe -or -not (Test-Path $caddyExe)) {
    throw "Khong tim thay caddy.exe. Cai Caddy bang winget roi chay lai script."
}

Write-Host "1. Dang mo Cloudflare Tunnel..." -ForegroundColor Cyan
$cfLog = "$env:TEMP\cf-tunnel.log"
if (Test-Path $cfLog) { Remove-Item $cfLog -Force }
$cfProc = Start-Process -FilePath $cfExe -ArgumentList "tunnel --url http://127.0.0.1:8080 --logfile $cfLog" -PassThru -WindowStyle Minimized

$publicUrl = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Path $cfLog) {
        $match = Select-String -Path $cfLog -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" | Select-Object -First 1
        if ($match) {
            $publicUrl = $match.Matches[0].Value
            break
        }
    }
}

if (-not $publicUrl) {
    Write-Host "Khong lay duoc link Cloudflare Tunnel. Kiem tra lai ket noi mang!" -ForegroundColor Red
    exit 1
}
Write-Host "   -> Link HTTPS cong khai: $publicUrl" -ForegroundColor Green

Write-Host "2. Dang cap nhat .env..." -ForegroundColor Cyan
foreach ($envFile in @("$root\.env", "$root\socket-server\.env")) {
    if (Test-Path $envFile) {
        $content = Get-Content $envFile -Raw
        $content = $content -replace 'NEXT_PUBLIC_SOCKET_SERVER_URL=.*', "NEXT_PUBLIC_SOCKET_SERVER_URL=`"$publicUrl`""
        $content = $content -replace 'ALLOWED_ORIGINS=.*', "ALLOWED_ORIGINS=`"$publicUrl`""
        $content = $content -replace 'COOKIE_SECURE=.*', 'COOKIE_SECURE="true"'
        Set-Content -Path $envFile -Value $content -NoNewline
    }
}

Write-Host "3. Dang build Next.js Production (bo qua neu khong sua code)..." -ForegroundColor Cyan
Set-Location $root
npm run build

Write-Host "4. Dang khoi dong Socket Server, Next.js va Caddy..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\socket-server'; $env:NODE_ENV='production'; $env:PORT='3001'; npm run start" -WindowStyle Minimized
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; $env:NODE_ENV='production'; $env:PORT='3000'; npm run start" -WindowStyle Minimized
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; & '$caddyExe' run --config Caddyfile" -WindowStyle Minimized

Start-Sleep -Seconds 3
Write-Host "`nHOAN TAT! Dang mo trinh duyet tai: $publicUrl" -ForegroundColor Green
Start-Process $publicUrl
