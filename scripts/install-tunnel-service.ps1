# 将 Cloudflare Tunnel 安装为 Windows 服务
# 用途：开机自动启动隧道，无需手动运行

param(
    [string]$TunnelName = "roy-mobile-remote"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "安装 Cloudflare Tunnel Windows 服务" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "✗ 此脚本需要管理员权限运行" -ForegroundColor Red
    Write-Host "请右键点击 PowerShell，选择'以管理员身份运行'" -ForegroundColor Yellow
    exit 1
}

$cloudflaredPath = "C:\Program Files\cloudflared\cloudflared.exe"

if (-not (Test-Path $cloudflaredPath)) {
    Write-Host "✗ cloudflared 未安装" -ForegroundColor Red
    Write-Host "请先运行: .\scripts\setup-cloudflare-tunnel.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host "正在安装 Windows 服务..." -ForegroundColor Green

try {
    # 安装服务
    & $cloudflaredPath service install

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ 服务安装成功" -ForegroundColor Green

        # 启动服务
        Write-Host "正在启动服务..." -ForegroundColor Cyan
        Start-Service cloudflared

        Write-Host "✓ 服务已启动" -ForegroundColor Green
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "安装完成！" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "隧道已设置为开机自启动" -ForegroundColor Green
        Write-Host ""
        Write-Host "管理命令:" -ForegroundColor Yellow
        Write-Host "  查看状态: Get-Service cloudflared" -ForegroundColor White
        Write-Host "  停止服务: Stop-Service cloudflared" -ForegroundColor White
        Write-Host "  启动服务: Start-Service cloudflared" -ForegroundColor White
        Write-Host "  卸载服务: cloudflared service uninstall" -ForegroundColor White
        Write-Host ""
    } else {
        throw "服务安装失败"
    }
} catch {
    Write-Host "✗ 安装失败: $_" -ForegroundColor Red
    exit 1
}
