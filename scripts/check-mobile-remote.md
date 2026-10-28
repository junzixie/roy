# 手机遥控公网访问配置指南

## 当前问题
手机扫码后公网 `agares.online` 打不开

## 配置步骤

### 方案一：使用 Cloudflare 隧道（推荐）

1. **安装 Cloudflare Tunnel**
   ```bash
   # 下载 cloudflared
   # Windows: https://github.com/cloudflare/cloudflared/releases
   ```

2. **创建隧道**
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create roy-mobile
   cloudflared tunnel route dns roy-mobile agares.online
   ```

3. **配置隧道转发**
   创建配置文件 `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: <your-tunnel-id>
   credentials-file: /path/to/<tunnel-id>.json
   
   ingress:
     - hostname: agares.online
       service: http://localhost:38641
     - service: http_status:404
   ```

4. **启动隧道**
   ```bash
   cloudflared tunnel run roy-mobile
   ```

5. **在 Roy 设置中配置**
   - 打开 Roy → 设置 → 手机遥控
   - 公网地址填入：`agares.online`（不要加 https:// 和端口）
   - 切换到"公网"模式
   - 显示二维码并扫码

### 方案二：使用 SSH 反向隧道

如果你有自己的服务器（如 VPS），可以使用 SSH 反向隧道：

1. **在 Roy 设置中配置中转服务器**
   ```
   用户名@服务器地址:端口
   例如：lzx@122.225.39.134:2222
   ```

2. **在服务器上配置反向代理**
   服务器需要安装 Nginx/Caddy 将 `agares.online` 的 443 端口转发到隧道端口

3. **DNS 配置**
   将 `agares.online` 的 A 记录指向你的服务器 IP

### 方案三：仅使用局域网（无需公网）

如果只在家里或办公室使用：

1. **确保手机和电脑在同一 Wi-Fi**
2. **在 Roy 设置中选择"局域网"模式**
3. **显示二维码并扫码**

局域网模式完全免费，不需要 Pro 激活

## 验证配置

### 检查 Roy 服务是否启动
1. 打开 Roy → 设置 → 手机遥控
2. 开启"允许手机遥控"
3. 查看状态是否显示"服务未启动"

### 检查公网地址是否可达
```bash
# 测试公网地址是否能访问到本地服务
curl https://agares.online
```

应该返回 HTML 页面，而不是 404 或连接失败

### 检查端口是否开放
本地应该监听 38641 端口：
```bash
netstat -ano | findstr 38641
```

## 常见问题

### 1. 扫码后提示"访问地址无效"
- **原因**：Host 头与配置的公网地址不匹配
- **解决**：确保填入的是 `agares.online`，不要加协议和端口

### 2. 扫码后提示"只允许局域网访问"
- **原因**：请求没有通过公网入口，被识别为外网 IP
- **解决**：确保反向代理/隧道正确配置

### 3. 公网模式提示需要 Pro
- **原因**：公网手机遥控是 Pro 功能
- **解决**：在设置 → 账号 → 软件激活中激活 Pro，或使用免费的局域网模式

### 4. 二维码 5 分钟后失效
- **解决**：使用"显示固定二维码"代替"一次性码"
- 固定二维码长期有效，可以截图保存

## 推荐配置

对于你的情况，我建议：

1. **如果 agares.online 是你的域名**
   - 使用 Cloudflare Tunnel（免费且简单）
   - 或在服务器上配置 Nginx 反向代理

2. **如果只是想要远程访问**
   - 考虑使用 Tailscale/ZeroTier 等内网穿透方案
   - 然后在虚拟局域网内使用"局域网"模式

3. **如果只在本地使用**
   - 直接使用"局域网"模式，免费且无需配置
