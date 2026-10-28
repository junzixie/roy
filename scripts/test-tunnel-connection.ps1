# 测试 Cloudflare Tunnel 连接状态
# 用途：验证隧道是否正常工作

param(
    [string]$Domain = "agares.online",
    [int]$LocalPort = 38641
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "测试 Cloudflare Tunnel 连接" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. 检查本地服务
Write-Host "[1/4] 检查本地 Roy 服务..." -ForegroundColor Green
$localConnection = Test-NetConnection -ComputerName localhost -Port $LocalPort -InformationLevel Quiet -WarningAction SilentlyContinue

if ($localConnection) {
    Write-Host "✓ 本地服务正常运行 (localhost:$LocalPort)" -ForegroundColor Green
} else {
    Write-Host "✗ 本地服务未启动" -ForegroundColor Red
    Write-Host "请确保:" -ForegroundColor Yellow
    Write-Host "  1. Roy 已启动" -ForegroundColor White
    Write-Host "  2. 手机遥控功能已开启" -ForegroundColor White
    Write-Host "  3. 服务监听在 38641 端口" -ForegroundColor White
    Write-Host ""
}

Write-Host ""

# 2. 检查隧道进程
Write-Host "[2/4] 检查 cloudflared 进程..." -ForegroundColor Green
$cloudflaredProcess = Get-Process cloudflared -ErrorAction SilentlyContinue

if ($cloudflaredProcess) {
    Write-Host "✓ cloudflared 进程运行中 (PID: $($cloudflaredProcess.Id))" -ForegroundColor Green
} else {
    Write-Host "✗ cloudflared 未运行" -ForegroundColor Red
    Write-Host "启动命令: cloudflared tunnel run roy-mobile-remote" -ForegroundColor Yellow
    Write-Host "或安装为服务: .\scripts\install-tunnel-service.ps1" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host ""

# 3. 测试公网访问
Write-Host "[3/4] 测试公网 HTTPS 访问..." -ForegroundColor Green
$url = "https://$Domain"

try {
    $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop

    if ($response.StatusCode -eq 200) {
        Write-Host "✓ 公网访问成功 ($url)" -ForegroundColor Green
        Write-Host "  状态码: $($response.StatusCode)" -ForegroundColor White
        Write-Host "  内容长度: $($response.Content.Length) bytes" -ForegroundColor White

        # 检查是否是 Roy 的页面
        if ($response.Content -like "*Roy*" -or $response.Content -like "*手机遥控*") {
            Write-Host "  ✓ 确认为 Roy 手机遥控页面" -ForegroundColor Green
        }
    } else {
        Write-Host "⚠ 收到非 200 状态码: $($response.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "✗ 公网访问失败" -ForegroundColor Red
    Write-Host "错误信息: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "可能的原因:" -ForegroundColor Yellow
    Write-Host "  1. DNS 尚未生效（通常需要几分钟）" -ForegroundColor White
    Write-Host "  2. cloudflared 隧道未运行" -ForegroundColor White
    Write-Host "  3. 本地 Roy 服务未启动" -ForegroundColor White
    Write-Host ""
}

Write-Host ""

# 4. DNS 解析检查
Write-Host "[4/4] 检查 DNS 解析..." -ForegroundColor Green
try {
    $dnsResult = Resolve-DnsName -Name $Domain -Type A -ErrorAction Stop

    if ($dnsResult) {
        Write-Host "✓ DNS 解析成功" -ForegroundColor Green
        foreach ($record in $dnsResult) {
            if ($record.Type -eq "A") {
                Write-Host "  IP: $($record.IPAddress)" -ForegroundColor White
            }
        }

        # 检查是否解析到 Cloudflare
        $firstIP = ($dnsResult | Where-Object { $_.Type -eq "A" } | Select-Object -First 1).IPAddress
        if ($firstIP -match "^(104\.16\.|104\.17\.|104\.18\.|104\.19\.|104\.2[0-9]\.|104\.3[0-1]\.|172\.64\.|172\.65\.|172\.66\.|172\.67\.)") {
            Write-Host "  ✓ 已解析到 Cloudflare CDN" -ForegroundColor Green
        } else {
            Write-Host "  ⚠ 未解析到 Cloudflare CDN" -ForegroundColor Yellow
            Write-Host "    这可能是正常的，取决于你的配置" -ForegroundColor White
        }
    }
} catch {
    Write-Host "✗ DNS 解析失败: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "请检查域名配置" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "测试完成" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($localConnection -and $cloudflaredProcess) {
    Write-Host "✓ 所有必要服务都在运行" -ForegroundColor Green
    Write-Host ""
    Write-Host "如果公网访问仍然失败，请等待 DNS 生效（通常 5-10 分钟）" -ForegroundColor Yellow
    Write-Host "然后在 Roy 中:" -ForegroundColor Cyan
    Write-Host "  1. 打开设置 → 手机遥控" -ForegroundColor White
    Write-Host "  2. 公网地址填入: $Domain" -ForegroundColor White
    Write-Host "  3. 切换到'公网'模式" -ForegroundColor White
    Write-Host "  4. 显示二维码并扫码测试" -ForegroundColor White
} else {
    Write-Host "⚠ 请先解决上述问题，然后重新测试" -ForegroundColor Yellow
}
Write-Host ""
