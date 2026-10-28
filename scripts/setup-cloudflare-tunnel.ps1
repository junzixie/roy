# Cloudflare Tunnel 自动配置脚本 for Roy 手机遥控
# 用途：配置 agares.online 公网访问

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Roy 手机遥控 - Cloudflare Tunnel 配置" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "警告: 建议以管理员权限运行此脚本" -ForegroundColor Yellow
    Write-Host ""
}

# 1. 检查 cloudflared 是否已安装
Write-Host "[1/5] 检查 cloudflared 安装状态..." -ForegroundColor Green
$cloudflaredPath = "C:\Program Files\cloudflared\cloudflared.exe"

if (Test-Path $cloudflaredPath) {
    Write-Host "✓ cloudflared 已安装: $cloudflaredPath" -ForegroundColor Green
    & $cloudflaredPath --version
} else {
    Write-Host "× cloudflared 未安装，开始下载..." -ForegroundColor Yellow

    # 下载最新版本
    $downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    $tempFile = "$env:TEMP\cloudflared.exe"

    try {
        Write-Host "正在从 GitHub 下载 cloudflared..." -ForegroundColor Cyan
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tempFile -UseBasicParsing

        # 创建安装目录
        $installDir = "C:\Program Files\cloudflared"
        if (-not (Test-Path $installDir)) {
            New-Item -ItemType Directory -Path $installDir -Force | Out-Null
        }

        # 移动到安装目录
        Move-Item -Path $tempFile -Destination $cloudflaredPath -Force

        Write-Host "✓ cloudflared 安装成功" -ForegroundColor Green

        # 添加到系统 PATH
        $currentPath = [Environment]::GetEnvironmentVariable("Path", "Machine")
        if ($currentPath -notlike "*$installDir*") {
            [Environment]::SetEnvironmentVariable("Path", "$currentPath;$installDir", "Machine")
            $env:Path += ";$installDir"
            Write-Host "✓ 已添加到系统 PATH" -ForegroundColor Green
        }
    } catch {
        Write-Host "✗ 下载失败: $_" -ForegroundColor Red
        Write-Host ""
        Write-Host "请手动下载并安装 cloudflared:" -ForegroundColor Yellow
        Write-Host "https://github.com/cloudflare/cloudflared/releases" -ForegroundColor Cyan
        exit 1
    }
}

Write-Host ""

# 2. 登录 Cloudflare
Write-Host "[2/5] 登录 Cloudflare 账号..." -ForegroundColor Green
Write-Host "即将打开浏览器，请在浏览器中完成登录授权" -ForegroundColor Yellow
Write-Host ""
Start-Sleep -Seconds 2

try {
    & $cloudflaredPath tunnel login
    if ($LASTEXITCODE -ne 0) {
        throw "登录失败"
    }
    Write-Host "✓ Cloudflare 登录成功" -ForegroundColor Green
} catch {
    Write-Host "✗ 登录失败: $_" -ForegroundColor Red
    Write-Host "请确保已完成浏览器授权" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# 3. 创建隧道
Write-Host "[3/5] 创建 Cloudflare 隧道..." -ForegroundColor Green
$tunnelName = "roy-mobile-remote"

# 检查隧道是否已存在
$existingTunnels = & $cloudflaredPath tunnel list | Select-String $tunnelName
if ($existingTunnels) {
    Write-Host "隧道 '$tunnelName' 已存在，跳过创建" -ForegroundColor Yellow
} else {
    try {
        & $cloudflaredPath tunnel create $tunnelName
        if ($LASTEXITCODE -ne 0) {
            throw "创建隧道失败"
        }
        Write-Host "✓ 隧道创建成功: $tunnelName" -ForegroundColor Green
    } catch {
        Write-Host "✗ 创建隧道失败: $_" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""

# 4. 配置 DNS 路由
Write-Host "[4/5] 配置 DNS 路由..." -ForegroundColor Green
$domain = "agares.online"

Write-Host "正在为 $domain 配置 DNS 路由..." -ForegroundColor Cyan
try {
    & $cloudflaredPath tunnel route dns $tunnelName $domain
    if ($LASTEXITCODE -ne 0) {
        Write-Host "警告: DNS 路由可能已存在" -ForegroundColor Yellow
    } else {
        Write-Host "✓ DNS 路由配置成功" -ForegroundColor Green
    }
} catch {
    Write-Host "警告: DNS 配置出现问题，可能需要手动配置" -ForegroundColor Yellow
}

Write-Host ""

# 5. 创建配置文件
Write-Host "[5/5] 创建隧道配置文件..." -ForegroundColor Green
$configDir = "$env:USERPROFILE\.cloudflared"
$configFile = "$configDir\config.yml"

if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}

# 获取隧道 ID
$tunnelList = & $cloudflaredPath tunnel list
$tunnelId = ($tunnelList | Select-String $tunnelName | ForEach-Object { $_.Line -split '\s+' } | Select-Object -First 1)

if (-not $tunnelId) {
    Write-Host "✗ 无法获取隧道 ID" -ForegroundColor Red
    Write-Host "请运行: cloudflared tunnel list" -ForegroundColor Yellow
    exit 1
}

# 查找凭证文件
$credentialsFile = Get-ChildItem "$env:USERPROFILE\.cloudflared" -Filter "$tunnelId.json" -ErrorAction SilentlyContinue | Select-Object -First 1

if (-not $credentialsFile) {
    Write-Host "✗ 找不到隧道凭证文件" -ForegroundColor Red
    exit 1
}

# 创建配置文件
$configContent = @"
tunnel: $tunnelId
credentials-file: $($credentialsFile.FullName)

ingress:
  - hostname: $domain
    service: http://localhost:38641
  - service: http_status:404
"@

$configContent | Out-File -FilePath $configFile -Encoding UTF8 -Force
Write-Host "✓ 配置文件创建成功: $configFile" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "配置完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "接下来的步骤:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. 启动隧道:" -ForegroundColor Cyan
Write-Host "   cloudflared tunnel run $tunnelName" -ForegroundColor White
Write-Host ""
Write-Host "2. 在 Roy 中配置:" -ForegroundColor Cyan
Write-Host "   - 打开 Roy → 设置 → 手机遥控" -ForegroundColor White
Write-Host "   - 公网地址填入: $domain" -ForegroundColor White
Write-Host "   - 切换到'公网'模式" -ForegroundColor White
Write-Host "   - 点击'显示固定二维码'" -ForegroundColor White
Write-Host ""
Write-Host "3. 测试连接:" -ForegroundColor Cyan
Write-Host "   在浏览器访问: https://$domain" -ForegroundColor White
Write-Host ""
Write-Host "提示: 可以将隧道设置为开机自启动" -ForegroundColor Yellow
Write-Host "运行: .\scripts\install-tunnel-service.ps1" -ForegroundColor White
Write-Host ""
