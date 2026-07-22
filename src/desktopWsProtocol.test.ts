import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  applyDesktopTokenToUrl,
	buildDesktopBusinessFrame,
	buildDesktopResourceEndpoint,
	buildDesktopTokenTransport,
	buildDesktopUploadEndpoint,
	buildLocalDesktopWsUrl,
	normalizeDesktopWsUrlInput,
	resolveDesktopPublicHost,
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

test('download public host uses shared desktop public host resolver', () => {
	assert.equal(resolveDesktopPublicHost('remote', 'wss://zmdownload.m.zenmind.cc/ws'), 'zmdownload.m.zenmind.cc');
	assert.equal(resolveDesktopPublicHost('local', 'wss://zmdownload.m.zenmind.cc/ws'), '');
	assert.equal(resolveDesktopPublicHost('local', '', 'zmanual.m.zenmind.cc'), 'zmanual.m.zenmind.cc');
});

test('attachment endpoints are built from the target Desktop public Host', () => {
	assert.equal(
		buildDesktopUploadEndpoint('wss://zmfiles.m.zenmind.cc/ws'),
		'https://zmfiles.m.zenmind.cc/api/upload'
	);
	assert.equal(
		buildDesktopResourceEndpoint('zmfiles.m.zenmind.cc', '/api/resource?file=chat_1%2Fnote.txt'),
		'https://zmfiles.m.zenmind.cc/api/resource?file=chat_1%2Fnote.txt'
	);
	assert.equal(
		buildDesktopResourceEndpoint('zmfiles.m.zenmind.cc', 'chat_1/note.txt'),
		'https://zmfiles.m.zenmind.cc/api/resource?file=chat_1%2Fnote.txt'
	);
	assert.equal(buildDesktopUploadEndpoint('tunnel-hub.zenmind.cc'), '');
	assert.equal(buildDesktopResourceEndpoint('zmfiles.m.zenmind.cc', 'https://example.com/file'), '');
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
	const removedDownloadPath = ['/api', 'download'].join('/');
	const removedPublicHostFieldWrite = ["form.set('", "publicHost'"].join('');
	assert.equal(app.includes('GET /api/resource'), true);
	assert.equal(app.includes(`POST ${removedDownloadPath}`), false);
	assert.equal(app.includes(removedPublicHostFieldWrite), false);
	assert.equal(app.includes('*.wa.zenmind.cc'), false);
	assert.equal(app.includes('WebApp 探测'), false);
  assert.equal(app.includes('Register WebApp'), false);
  assert.equal(app.includes('webapp-register'), false);
  assert.equal(app.includes('runWebAppWebSocketProbe'), false);
  assert.equal(app.includes('sendHttpProbe'), false);
  assert.equal(app.includes('value="app"'), false);
});
