# 井字棋联机后端

基于 Cloudflare Workers + Durable Objects 的实时联机对战后端。

## 部署方法

1. 安装 Wrangler（如有本地环境）：`npm install -g wrangler`
2. 登录：`wrangler login`
3. 部署：`wrangler deploy`

或者通过 Cloudflare 网页控制台：
- 创建 Worker，粘贴 `src/index.js` 代码
- 在设置中绑定 Durable Object：`ROOM_OBJECT` → `RoomObject`

## API

- `POST /api/create` – 创建房间，返回 `roomId`
- `POST /api/join` – 加入房间，请求体 `{ roomId }`
- `WebSocket /api/ws?roomId=xxx&role=X&name=xxx` – WebSocket 连接

## 环境变量

无，使用 Durable Objects 持久化房间状态。
