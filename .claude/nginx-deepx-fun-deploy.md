# deepx.fun SSL 配置 (2026-07-08)

## 状态: ✅ 已生效

## nginx 4 个启用站点
```
/etc/nginx/sites-enabled/
  ├─ forge.conf          (现有 - 没有动)
  ├─ hlzd.conf           (现有 - 含 deepx.fun 443 SSL + 自动 web-next 代理)
  ├─ hlzd-operator.conf  (现有 - dev box → hailianzhida 反代)
  └─ metabot.conf        (现有 - 9443 ssl deepx.fun 代理 9100 API)
```

## 域名分发
| URL | 后端 | 说明 |
|-----|------|------|
| `https://deepx.fun/` | web-next :3200 | UI 主页 |
| `https://deepx.fun/login/` | 3200 | 登录 |
| `https://deepx.fun/api/*` | panmira :9100 | API |
| `https://deepx.fun/ws` | panmira :9100/ws | WebSocket |
| `https://deepx.fun:9443/` | panmira :9100 | 老 API entry(保留兼容)|
| `http://deepx.fun/` | 301 → https://deepx.fun/ | 强制 HTTPS |

## SSL 证书
```
/etc/letsencrypt/live/deepx.fun-0001/  (active,used by hlzd.conf + metabot.conf)
```

## 史德飞 production URL
**https://deepx.fun/login/**

## 配置文件主条目 (hlzd.conf 的关键块)
```nginx
server {
    listen 80;
    server_name deepx.fun www.deepx.fun;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name deepx.fun www.deepx.fun;
    ssl_certificate /etc/letsencrypt/live/deepx.fun-0001/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/deepx.fun-0001/privkey.pem;
    
    location /api/      { proxy_pass http://127.0.0.1:9100; }
    location /admin/    { proxy_pass http://127.0.0.1:9100; }
    location /ws        { proxy_pass http://127.0.0.1:9100/ws; }
    location /          { proxy_pass http://127.0.0.1:3200; }  # 根 → web-next
    location /healthz   { return 200 "ok\n"; }  # 本地健康检查
    location /ppt       { alias /var/www/hlzd/ppt.html; }
    location /umami     { proxy_pass http://127.0.0.1:3100/umami; }
}
```

## 已删除
- `panmira-web.conf` — 之前我手建的占位(被 hlzd.conf 接管)
