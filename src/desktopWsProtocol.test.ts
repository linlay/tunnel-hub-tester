import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  applyDesktopTokenToUrl,
  buildDesktopBusinessFrame,
  buildDesktopTokenTransport,
  buildLocalDesktopWsUrl,
	normalizeDesktopWsUrlInput,
	resolveUploadPublicHost,
	type Namespace
} from './desktopWsProtocol.ts';

test('bare remote host normalizes to wss host ws path', () => {
  assert.equal(
    normalizeDesktopWsUrlInput('zm2tjftlkpdi.m.zenmind.cc'),
    'wss://zm2tjftlkpdi.m.zenmind.cc/ws'
  );
});

test('local target defaults to Desktop WS Server path', () => {
  assert.equal(buildLocalDesktopWsUrl('7082'), 'ws://127.0.0.1:7082/ws');
});

test('target normalization strips non-protocol query parameters', () => {
  assert.equal(
    normalizeDesktopWsUrlInput('wss://zm2tjftlkpdi.m.zenmind.cc/ws?source=old&deviceId=old'),
    'wss://zm2tjftlkpdi.m.zenmind.cc/ws'
  );
});

test('query token mode appends and replaces token', () => {
  assert.equal(
    applyDesktopTokenToUrl('wss://zm2tjftlkpdi.m.zenmind.cc/ws', 'query', 'desktop-token'),
    'wss://zm2tjftlkpdi.m.zenmind.cc/ws?token=desktop-token'
  );
  assert.equal(
    applyDesktopTokenToUrl('wss://zm2tjftlkpdi.m.zenmind.cc/ws?token=old', 'query', 'new-token'),
    'wss://zm2tjftlkpdi.m.zenmind.cc/ws?token=new-token'
  );
});

test('subprotocol mode sends bearer token and keeps URL tokenless', () => {
	assert.deepEqual(
    buildDesktopTokenTransport('wss://zm2tjftlkpdi.m.zenmind.cc/ws?token=old', 'subprotocol', 'desktop-token'),
    {
      url: 'wss://zm2tjftlkpdi.m.zenmind.cc/ws',
      tokenMode: 'subprotocol',
      protocols: ['bearer.desktop-token']
    }
	);
});

test('upload public host resolves from explicit or remote target only', () => {
	assert.equal(resolveUploadPublicHost('remote', 'zm2tjftlkpdi.m.zenmind.cc'), 'zm2tjftlkpdi.m.zenmind.cc');
	assert.equal(resolveUploadPublicHost('local', 'zm2tjftlkpdi.m.zenmind.cc'), '');
	assert.equal(resolveUploadPublicHost('local', '', 'https://zmupload.m.zenmind.cc/ws'), 'zmupload.m.zenmind.cc');
});

test('business frame builder explicitly supports d ap wa namespaces', () => {
  for (const ns of ['d', 'ap', 'wa'] satisfies Namespace[]) {
    assert.deepEqual(buildDesktopBusinessFrame(ns, ns === 'd' ? 'session.hello' : '/api/agents', {}, 'req_001'), {
      ns,
      frame: 'request',
      type: ns === 'd' ? 'session.hello' : '/api/agents',
      id: 'req_001',
      payload: {}
    });
  }
});

test('App does not expose WebApp reverse proxy primary flow', () => {
  const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
  assert.equal(app.includes('*.wa.zenmind.cc'), false);
  assert.equal(app.includes('WebApp 探测'), false);
  assert.equal(app.includes('Register WebApp'), false);
  assert.equal(app.includes('webapp-register'), false);
  assert.equal(app.includes('runWebAppWebSocketProbe'), false);
  assert.equal(app.includes('sendHttpProbe'), false);
  assert.equal(app.includes('value="app"'), false);
});
