# Tunnel Hub Tester

## 1. 项目简介

`tunnel-hub-tester` 是一个本地 React + Vite + TypeScript 调试台，用于验证 Zenmind Desktop WebSocket Server、Tunnel Hub Desktop public WebSocket 入口，以及 Desktop business frame 协议。

它是开发者工具，不是生产管理后台，也不负责测试 browser-facing `*.wa.zenmind.cc` WebApp 反向代理。

默认端点：

- 本地 Desktop WS Server: `ws://127.0.0.1:7082/ws`
- 远程 Desktop WS Server: `wss://<random>.m.zenmind.cc/ws`
- 本地 tester: `http://127.0.0.1:11975`
- Tunnel Hub API: `https://tunnel-hub.zenmind.cc`

## 2. 快速开始

### 前置要求

- Node.js
- npm
- 已启动的本地 Zenmind Desktop WS Server，或一个可访问的远程 `*.m.zenmind.cc` Desktop public Host

### 本地启动

```bash
cd tunnel-hub-tester
npm install
npm test
npm run build
npm run dev
```

打开 `http://127.0.0.1:11975`。

### 调试流程

1. 选择 `本地调试` 或 `远程调试`。
2. 本地调试默认使用 `127.0.0.1:7082/ws`。
3. 远程调试填写裸域名或完整 URL，例如 `zm2tjftlkpdi.m.zenmind.cc`，页面会规范化为 `wss://zm2tjftlkpdi.m.zenmind.cc/ws`。
4. 填入 Desktop/platform auth token。
5. 选择 token transport: query token 或 `bearer.<token>` WebSocket subprotocol。
6. 需要排查握手、鉴权或公网路由时，先点击 `探测`，再点击 `连接`。
7. 在请求调试区选择 `ns=d`、`ns=ap` 或 `ns=wa`，编辑 `type` 和 JSON payload 后发送。

`ns=wa` 在本工具里表示 Desktop WS Server 的业务 namespace，不是 `*.wa.zenmind.cc` WebApp 反向代理入口。

### Desktop 注册辅助

高级工具中有 `POST /api/desktop/devices/register` helper。注册成功后，tester 会用返回的 `webSocketUrl` 填充远程 Desktop WS target。

注册返回的 `agentToken` 是 Desktop 连接 Tunnel Hub Relay 的内部 token，不是 Desktop/platform auth token。不要把它填到主连接区的 Desktop token。

### 构建与预览

```bash
npm run build
npm run preview
```

`preview` 同样监听 `http://127.0.0.1:11975`。

## 3. 配置说明

项目没有必需配置文件。需要覆盖默认值时可创建本地 `.env` 或 `.env.local`，不要提交真实 token、JWT 或本地配置。

| 名称 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_TUNNEL_HUB_BASE_URL` | `https://tunnel-hub.zenmind.cc` | Desktop 注册 helper 使用的 Tunnel Hub 基地址。 |
| `VITE_DESKTOP_PUBLIC_HOST` | 空 | 默认远程 Desktop public host；页面会规范化成 `wss://.../ws`。 |

页面内填写的目标、token transport mode、注册 helper 设置、请求模板和日志状态会保存在浏览器 `localStorage`，不会写入仓库文件。

## 4. 部署与打包

本项目主要用于本机调试，没有生产 Dockerfile。需要临时发布静态文件时：

```bash
npm run build
```

构建产物位于 `dist/`，可用任意静态文件服务器托管。发布时不要把 Desktop token、Official JWT、cookie、API key 或其他凭据写入源码、构建脚本或静态产物。

## 5. 运维

### 日志与排查

- 浏览器控制台用于查看前端运行错误。
- 页面请求日志用于查看 Desktop business frame、probe、Tunnel Hub registration helper 和错误响应。
- `探测` 会通过 Vite Node 中间件执行 WebSocket handshake，可区分浏览器泛化错误、Relay HTTP status/body、鉴权失败、close frame 和首条 Desktop 响应。
- Query token mode 会发送 `?token=<DesktopToken>`。
- Subprotocol mode 会发送 `Sec-WebSocket-Protocol: bearer.<DesktopToken>`。

### 常见问题

- 无法连接本地 Desktop：确认 `127.0.0.1:7082` 的 Desktop WS Server 已启动。
- 远程 Desktop 返回 `502 desktop is offline`：确认 Desktop 已使用注册返回的内部 `agentToken` 连接到 Tunnel Hub Relay。
- 鉴权失败：确认 Desktop/platform auth token 有效，并检查 token transport 是 query token 还是 `bearer.<token>` subprotocol。
- 注册 helper 返回 401/403：确认 Official JWT 有效且 `scope` 包含 `tunnel`。
- `ns=wa` 没有返回：确认目标 Desktop WS Server 已定义对应 `wa` action；本 tester 不测试 WebApp reverse proxy。

## 6. 开发命令

```bash
npm install
npm run dev
npm test
npm run build
npm run preview
```

提交前至少运行 `npm test` 和 `npm run build`。
