# Desktop Request Tester

Local React + Vite tester for Zenmind Desktop WebSocket requests.

Defaults:

- Local debug: `ws://127.0.0.1:7082/ws`
- Remote debug: `wss://{deviceId}.tunnel-hub.zenmind.cc/ws`
- Dev server: `http://127.0.0.1:11975`
- Advanced Desktop Action Bridge: `http://127.0.0.1:11788`

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:11975`.

## Auth Notes

Desktop WS debug requires a Desktop app access token. Paste it into the page and connect with query-token mode unless you specifically need the `bearer.<token>` WebSocket subprotocol.

The optional Tunnel Hub admin tools are collapsed under Advanced Tools. They require an Admin API Key and can list online agents or publish a service route to the selected token.

The Desktop Bridge panel is also under Advanced Tools. It uses the existing localhost-only Desktop Action Bridge and does not require the Desktop WS token.

The `Probe` button runs a Node-side WebSocket handshake from the local Vite server. Use it before `Connect` when the browser only reports a generic WebSocket failure; the probe shows whether the public route returned a relay `404`, an auth failure, a close frame, or a first Desktop response.

## Typical Flow

1. Choose `本地调试` or `远程调试`.
2. Keep the local port at `7082`, or enter the remote `deviceId`.
3. Paste a Desktop app token.
4. Click `探测` if you want to inspect the route/auth layer, then click `连接`.
5. Use `请求调试` to pick a template, edit payload JSON, and send the request.
# tunnel-hub-tester
