# AGENTS.md

本文件给后续在 `tunnel-hub-tester` 中工作的编码代理和开发者使用。请先读 `README.md`，再按本文件约定改动。

## 1. 项目概览

`tunnel-hub-tester` 是 Tunnel Hub / Zenmind Desktop 的本地 WebSocket 协议调试前端。它用于连接本地 Desktop WS Server 或远程 `*.m.zenmind.cc` Desktop public WebSocket，并发送 `d`、`ap`、`wa` namespace 的业务 frame。

本项目是调试工具，不是管理控制台；正式管理能力属于 sibling 项目 `tunnel-hub-website`。

## 2. 技术栈

- React + TypeScript。
- Vite dev server、build 和 preview。
- Node built-in `node --test` + `--experimental-strip-types`。
- `lucide-react` 图标。
- Vite 自定义 Node middleware，用于 HTTP proxy 和 WebSocket handshake probe。

## 3. 架构设计

应用由三层组成：

1. `src/desktopWsProtocol.ts`: URL 规范化、Desktop token transport、business frame builder 等纯函数。
2. `src/App.tsx`: 调试台 UI、WebSocket 生命周期、请求模板、日志脱敏、注册 helper、probe 调用和 localStorage 持久化。
3. `vite.config.ts`: Vite 配置和 Node 侧调试中间件，包括 `/__tester_proxy` 与 `/__tester_ws_probe`。

核心链路：

- 本地模式连接 `ws://127.0.0.1:<port>/ws`。
- 远程模式连接 `wss://<random>.m.zenmind.cc/ws`。
- token 可以通过 query `?token=...` 或 WebSocket subprotocol `bearer.<token>` 发送。
- `探测` 不依赖浏览器 WebSocket API，而是在 Vite Node middleware 中手写 handshake，方便查看 HTTP status、headers、body、close frame 和首条消息。

## 4. 目录结构

- `src/App.tsx`: 主调试台 UI、WebSocket 连接、业务请求、日志、注册 helper。
- `src/desktopWsProtocol.ts`: 协议相关纯函数和类型。
- `src/desktopWsProtocol.test.ts`: URL、token transport、frame builder 和功能边界测试。
- `src/styles.css`: 全局样式和响应式布局。
- `src/main.tsx`: React 挂载入口。
- `vite.config.ts`: dev/preview 配置、Node proxy、WebSocket probe。
- `package.json`: npm scripts 和依赖声明。

相关 sibling 项目：

- `../tunnel-hub-server`: Tunnel Hub Relay/Admin/Desktop API/Agent Go 服务。
- `../tunnel-hub-website`: Tunnel Hub 管理前端。

## 5. 数据结构

核心前端数据结构：

- `DesktopBusinessFrame`: `{ ns, frame: "request", type, id, payload }`。
- `Namespace`: `d`、`ap`、`wa`。
- `DesktopTokenMode`: `query` 或 `subprotocol`。
- tester settings: 目标模式、远程 host、token transport、Hub base URL、注册参数等，保存在 `localStorage`。
- probe result: handshake/open/message/close/timeout/error 的分阶段结果，定义在 `vite.config.ts`。
- 日志记录会对 token、authorization、api key、secret 等字段脱敏。

## 6. API 与协议定义

本地 Vite middleware：

- `POST /__tester_proxy?url=...`: Node 侧 HTTP proxy helper，用于绕过浏览器 CORS 限制做调试请求。
- `POST /__tester_ws_probe`: Node 侧 WebSocket handshake probe，支持发送首个 JSON frame 并读取响应。

外部 API：

- `POST /api/desktop/devices/register`: Desktop 注册 helper，要求 Official JWT。

WebSocket 协议：

- Desktop target path 固定为 `/ws`。
- 远程 Desktop public Host 属于 `*.m.zenmind.cc`。
- business frame 由 `buildDesktopBusinessFrame` 生成，`frame` 固定为 `request`。
- tester 支持 `ns=d`、`ns=ap`、`ns=wa`，但不测试 browser-facing `*.wa.zenmind.cc` reverse proxy。

## 7. 开发要点

- 保持项目定位为调试工具，不扩展成正式管理后台。
- 不要把真实 Desktop token、Official JWT、cookie secret 或 API key 写入源码、文档、测试或截图。
- 涉及 token、Authorization、secret、API key 的日志必须脱敏。
- `vite.config.ts` 在 Node 侧运行，不能使用浏览器 API。
- WebSocket URL 规范化、token transport 和 frame builder 优先放在 `src/desktopWsProtocol.ts`，并补充 `desktopWsProtocol.test.ts`。
- 现有测试明确禁止把本工具变成 `*.wa.zenmind.cc` WebApp reverse proxy tester；相关能力应放到专门工具或 server/website 侧。
- UI 文案需要清楚区分 `agentToken` 和 Desktop/platform auth token。

## 8. 开发流程

```bash
cd tunnel-hub-tester
npm install
npm test
npm run build
npm run dev
```

本地交互验证：

1. 启动 Zenmind Desktop WS Server。
2. 打开 `http://127.0.0.1:11975`。
3. 本地连接 `ws://127.0.0.1:7082/ws`。
4. 远程连接 `wss://<random>.m.zenmind.cc/ws`。
5. 分别验证 query token 和 subprotocol token mode。

## 9. 已知约束与注意事项

- `dev` 和 `preview` 都固定监听 `127.0.0.1:11975`。
- `npm test` 使用 Node 原生 test runner，不是 Vitest。
- 本项目没有生产 Dockerfile。
- browser-facing WebApp 反向代理验证目标是 `https://<random>.wa.zenmind.cc/` 或 `wss://<random>.wa.zenmind.cc/ws`，不属于本 tester 当前职责。
- 不提交 `node_modules/`、`dist/`、`*.tsbuildinfo`、`.env*`、`.DS_Store`、日志文件。
- 如果环境限制导致无法运行验证命令，最终说明里必须明确列出未运行项和原因。
