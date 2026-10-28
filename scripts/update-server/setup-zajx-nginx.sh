#!/usr/bin/env bash
# 在 OA 服务器（root@47.105.106.221）上执行：给 www.zajx.top 加 Roy 静默更新目录 /roy-update/。
# 只在现有 nginx 配置里插入一段 location，改前备份、nginx -t 不通过自动还原，只 reload 不重启。
set -e
CONF=/etc/nginx/sites-enabled/www.zajx.top.conf
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p /root/nginx-backup /data/roy-update/win
cp -a "$CONF" "/root/nginx-backup/www.zajx.top.conf.$TS"
if grep -q 'location ^~ /roy-update/' "$CONF"; then echo "已配置过，跳过"; else
python3 - "$CONF" <<'PY'
import sys
p=sys.argv[1]; s=open(p).read()
anchor="    location ^~ /downloads/ {"
assert s.count(anchor)==1, "没找到 /downloads/ 段，未修改"
block='''    # Roy 静默更新：latest.yml / 安装包 / blockmap（支持 Range 断点和差量下载）
    location ^~ /roy-update/ {
        alias /data/roy-update/;
        autoindex off;
        types { text/yaml yml; application/octet-stream exe blockmap; }
        default_type application/octet-stream;
        add_header Cache-Control "no-cache" always;
        add_header X-Content-Type-Options "nosniff" always;
    }

'''
open(p,'w').write(s.replace(anchor, block+anchor))
PY
fi
if nginx -t; then nginx -s reload && echo "nginx 已重新加载"; else cp -a "/root/nginx-backup/www.zajx.top.conf.$TS" "$CONF"; echo "配置检查失败，已还原"; exit 1; fi
echo ok > /data/roy-update/ping.txt
chmod -R o+rX /data/roy-update
echo "完成。备份：/root/nginx-backup/www.zajx.top.conf.$TS ；验证：curl https://www.zajx.top/roy-update/ping.txt"