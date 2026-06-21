# Tunnel Hub Tester

## 1. 项目简介

`tunnel-hub-tester` 是一个本地 React + Vite + TypeScript 调试台，用于验证 Zenmind Desktop 的 WebSocket 请求、Tunnel Hub 远程路由、管理 API 辅助操作，以及 localhost Desktop Action Bridge 调用。

它默认作为开发者工具运行，不是面向公网用户的生产前端。

默认端点：

- 本地 Desktop WebSocket：`ws://127.0.0.1:7082/ws`
- 远程 Desktop WebSocket：`wss://<random>.m.zenmind.cc/ws`
- 远程 WebApp URL：`https://<random>.wa.zenmind.cc/`
- 本地开发服务：`http://127.0.0.1:11975`
- Desktop Action Bridge：`http://127.0.0.1:11788`

## 2. 快速开始

### 前置要求

- Node.js
- npm
- 已启动的 Zenmind Desktop 本地调试服务，或可访问的 Tunnel Hub 远程 route

### 本地启动

```bash
npm install
npm run dev
```

打开 `http://127.0.0.1:11975`。

### 常用流程

1. 选择 `本地调试` 或 `远程调试`。
2. 本地调试保留默认端口 `7082`；远程调试填写裸域名，例如 `zma7bxd2v33a.m.zenmind.cc`，页面会自动补全 `wss://` 和 `/ws`。
3. 粘贴 Desktop app access token。
4. 需要排查握手、鉴权或公网路由时，先点击 `探测`，再点击 `连接`。
5. 在 `请求调试` 中选择模板、编辑 JSON payload 并发送请求。
6. 需要 Tunnel Hub 管理能力、WebApp 注册/探测或 Desktop Bridge 时，展开高级工具区。

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
- `VITE_DESKTOP_PUBLIC_HOST`：默认远程 Desktop public host，未设置时为 `mac-mini-office.tunnel-hub.zenmind.cc`；实际新注册设备会使用随机 `*.m.zenmind.cc` host。

页面内填写的目标、token、bridge URL 等调试设置会保存在浏览器 `localStorage`，不写入仓库文件。

## 4. 部署

本项目主要用于本机调试。需要临时发布静态文件时，先构建：

```bash
npm run build
```

构建产物位于 `dist/`，可由任意静态文件服务器托管。部署时不要把 Desktop token、Official JWT 或其他真实凭据写入仓库文件、构建脚本或静态产物。

## 5. 运维

### 日志与排查

- 浏览器控制台用于查看前端运行错误。
- 页面内请求日志用于查看 Desktop/platform WebSocket frame、WebApp HTTP/WS probe、Tunnel Hub API 和 Desktop Bridge 响应。
- `探测` 按钮会通过 Vite Node 中间件执行 WebSocket handshake，可用于区分浏览器泛化错误、Relay `404`、鉴权失败、close frame 和首条 Desktop 响应。
- WebApp 探测访问的是普通 `*.wa.zenmind.cc` HTTP/WS 入口，不会向浏览器业务流发送 `ns=wa` JSON frame；`ns=wa` 只存在于 hub-server 到 Desktop `TunnelClientEndpoint` 的内部 stream metadata。

### 常见问题

- 无法连接本地 Desktop：确认 `127.0.0.1:7082` 的 Desktop WebSocket 服务已经启动。
- 远程 Desktop 返回 `502 desktop is offline`：确认 Desktop 已用注册返回的内部 `agentToken` 连接到 `wss://tunnel-hub.zenmind.cc/tunnel`。
- WebApp 返回 `404` 或 `502`：确认已经注册对应 device-scoped WebApp，public host 是 `*.wa.zenmind.cc`，`targetUrl` 指向 Desktop 本机实际端口，且 Desktop tunnel 在线。
- 鉴权失败：确认 Desktop app access token 有效，并检查 token 传递模式是 query token 还是 `bearer.<token>` WebSocket subprotocol。
- Desktop Bridge 调用失败：确认 `http://127.0.0.1:11788` 可访问，且目标 Desktop 进程启用了该 localhost-only bridge。

## 6. 开发命令

```bash
npm install
npm run dev
npm run build
npm run preview
```

当前项目没有独立测试脚本；提交前至少运行 `npm run build`。
