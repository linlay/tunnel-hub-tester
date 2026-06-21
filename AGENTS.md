# AGENTS.md

本文件给后续在 `tunnel-hub-tester` 中工作的编码代理和开发者使用。请先读 `README.md`，再按本文件约定改动。

## 项目结构

本仓库是 Tunnel Hub / Zenmind Desktop 的本地请求调试前端，技术栈为 React + Vite + TypeScript。

- `src/App.tsx`: 主调试台 UI、WebSocket 连接、请求模板、日志、Tunnel Hub 管理辅助操作和 Desktop Bridge 调用。
- `src/styles.css`: 全局样式和页面布局。
- `src/main.tsx`: React 挂载入口。
- `vite.config.ts`: Vite 配置，并提供 `/__tester_ws_probe` Node 中间件用于服务端侧 WebSocket handshake 探测。
- `package.json`: npm scripts 和依赖声明。

相关 sibling 项目：

- `/Users/linlay/Project/zenmind-tunnel-hub/tunnel-hub-server`: Tunnel Hub Relay/Admin/Agent Go 服务。
- `/Users/linlay/Project/zenmind-tunnel-hub/tunnel-hub-website`: Tunnel Hub 管理前端。
- `/Users/linlay/Project/zenmind-tunnel-hub/tunnel-hub-agent`: Tunnel Hub Agent。

## 常用命令

```bash
npm install
npm run dev
npm run build
npm run preview
```

`dev` 和 `preview` 都监听 `127.0.0.1:11975`。

## 开发约定

- 沿用现有 React/Vite/TypeScript/lucide-react，不引入新状态管理库或 UI 框架，除非需求明确。
- 保持本项目是调试工具，不把它扩展成正式管理后台；管理后台能力应优先放在 sibling `tunnel-hub-website`。
- 不要提交本地生成物：`node_modules/`、`dist/`、`*.tsbuildinfo`、`.env*`、`.DS_Store`、日志文件。
- 不要在文档、源码或配置中写入真实 Desktop token、Official JWT、cookie secret 或其他凭据。
- WebSocket frame、request type、payload 模板要以当前 Desktop 协议和 sibling server 代码为准；无法确认时在文档或注释中标记未知，不要编造协议细节。
- 涉及公网 route、Admin API 或 token 传递模式的改动，需要同时检查 UI 展示、日志脱敏和错误提示是否仍然清晰。
- `vite.config.ts` 中的 probe 逻辑运行在 Node 侧，改动时注意不要把浏览器 API 写进去。

## 推荐验证

按改动范围选择验证：

- 前端 UI、类型、Vite 中间件：`npm run build`
- 本地交互联调：`npm run dev`，打开 `http://127.0.0.1:11975`
- Desktop WebSocket 排查相关改动：分别验证本地 `ws://127.0.0.1:7082/ws` 和远程 `wss://<random>.m.zenmind.cc/ws`
- WebApp route 排查相关改动：验证公网 `https://<random>.wa.zenmind.cc/` 或 `wss://<random>.wa.zenmind.cc/ws` 能通过 Desktop tunnel 转发到注册的本机 `targetUrl`

如果因为环境限制无法运行某项验证，请在最终说明里明确写出未运行的命令和原因。
