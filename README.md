# Tunnel Hub Tester

## 1. 项目简介

`tunnel-hub-tester` 是一个本地 React + Vite + TypeScript 调试台，只用于验证 Zenmind Desktop WS Server 协议。

它默认作为开发者工具运行，不是面向公网用户的生产前端。

默认端点：

- 本地 Desktop WS Server：`ws://127.0.0.1:7082/ws`
- 远程 Desktop WS Server：`wss://<device>.m.zenmind.cc/ws`
- 本地开发服务：`http://127.0.0.1:11975`

## 2. 快速开始

### 前置要求

- Node.js
- npm
- 已启动的 Zenmind Desktop 本地 WS Server，或可访问的远程 Desktop WS host

### 本地启动

```bash
npm install
npm run dev
```

打开 `http://127.0.0.1:11975`。

### 常用流程

1. 选择 `本地调试` 或 `远程调试`。
2. 本地调试保留默认端口 `7082`；远程调试填写裸域名，例如 `zm2tjftlkpdi.m.zenmind.cc`，页面会自动规范化为 `wss://zm2tjftlkpdi.m.zenmind.cc/ws`。
3. 粘贴 Desktop/platform auth token。
4. 在高级工具里选择 token transport：query token 或 `bearer.<token>` WebSocket subprotocol。
5. 需要排查握手、鉴权或公网路由时，先点击 `探测`，再点击 `连接`。
6. 在 `请求调试` 中选择 `ns=d`、`ns=ap` 或 `ns=wa`，编辑 `type` 和 JSON payload 后发送请求。

`ns=wa` 在本工具里只是 Desktop WS Server 的业务 namespace，不是 browser-facing WebApp reverse proxy 测试入口。

### Desktop 注册辅助

高级工具保留 `POST /api/desktop/devices/register` helper。注册成功后，tester 会用返回的 `webSocketUrl` 填充远程 Desktop WS target。

注册返回的 relay/tunnel token 不是 Desktop/platform auth token；不要把它当成 `Desktop Token` 填入主连接区。

### 构建与预览

```bash
npm run build
npm run preview
```

`preview` 同样监听 `http://127.0.0.1:11975`。

## 3. 配置说明

项目没有必需的配置文件；Vite 会读取本地 `.env` 或 `.env.local`，但真实本地配置不要提交。

当前可用的 Vite 环境变量：

- `VITE_TUNNEL_HUB_BASE_URL`：Tunnel Hub 默认基地址，未设置时为 `https://tunnel-hub.zenmind.cc`。
- `VITE_DESKTOP_PUBLIC_HOST`：可选的默认远程 Desktop public host，实际新注册设备会使用随机 `*.m.zenmind.cc` host。

页面内填写的目标、token transport mode 和注册 helper 设置会保存在浏览器 `localStorage`，不写入仓库文件。

## 4. 部署

本项目主要用于本机调试。需要临时发布静态文件时，先构建：

```bash
npm run build
```

构建产物位于 `dist/`，可由任意静态文件服务器托管。部署时不要把 Desktop token、Official JWT 或其他真实凭据写入仓库文件、构建脚本或静态产物。

## 5. 运维

### 日志与排查

- 浏览器控制台用于查看前端运行错误。
- 页面内请求日志用于查看 Desktop WS business frame、probe、Tunnel Hub registration helper 和错误响应。
- `探测` 按钮会通过 Vite Node 中间件执行 WebSocket handshake，可用于区分浏览器泛化错误、Relay HTTP status/body、鉴权失败、close frame 和首条 Desktop 响应。
- Query token mode 会发送 `?token=<DesktopToken>`；Subprotocol mode 会发送 `Sec-WebSocket-Protocol: bearer.<DesktopToken>`。

### 常见问题

- 无法连接本地 Desktop：确认 `127.0.0.1:7082` 的 Desktop WS Server 已经启动。
- 远程 Desktop 返回 `502 desktop is offline`：确认 Desktop 已用注册返回的内部 relay token 连接到 Tunnel Hub relay。
- 鉴权失败：确认 Desktop/platform auth token 有效，并检查 token 传递模式是 query token 还是 `bearer.<token>` WebSocket subprotocol。
- `ns=wa` 没有返回：确认目标 Desktop WS Server 已定义对应的 `wa` action；本 tester 不测试 WebApp reverse proxy。

## 6. 开发命令

```bash
npm install
npm run dev
npm test
npm run build
npm run preview
```

提交前至少运行 `npm test` 和 `npm run build`。
