import {
  Activity,
  AlertTriangle,
  Cable,
  CheckCircle2,
  Clipboard,
  Copy,
  Globe2,
  KeyRound,
  Link2,
  ListChecks,
  Play,
  RefreshCcw,
  Route,
  Send,
  Server,
  ShieldCheck,
  Trash2,
  Unplug,
  Wifi,
  XCircle
} from 'lucide-react';
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Namespace = 'd' | 'ap' | 'app';
type TargetMode = 'local' | 'remote';
type WebSocketStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';
type TokenMode = 'query' | 'subprotocol';
type LogDirection = 'in' | 'out' | 'system' | 'http';

type Settings = {
  targetMode: TargetMode;
  localPort: string;
  remoteDeviceId: string;
  hubBaseUrl: string;
  desktopPublicHost: string;
  remoteWebSocketUrl: string;
  desktopBridgeUrl: string;
  serviceName: string;
  webAppName: string;
  webAppPublicUrl: string;
  targetUrl: string;
  wsPath: string;
  source: string;
  clientDeviceId: string;
  tokenMode: TokenMode;
  useHttpProxy: boolean;
};

type Composer = {
  ns: Namespace;
  type: string;
  id: string;
  payload: string;
};

type LogEntry = {
  id: string;
  at: string;
  direction: LogDirection;
  title: string;
  status?: string;
  payload?: unknown;
  raw?: string;
};

type AgentRecord = {
  token: {
    id: string;
    name: string;
    tokenPrefix: string;
    active: boolean;
    createdAt: string;
    lastUsedAt?: string;
  };
  online: boolean;
  sessionId?: string;
  remoteAddr?: string;
  connectedAt?: string;
  routeCount: number;
  routes: Array<{
    id: string;
    publicHost: string;
    targetUrl: string;
    active: boolean;
    tokenId?: string;
  }>;
};

type ServicePublishResponse = {
  publicHost: string;
  publicUrl: string;
  route: {
    id: string;
    publicHost: string;
    targetUrl: string;
    tokenId?: string;
    active: boolean;
  };
};

type DesktopRegisterResponse = {
  deviceId: string;
  publicHost: string;
  publicUrl: string;
  webSocketUrl: string;
  relayUrl: string;
  targetUrl: string;
  tokenId: string;
  agentToken?: string;
  created: boolean;
  rotated: boolean;
};

type DesktopWebAppRegisterResponse = {
  deviceId: string;
  name: string;
  publicHost: string;
  publicUrl: string;
  targetUrl: string;
  routeId: string;
  active: boolean;
};

type DesktopActionDefinition = {
  name: string;
  kind: string;
  category: string;
  description: string;
};

type Template = {
  label: string;
  ns: Namespace;
  type: string;
  payload: unknown;
  safe?: boolean;
};

type WsProbeResponse = {
  ok?: boolean;
  stage?: string;
  opened?: boolean;
  elapsedMs?: number;
  statusCode?: number;
  statusMessage?: string;
  error?: string;
  close?: {
    code?: number;
    reason?: string;
  };
  messages?: Array<{
    opcode?: string;
    raw?: string;
    payload?: unknown;
    bytes?: number;
  }>;
};

const storageKey = 'desktop-request-tester.settings.v1';
const defaultHubBaseUrl = import.meta.env.VITE_TUNNEL_HUB_BASE_URL || 'https://tunnel-hub.zenmind.cc';
const defaultPublicBaseDomain = 'tunnel-hub.zenmind.cc';
const defaultDesktopHost =
  import.meta.env.VITE_DESKTOP_PUBLIC_HOST || 'mac-mini-office.tunnel-hub.zenmind.cc';
const defaultRemoteWebSocketUrl = defaultDesktopHost;
const defaultRemoteDeviceId = deviceIdFromPublicHost(defaultDesktopHost) || 'mac-mini-office';

const defaultSettings: Settings = {
  targetMode: 'local',
  localPort: '7082',
  remoteDeviceId: defaultRemoteDeviceId,
  hubBaseUrl: defaultHubBaseUrl,
  desktopPublicHost: defaultDesktopHost,
  remoteWebSocketUrl: defaultRemoteWebSocketUrl,
  desktopBridgeUrl: 'http://127.0.0.1:11788',
  serviceName: 'mac-mini-office',
  webAppName: 'notes',
  webAppPublicUrl: '',
  targetUrl: 'http://127.0.0.1:7080',
  wsPath: '/ws',
  source: '',
  clientDeviceId: '',
  tokenMode: 'query',
  useHttpProxy: true
};

const desktopImplementedRequestTypes = [
  'session.hello',
  'auth.refresh',
  'capability.list',
  'event.subscribe',
  'event.unsubscribe',
  'action.list',
  'action.call',
  'snapshot.get',
  'issue.create',
  'issue.update',
  'issue.delete',
  'issue.move',
  'device.status',
  'runtime.info',
  'service.list',
  'service.get',
  'service.status',
  'assistant.startRun',
  'agent.list',
  'automation.list'
];

const desktopReservedRequestTypes = [
  'issue.claim',
  'issue.transition',
  'issue.assignRun',
  'issue.dispatchDesktop',
  'issue.label.set',
  'issue.dependency.create',
  'issue.dependency.delete',
  'service.logs.meta',
  'service.logs.read',
  'service.start',
  'service.stop',
  'service.restart',
  'assistant.agents',
  'assistant.chats',
  'assistant.chat',
  'assistant.stopRun',
  'assistant.submitAwaiting',
  'agent.get',
  'agent.create',
  'agent.update',
  'agent.delete',
  'automation.get',
  'automation.create',
  'automation.update',
  'automation.toggle',
  'automation.delete',
  'automation.executions',
  'page.context',
  'page.read',
  'page.interact',
  'page.fillForm',
  'page.submitForm',
  'embeddedWeb.surfaces',
  'embeddedWeb.active',
  'embeddedWeb.activate',
  'embeddedWeb.context',
  'embeddedWeb.navigate',
  'embeddedWeb.reload',
  'embeddedWeb.back',
  'embeddedWeb.tab.open',
  'embeddedWeb.tab.close',
  'embeddedWeb.tab.switch',
  'embeddedWeb.read',
  'embeddedWeb.executeScript',
  'web.list',
  'webapp.status',
  'webapp.start',
  'webapp.stop',
  'webapp.restart',
  'staticServer.list',
  'staticServer.start',
  'staticServer.stop',
  'staticServer.restart',
  'setting.get',
  'setting.validatePatch',
  'setting.previewPatch',
  'setting.applyPatch',
  'market.settings',
  'market.list',
  'market.refresh',
  'market.get',
  'market.install',
  'market.update',
  'market.uninstall',
  'help.current',
  'help.search',
  'help.open',
  'help.explain',
  'help.suggest',
  'diagnostic.report',
  'diagnostic.status'
];

const agentPlatformRequestTypes = [
  '/api/locale',
  '/api/agents',
  '/api/agent',
  '/api/agent/model-config',
  '/api/model-options',
  '/api/teams',
  '/api/chats',
  '/api/chat',
  '/api/chat/jsonl',
  '/api/read',
  '/api/feedback',
  '/api/chat/delete',
  '/api/chat/rename',
  '/api/chat/archive',
  '/api/archives',
  '/api/archive',
  '/api/archives/search',
  '/api/archive/delete',
  '/api/automations',
  '/api/automation',
  '/api/automation/executions',
  '/api/chats/search',
  '/api/query',
  '/api/attach',
  '/api/detach',
  '/api/submit',
  '/api/steer',
  '/api/interrupt',
  '/api/access-level',
  '/api/terminal/open',
  '/api/terminal/input',
  '/api/terminal/resize',
  '/api/terminal/close',
  '/api/remember',
  '/api/learn',
  '/api/compact',
  '/api/memory/meta',
  '/api/memory/context-preview',
  '/api/memory/scope/list',
  '/api/memory/scope/detail',
  '/api/memory/scope/save',
  '/api/memory/scope/validate',
  '/api/memory/record/list',
  '/api/memory/record/detail',
  '/api/viewport',
  '/api/resource',
  '/api/upload',
  '/api/pull'
];

const templates: Template[] = [
  { label: 'Hello', ns: 'd', type: 'session.hello', payload: {}, safe: true },
  { label: 'Capabilities', ns: 'd', type: 'capability.list', payload: {}, safe: true },
  { label: 'Actions', ns: 'd', type: 'action.list', payload: {}, safe: true },
  { label: 'Device', ns: 'd', type: 'device.status', payload: {}, safe: true },
  { label: 'Runtime', ns: 'd', type: 'runtime.info', payload: {}, safe: true },
  { label: 'Services', ns: 'd', type: 'service.list', payload: {}, safe: true },
  { label: 'Desktop Agents', ns: 'd', type: 'agent.list', payload: {}, safe: true },
  { label: 'Automations', ns: 'd', type: 'automation.list', payload: {}, safe: true },
  {
    label: 'Subscribe',
    ns: 'd',
    type: 'event.subscribe',
    payload: {
      types: ['device.status', 'service.changed', 'agent.catalog.updated', 'automation.changed']
    },
    safe: true
  },
  {
    label: 'Tunnel Status',
    ns: 'd',
    type: 'action.call',
    payload: {
      action: 'desktop.tunnelHub.getStatus',
      args: {},
      source: { agentKey: 'desktop-request-tester' }
    },
    safe: true
  },
  {
    label: 'Settings Read',
    ns: 'd',
    type: 'action.call',
    payload: {
      action: 'desktop.settings.getState',
      args: {},
      source: { agentKey: 'desktop-request-tester' }
    },
    safe: true
  },
  { label: 'AP Agents', ns: 'ap', type: '/api/agents', payload: { includeChats: 3 }, safe: true },
  { label: 'AP Models', ns: 'ap', type: '/api/model-options', payload: {}, safe: true },
  { label: 'AP Chats', ns: 'ap', type: '/api/chats', payload: {}, safe: true },
  {
    label: 'AP Query JSON',
    ns: 'ap',
    type: '/api/query',
    payload: {
      message: '用一句话确认 WebSocket 桥接可用',
      agentKey: 'zenmi',
      stream: false,
      includeUsage: true
    }
  },
  { label: 'App Agents', ns: 'app', type: '/api/agents', payload: { includeChats: 3 }, safe: true },
  { label: 'App Models', ns: 'app', type: '/api/model-options', payload: {}, safe: true },
  { label: 'App Chats', ns: 'app', type: '/api/chats', payload: {}, safe: true },
  {
    label: 'App Query JSON',
    ns: 'app',
    type: '/api/query',
    payload: {
      message: '用一句话确认 app-server WebSocket 可用',
      agentKey: 'zenmi',
      stream: false,
      includeUsage: true
    }
  }
];

const smokeTemplates = templates.filter((template) =>
  ['session.hello', 'capability.list', 'action.list', 'device.status', 'runtime.info'].includes(
    template.type
  )
);

function deviceIdFromPublicHost(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  const host = trimmed
    .replace(/^https?:\/\//u, '')
    .replace(/^wss?:\/\//u, '')
    .split('/')[0]
    .toLowerCase();
  const suffix = `.${defaultPublicBaseDomain}`;
  if (host.endsWith(suffix)) {
    return host.slice(0, -suffix.length);
  }
  return host.split('.')[0] || '';
}

function localPortFromTargetUrl(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }
  try {
    const parsed = new URL(value.trim());
    if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') {
      return parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
    }
  } catch {
    const match = /(?:127\.0\.0\.1|localhost):(\d+)/u.exec(value);
    if (match) {
      return match[1];
    }
  }
  return '';
}

function normalizePort(value: unknown, fallback = '7082') {
  if (typeof value !== 'string') {
    return fallback;
  }
  const match = /^\d{1,5}$/u.exec(value.trim());
  if (!match) {
    return fallback;
  }
  const port = Number(match[0]);
  return port > 0 && port <= 65535 ? String(port) : fallback;
}

function normalizeDeviceId(value: unknown, fallback = defaultRemoteDeviceId) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = deviceIdFromPublicHost(value) || value.trim().toLowerCase();
  return normalized || fallback;
}

function normalizeWsPath(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return '/ws';
  }
  const path = value.trim();
  return path.startsWith('/') ? path : `/${path}`;
}

function webSocketUrlFromPublicHost(publicHost: unknown, path: unknown = '/ws') {
  const host = typeof publicHost === 'string' && publicHost.trim()
    ? publicHost
      .trim()
      .replace(/^https?:\/\//u, '')
      .replace(/^wss?:\/\//u, '')
      .split('/')[0]
    : defaultDesktopHost;
  return `wss://${host}${normalizeWsPath(path)}`;
}

function parseWebSocketUrlInput(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const trimmed = value.trim();
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//iu.test(trimmed) ? trimmed : `wss://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol === 'http:') {
      url.protocol = 'ws:';
    } else if (url.protocol === 'https:') {
      url.protocol = 'wss:';
    }
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
      return null;
    }
    if (!url.pathname || url.pathname === '/') {
      url.pathname = '/ws';
    }
    return url;
  } catch {
    return null;
  }
}

function normalizeRemoteWebSocketUrl(value: unknown, fallback = webSocketUrlFromPublicHost(defaultDesktopHost)) {
  return parseWebSocketUrlInput(value)?.toString() || fallback;
}

function normalizeRemoteUrlInput(value: unknown, fallback = defaultDesktopHost) {
  const url = parseWebSocketUrlInput(value);
  if (!url) {
    return fallback;
  }
  const path = url.pathname && url.pathname !== '/ws' ? url.pathname : '';
  return `${url.host}${path}${url.search}${url.hash}`;
}

function publicHostFromWebSocketUrl(value: unknown) {
  const url = parseWebSocketUrlInput(value);
  return url ? url.host : '';
}

function httpOriginFromWebSocketUrl(value: unknown, fallback: string) {
  const url = parseWebSocketUrlInput(value);
  if (!url) {
    return fallback;
  }
  url.protocol = url.protocol === 'ws:' ? 'http:' : 'https:';
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/u, '');
}

function parseHttpUrlInput(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const trimmed = value.trim();
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//iu.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function normalizePublicHttpUrlInput(value: unknown, fallback = '') {
  const url = parseHttpUrlInput(value);
  if (!url) {
    return fallback;
  }
  const path = url.pathname && url.pathname !== '/' ? url.pathname : '';
  return `${url.host}${path}${url.search}${url.hash}`;
}

function httpOriginFromPublicUrl(value: unknown) {
  const url = parseHttpUrlInput(value);
  if (!url) {
    return '';
  }
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/u, '');
}

function webSocketUrlFromPublicUrl(value: unknown, path: unknown) {
  const url = parseHttpUrlInput(value);
  if (!url) {
    return '';
  }
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const normalizedPath = typeof path === 'string' && path.trim()
    ? path.trim()
    : '/';
  url.pathname = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return defaultSettings;
    }
    const stored = JSON.parse(raw) as Partial<Settings>;
    const localPort = normalizePort(stored.localPort, localPortFromTargetUrl(stored.targetUrl) || defaultSettings.localPort);
    const remoteDeviceId = normalizeDeviceId(stored.remoteDeviceId || deviceIdFromPublicHost(stored.desktopPublicHost));
    const desktopPublicHost = stored.desktopPublicHost || `${remoteDeviceId}.${defaultPublicBaseDomain}`;
    const targetMode: TargetMode =
      stored.targetMode === 'remote' || stored.targetMode === 'local'
        ? stored.targetMode
        : localPortFromTargetUrl(stored.targetUrl)
          ? 'local'
          : 'remote';
    const remoteWebSocketUrl = normalizeRemoteUrlInput(
      stored.remoteWebSocketUrl || webSocketUrlFromPublicHost(desktopPublicHost, stored.wsPath),
      normalizeRemoteUrlInput(webSocketUrlFromPublicHost(desktopPublicHost, stored.wsPath))
    );
    return {
      ...defaultSettings,
      ...stored,
      targetMode,
      localPort,
      remoteDeviceId,
      remoteWebSocketUrl,
      wsPath: normalizeWsPath(stored.wsPath),
      desktopPublicHost,
      webAppName: typeof stored.webAppName === 'string' && stored.webAppName.trim() ? stored.webAppName.trim() : defaultSettings.webAppName,
      webAppPublicUrl: normalizePublicHttpUrlInput(stored.webAppPublicUrl, stored.webAppPublicUrl || ''),
      targetUrl: stored.targetUrl || `http://127.0.0.1:${localPort}`
    };
  } catch {
    return defaultSettings;
  }
}

function persistSettings(settings: Settings) {
  window.localStorage.setItem(storageKey, JSON.stringify(settings));
}

function normalizeOrigin(value: string, fallback: string) {
  const trimmed = value.trim() || fallback;
  const withProtocol = /^https?:\/\//u.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/u, '');
}

function prettyJSON(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function parseJSON(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  return JSON.parse(trimmed) as unknown;
}

function shortTime() {
  return new Date().toLocaleTimeString([], { hour12: false });
}

function statusLabel(status: WebSocketStatus) {
  switch (status) {
    case 'connecting':
      return 'Connecting';
    case 'open':
      return 'Open';
    case 'closed':
      return 'Closed';
    case 'error':
      return 'Error';
    default:
      return 'Idle';
  }
}

function isResponseLike(value: unknown): value is { frame?: string; id?: string; code?: number } {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function responseStatus(value: unknown) {
  if (!isResponseLike(value)) {
    return '';
  }
  const frame = String(value.frame || '');
  if (frame === 'response') {
    return typeof value.code === 'number' && value.code === 0 ? 'OK' : `Code ${value.code}`;
  }
  if (frame === 'error') {
    return typeof value.code === 'number' ? `Error ${value.code}` : 'Error';
  }
  return frame;
}

function frameId(frame: unknown) {
  if (!isResponseLike(frame)) {
    return '';
  }
  return typeof frame.id === 'string' ? frame.id : '';
}

function frameKind(frame: unknown) {
  if (!isResponseLike(frame)) {
    return '';
  }
  return typeof frame.frame === 'string' ? frame.frame : '';
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function desktopRequestTypesFromFrame(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  const record = value as { frame?: string; ns?: string; type?: string; data?: unknown };
  if (record.frame !== 'response' || record.ns !== 'd') {
    return [];
  }
  if (record.type !== 'capability.list' && record.type !== 'session.hello') {
    return [];
  }
  const data = record.data && typeof record.data === 'object' && !Array.isArray(record.data)
    ? record.data as { requestTypes?: unknown }
    : {};
  return readStringArray(data.requestTypes);
}

function asErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function maskSensitiveText(value: string, secrets: string[]) {
  let masked = value.replace(/([?&]token=)[^&\s]+/gu, '$1***');
  masked = masked.replace(/(Authorization:\s*Bearer\s+)[^\s"']+/giu, '$1***');
  for (const secret of secrets) {
    const trimmed = secret.trim();
    if (trimmed) {
      masked = masked.replaceAll(trimmed, '***');
    }
  }
  return masked;
}

function sanitizeLogValue(value: unknown, secrets: string[], key = ''): unknown {
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value === 'string') {
    if (/token|authorization|api.?key|secret/iu.test(key)) {
      return value ? '***' : value;
    }
    return maskSensitiveText(value, secrets);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item, secrets));
  }
  if (typeof value === 'object') {
    if (/token|authorization|api.?key|secret/iu.test(key)) {
      return '***';
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeLogValue(entryValue, secrets, entryKey)
      ])
    );
  }
  return value;
}

export function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [desktopToken, setDesktopToken] = useState('');
  const [hubJwt, setHubJwt] = useState('');
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [selectedTokenId, setSelectedTokenId] = useState('');
  const [bridgeStatus, setBridgeStatus] = useState<'unknown' | 'open' | 'error'>('unknown');
  const [bridgeActions, setBridgeActions] = useState<DesktopActionDefinition[]>([]);
  const [remoteDesktopTypes, setRemoteDesktopTypes] = useState<string[]>([]);
  const [bridgeActionName, setBridgeActionName] = useState('desktop.tunnelHub.getStatus');
  const [bridgePayload, setBridgePayload] = useState(prettyJSON({
    action: 'desktop.tunnelHub.getStatus',
    args: {},
    source: { agentKey: 'desktop-request-tester' }
  }));
  const [cdpPayload, setCdpPayload] = useState(prettyJSON({
    method: 'Runtime.evaluate',
    params: { expression: 'document.title', returnByValue: true }
  }));
  const [wsStatus, setWsStatus] = useState<WebSocketStatus>('idle');
  const [busy, setBusy] = useState('');
  const [smokeRunning, setSmokeRunning] = useState(false);
  const [wsProbeRunning, setWsProbeRunning] = useState(false);
  const [httpPath, setHttpPath] = useState('/ws');
  const [httpMethod, setHttpMethod] = useState('GET');
  const [httpBody, setHttpBody] = useState('');
  const [webAppWsPath, setWebAppWsPath] = useState('/ws');
  const [webAppWsPayload, setWebAppWsPayload] = useState('ping');
  const [composer, setComposer] = useState<Composer>({
    ns: 'd',
    type: 'session.hello',
    id: 'req_hello',
    payload: '{}'
  });
  const [rawFrame, setRawFrame] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef(
    new Map<
      string,
      {
        resolve: (frame: unknown) => void;
        reject: (error: Error) => void;
        timer: number;
      }
    >()
  );
  const requestSeq = useRef(0);

  const hubOrigin = useMemo(
    () => normalizeOrigin(settings.hubBaseUrl, defaultHubBaseUrl),
    [settings.hubBaseUrl]
  );
  const localPort = useMemo(() => normalizePort(settings.localPort), [settings.localPort]);
  const remoteDeviceId = useMemo(() => normalizeDeviceId(settings.remoteDeviceId), [settings.remoteDeviceId]);
  const remotePublicHost = useMemo(() => `${remoteDeviceId}.${defaultPublicBaseDomain}`, [remoteDeviceId]);
  const remoteDesktopOrigin = useMemo(
    () => httpOriginFromWebSocketUrl(settings.remoteWebSocketUrl, `https://${remotePublicHost}`),
    [remotePublicHost, settings.remoteWebSocketUrl]
  );
  const desktopOrigin = useMemo(
    () =>
      settings.targetMode === 'local'
        ? `http://127.0.0.1:${localPort}`
        : remoteDesktopOrigin,
    [localPort, remoteDesktopOrigin, settings.targetMode]
  );
  const bridgeOrigin = useMemo(
    () => normalizeOrigin(settings.desktopBridgeUrl, 'http://127.0.0.1:11788'),
    [settings.desktopBridgeUrl]
  );
  const webAppHttpOrigin = useMemo(
    () => httpOriginFromPublicUrl(settings.webAppPublicUrl),
    [settings.webAppPublicUrl]
  );
  const webAppWsUrl = useMemo(
    () => webSocketUrlFromPublicUrl(settings.webAppPublicUrl, webAppWsPath),
    [settings.webAppPublicUrl, webAppWsPath]
  );
  const desktopWsUrl = useMemo(() => {
    const url = settings.targetMode === 'local'
      ? new URL(normalizeWsPath(settings.wsPath), desktopOrigin)
      : new URL(normalizeRemoteWebSocketUrl(settings.remoteWebSocketUrl, webSocketUrlFromPublicHost(remotePublicHost, settings.wsPath)));
    if (settings.targetMode === 'local') {
      url.protocol = 'ws:';
    }
    if (settings.source.trim()) {
      url.searchParams.set('source', settings.source.trim());
    }
    if (settings.clientDeviceId.trim()) {
      url.searchParams.set('deviceId', settings.clientDeviceId.trim());
    }
    if (settings.tokenMode === 'query' && desktopToken.trim()) {
      url.searchParams.set('token', desktopToken.trim());
    }
    return url.toString();
  }, [desktopOrigin, desktopToken, remotePublicHost, settings.clientDeviceId, settings.remoteWebSocketUrl, settings.source, settings.targetMode, settings.tokenMode, settings.wsPath]);

  const availableTypes = composer.ns === 'd'
    ? (remoteDesktopTypes.length > 0 ? remoteDesktopTypes : [...desktopImplementedRequestTypes, ...desktopReservedRequestTypes])
    : agentPlatformRequestTypes;

  const selectedAgent = agents.find((agent) => agent.token.id === selectedTokenId) ?? null;
  const bridgeAction = bridgeActions.find((action) => action.name === bridgeActionName) ?? null;

  const addLog = useCallback((entry: Omit<LogEntry, 'id' | 'at'>) => {
    const secrets = [desktopToken, hubJwt];
    setLogs((current) => [
      {
        ...entry,
        status: entry.status ? maskSensitiveText(entry.status, secrets) : undefined,
        payload: sanitizeLogValue(entry.payload, secrets),
        raw: entry.raw ? maskSensitiveText(entry.raw, secrets) : undefined,
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        at: shortTime()
      },
      ...current
    ].slice(0, 240));
  }, [hubJwt, desktopToken]);

  const patchSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      persistSettings(next);
      return next;
    });
  }, []);

  const nextRequestId = useCallback((prefix = 'req') => {
    requestSeq.current += 1;
    return `${prefix}_${Date.now().toString(36)}_${requestSeq.current}`;
  }, []);

  const withProxy = useCallback(
    (url: string) => (settings.useHttpProxy ? `/__tester_proxy?url=${encodeURIComponent(url)}` : url),
    [settings.useHttpProxy]
  );

  const httpRequest = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const response = await fetch(withProxy(url), init);
      const text = await response.text();
      let payload: unknown = text;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }
      addLog({
        direction: 'http',
        title: `${init.method || 'GET'} ${url}`,
        status: `${response.status} ${response.statusText}`,
        payload
      });
      if (!response.ok) {
        throw new Error(typeof payload === 'string' ? payload : prettyJSON(payload));
      }
      return payload;
    },
    [addLog, withProxy]
  );

  const handleIncoming = useCallback(
    (raw: string) => {
      let payload: unknown = raw;
      try {
        payload = JSON.parse(raw);
      } catch {
        // Keep raw text for non-JSON frames.
      }
      addLog({
        direction: 'in',
        title: 'WebSocket message',
        status: responseStatus(payload),
        payload,
        raw
      });

      const id = frameId(payload);
      const kind = frameKind(payload);
      const requestTypes = desktopRequestTypesFromFrame(payload);
      if (requestTypes.length > 0) {
        setRemoteDesktopTypes(requestTypes);
      }
      if (id && (kind === 'response' || kind === 'error')) {
        const pending = pendingRef.current.get(id);
        if (pending) {
          window.clearTimeout(pending.timer);
          pendingRef.current.delete(id);
          pending.resolve(payload);
        }
      }
    },
    [addLog]
  );

  const closeSocket = useCallback((code = 1000, reason = 'closed') => {
    for (const pending of pendingRef.current.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(new Error('WebSocket closed'));
    }
    pendingRef.current.clear();
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close(code, reason);
    }
  }, []);

  useEffect(() => () => closeSocket(1000, 'unmount'), [closeSocket]);

  const connectWebSocket = useCallback(() => {
    closeSocket(1000, 'reconnect');
    setWsStatus('connecting');
    return new Promise<void>((resolve, reject) => {
      const protocols =
        settings.tokenMode === 'subprotocol' && desktopToken.trim()
          ? [`bearer.${desktopToken.trim()}`]
          : undefined;
      const socket = protocols ? new WebSocket(desktopWsUrl, protocols) : new WebSocket(desktopWsUrl);
      socketRef.current = socket;
      const timeout = window.setTimeout(() => {
        setWsStatus('error');
        socket.close(1002, 'connect timeout');
        reject(new Error('WebSocket connect timeout'));
      }, 10000);

      socket.onopen = () => {
        window.clearTimeout(timeout);
        setWsStatus('open');
        addLog({ direction: 'system', title: 'WebSocket open', status: desktopWsUrl });
        resolve();
      };
      socket.onerror = () => {
        window.clearTimeout(timeout);
        setWsStatus('error');
        addLog({ direction: 'system', title: 'WebSocket error', status: desktopWsUrl });
        reject(new Error('WebSocket connection failed'));
      };
      socket.onclose = (event) => {
        window.clearTimeout(timeout);
        setWsStatus((current) => (current === 'error' ? current : 'closed'));
        addLog({
          direction: 'system',
          title: 'WebSocket closed',
          status: `${event.code}${event.reason ? ` ${event.reason}` : ''}`
        });
      };
      socket.onmessage = (event) => {
        if (typeof event.data === 'string') {
          handleIncoming(event.data);
        } else {
          void new Response(event.data).text().then(handleIncoming);
        }
      };
    });
  }, [addLog, closeSocket, desktopToken, desktopWsUrl, handleIncoming, settings.tokenMode]);

  const transmitFrame = useCallback(
    (frame: unknown, awaitReply = false) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket is not open');
      }
      const text = JSON.stringify(frame);
      const id = frameId(frame);
      let waiter: Promise<unknown> | null = null;
      if (awaitReply && id) {
        waiter = new Promise((resolve, reject) => {
          const timer = window.setTimeout(() => {
            pendingRef.current.delete(id);
            reject(new Error(`Timed out waiting for ${id}`));
          }, 15000);
          pendingRef.current.set(id, { resolve, reject, timer });
        });
      }
      socket.send(text);
      addLog({
        direction: 'out',
        title: 'WebSocket send',
        status: isResponseLike(frame) ? `${String((frame as { ns?: string }).ns || 'd')} ${String((frame as { type?: string }).type || '')}` : '',
        payload: frame,
        raw: text
      });
      return waiter;
    },
    [addLog]
  );

  const buildFrame = useCallback(
    (ns: Namespace, type: string, payload: unknown, id = nextRequestId(ns === 'd' ? 'desk' : ns)) => ({
      ...(ns === 'app' ? {} : { ns }),
      frame: 'request',
      type,
      id,
      ...(payload === undefined ? {} : { payload })
    }),
    [nextRequestId]
  );

  const sendComposedFrame = useCallback(() => {
    try {
      const payload = parseJSON(composer.payload);
      const id = composer.id.trim() || nextRequestId(composer.ns === 'd' ? 'desk' : composer.ns);
      const frame = buildFrame(composer.ns, composer.type, payload, id);
      void transmitFrame(frame);
      setComposer((current) => ({ ...current, id: nextRequestId(current.ns === 'd' ? 'desk' : current.ns) }));
    } catch (error) {
      addLog({ direction: 'system', title: 'Send failed', status: asErrorMessage(error) });
    }
  }, [addLog, buildFrame, composer, nextRequestId, transmitFrame]);

  const sendRawFrame = useCallback(() => {
    try {
      const frame = parseJSON(rawFrame);
      void transmitFrame(frame);
    } catch (error) {
      addLog({ direction: 'system', title: 'Raw send failed', status: asErrorMessage(error) });
    }
  }, [addLog, rawFrame, transmitFrame]);

  const applyTemplate = useCallback(
    (template: Template) => {
      const id = nextRequestId(template.ns === 'd' ? 'desk' : template.ns);
      const nextComposer = {
        ns: template.ns,
        type: template.type,
        id,
        payload: prettyJSON(template.payload)
      };
      setComposer(nextComposer);
      setRawFrame(prettyJSON(buildFrame(template.ns, template.type, template.payload, id)));
    },
    [buildFrame, nextRequestId]
  );

  const runSmoke = useCallback(async () => {
    setSmokeRunning(true);
    try {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        await connectWebSocket();
      }
      for (const template of smokeTemplates) {
        const frame = buildFrame(template.ns, template.type, template.payload);
        const response = await transmitFrame(frame, true);
        const status = responseStatus(response);
        if (frameKind(response) === 'error') {
          throw new Error(`${template.type}: ${status}`);
        }
      }
      addLog({ direction: 'system', title: 'Smoke runner finished', status: 'OK' });
    } catch (error) {
      addLog({ direction: 'system', title: 'Smoke runner failed', status: asErrorMessage(error) });
    } finally {
      setSmokeRunning(false);
    }
  }, [addLog, buildFrame, connectWebSocket, transmitFrame]);

  const runWebSocketProbe = useCallback(async () => {
    setWsProbeRunning(true);
    try {
      const frame = buildFrame('d', 'session.hello', {}, nextRequestId('probe'));
      const response = await fetch('/__tester_ws_probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: desktopWsUrl,
          tokenMode: settings.tokenMode,
          token: desktopToken.trim(),
          frame,
          timeoutMs: 9000
        })
      });
      const text = await response.text();
      let payload: unknown = text;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = text;
      }
      const probe = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as WsProbeResponse
        : {};
      for (const message of probe.messages || []) {
        const requestTypes = desktopRequestTypesFromFrame(message.payload);
        if (requestTypes.length > 0) {
          setRemoteDesktopTypes(requestTypes);
        }
      }
      addLog({
        direction: 'system',
        title: 'WS probe',
        status: probe.ok
          ? `OK ${probe.stage || 'open'}${probe.elapsedMs !== undefined ? ` · ${probe.elapsedMs}ms` : ''}`
          : `${probe.statusCode ? `${probe.statusCode} ${probe.statusMessage || ''}` : probe.stage || 'failed'}${probe.error ? ` · ${probe.error}` : ''}`,
        payload
      });
      if (!response.ok) {
        throw new Error(typeof payload === 'string' ? payload : prettyJSON(payload));
      }
    } catch (error) {
      addLog({ direction: 'system', title: 'WS probe failed', status: asErrorMessage(error) });
    } finally {
      setWsProbeRunning(false);
    }
  }, [addLog, buildFrame, desktopToken, desktopWsUrl, nextRequestId, settings.tokenMode]);

  const fetchAgents = useCallback(async () => {
    setBusy('agents');
    try {
      const payload = await httpRequest(`${hubOrigin}/api/admin/agents`, {
        headers: hubJwt.trim() ? { Authorization: `Bearer ${hubJwt.trim()}` } : undefined
      });
      const nextAgents = Array.isArray(payload) ? (payload as AgentRecord[]) : [];
      setAgents(nextAgents);
      const preferred =
        nextAgents.find((agent) => agent.online && agent.token.name === settings.serviceName) ??
        nextAgents.find((agent) => agent.online) ??
        nextAgents[0];
      if (preferred) {
        setSelectedTokenId(preferred.token.id);
      }
    } catch (error) {
      addLog({ direction: 'system', title: 'Agent load failed', status: asErrorMessage(error) });
    } finally {
      setBusy('');
    }
  }, [addLog, hubJwt, httpRequest, hubOrigin, settings.serviceName]);

  const publishService = useCallback(async () => {
    if (!selectedTokenId) {
      addLog({ direction: 'system', title: 'Publish skipped', status: 'Select an agent token first' });
      return;
    }
    setBusy('publish');
    try {
      const payload = await httpRequest(`${hubOrigin}/api/admin/services/${settings.serviceName.trim()}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${hubJwt.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          targetUrl: settings.targetUrl.trim(),
          tokenId: selectedTokenId,
          active: true
        })
      });
      const response = payload as ServicePublishResponse;
      if (response.publicHost) {
        patchSettings({
          desktopPublicHost: response.publicHost,
          remoteDeviceId: normalizeDeviceId(response.publicHost),
          remoteWebSocketUrl: normalizeRemoteUrlInput(webSocketUrlFromPublicHost(response.publicHost, settings.wsPath)),
          targetMode: 'remote'
        });
      }
    } catch (error) {
      addLog({ direction: 'system', title: 'Publish failed', status: asErrorMessage(error) });
    } finally {
      setBusy('');
    }
  }, [addLog, hubJwt, httpRequest, hubOrigin, patchSettings, selectedTokenId, settings.serviceName, settings.targetUrl, settings.wsPath]);

  const registerDesktopDevice = useCallback(async (rotateToken = false) => {
    if (!hubJwt.trim()) {
      addLog({ direction: 'system', title: 'Desktop registration skipped', status: 'Official JWT is required' });
      return;
    }
    setBusy(rotateToken ? 'desktop-register-rotate' : 'desktop-register');
    try {
      const payload = await httpRequest(`${hubOrigin}/api/desktop/devices/register`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hubJwt.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deviceId: remoteDeviceId,
          rotateToken
        })
      });
      const response = payload as DesktopRegisterResponse;
      if (response.publicHost) {
        patchSettings({
          desktopPublicHost: response.publicHost,
          remoteDeviceId: normalizeDeviceId(response.publicHost),
          remoteWebSocketUrl: normalizeRemoteUrlInput(response.webSocketUrl || response.publicHost),
          targetMode: 'remote'
        });
      }
      addLog({
        direction: 'system',
        title: response.rotated ? 'Desktop registration rotated' : 'Desktop registered',
        status: response.publicHost || response.deviceId,
        payload: response
      });
    } catch (error) {
      addLog({ direction: 'system', title: 'Desktop registration failed', status: asErrorMessage(error) });
    } finally {
      setBusy('');
    }
  }, [addLog, hubJwt, httpRequest, hubOrigin, patchSettings, remoteDeviceId]);

  const registerDesktopWebApp = useCallback(async () => {
    if (!hubJwt.trim()) {
      addLog({ direction: 'system', title: 'WebApp registration skipped', status: 'Official JWT is required' });
      return;
    }
    const name = settings.webAppName.trim();
    if (!name) {
      addLog({ direction: 'system', title: 'WebApp registration skipped', status: 'WebApp name is required' });
      return;
    }
    setBusy('webapp-register');
    try {
      const payload = await httpRequest(`${hubOrigin}/api/desktop/devices/${encodeURIComponent(remoteDeviceId)}/webapps/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${hubJwt.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          targetUrl: settings.targetUrl.trim(),
          active: true
        })
      });
      const response = payload as DesktopWebAppRegisterResponse;
      if (response.publicHost) {
        patchSettings({
          webAppPublicUrl: normalizePublicHttpUrlInput(response.publicUrl || response.publicHost, response.publicHost)
        });
      }
      addLog({
        direction: 'system',
        title: 'WebApp registered',
        status: response.publicHost || response.name,
        payload: response
      });
    } catch (error) {
      addLog({ direction: 'system', title: 'WebApp registration failed', status: asErrorMessage(error) });
    } finally {
      setBusy('');
    }
  }, [addLog, hubJwt, httpRequest, hubOrigin, patchSettings, remoteDeviceId, settings.targetUrl, settings.webAppName]);

  const checkBridgeHealth = useCallback(async () => {
    setBusy('bridge-health');
    try {
      await httpRequest(`${bridgeOrigin}/health`);
      setBridgeStatus('open');
    } catch (error) {
      setBridgeStatus('error');
      addLog({ direction: 'system', title: 'Bridge health failed', status: asErrorMessage(error) });
    } finally {
      setBusy('');
    }
  }, [addLog, bridgeOrigin, httpRequest]);

  const loadBridgeActions = useCallback(async () => {
    setBusy('bridge-actions');
    try {
      const payload = await httpRequest(`${bridgeOrigin}/actions`);
      const actions = (payload && typeof payload === 'object' && Array.isArray((payload as { actions?: unknown }).actions))
        ? ((payload as { actions: DesktopActionDefinition[] }).actions)
        : [];
      setBridgeActions(actions);
      setBridgeStatus('open');
      if (actions.length > 0 && !actions.some((action) => action.name === bridgeActionName)) {
        setBridgeActionName(actions[0].name);
        setBridgePayload(prettyJSON({
          action: actions[0].name,
          args: {},
          source: { agentKey: 'desktop-request-tester' }
        }));
      }
    } catch (error) {
      setBridgeStatus('error');
      addLog({ direction: 'system', title: 'Bridge actions failed', status: asErrorMessage(error) });
    } finally {
      setBusy('');
    }
  }, [addLog, bridgeActionName, bridgeOrigin, httpRequest]);

  const callBridgeAction = useCallback(async () => {
    setBusy('bridge-call');
    try {
      await httpRequest(`${bridgeOrigin}/actions/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parseJSON(bridgePayload) ?? {})
      });
      setBridgeStatus('open');
    } catch (error) {
      addLog({ direction: 'system', title: 'Bridge action failed', status: asErrorMessage(error) });
    } finally {
      setBusy('');
    }
  }, [addLog, bridgeOrigin, bridgePayload, httpRequest]);

  const callBridgeCdp = useCallback(async () => {
    setBusy('bridge-cdp');
    try {
      await httpRequest(`${bridgeOrigin}/cdp/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parseJSON(cdpPayload) ?? {})
      });
      setBridgeStatus('open');
    } catch (error) {
      addLog({ direction: 'system', title: 'Bridge CDP failed', status: asErrorMessage(error) });
    } finally {
      setBusy('');
    }
  }, [addLog, bridgeOrigin, cdpPayload, httpRequest]);

  const deleteService = useCallback(async () => {
    setBusy('delete-service');
    try {
      await httpRequest(`${hubOrigin}/api/admin/services/${settings.serviceName.trim()}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${hubJwt.trim()}`
        }
      });
    } catch (error) {
      addLog({ direction: 'system', title: 'Delete route failed', status: asErrorMessage(error) });
    } finally {
      setBusy('');
    }
  }, [addLog, hubJwt, httpRequest, hubOrigin, settings.serviceName]);

  const sendHttpProbe = useCallback(async () => {
    setBusy('http');
    try {
      if (!webAppHttpOrigin) {
        throw new Error('WebApp URL is required');
      }
      const url = new URL(httpPath || '/', `${webAppHttpOrigin}/`);
      await httpRequest(url.toString(), {
        method: httpMethod,
        headers: httpBody.trim() ? { 'Content-Type': 'application/json' } : undefined,
        body: httpMethod === 'GET' || httpMethod === 'HEAD' ? undefined : httpBody
      });
    } catch (error) {
      addLog({ direction: 'system', title: 'HTTP probe failed', status: asErrorMessage(error) });
    } finally {
      setBusy('');
    }
  }, [addLog, httpBody, httpMethod, httpPath, httpRequest, webAppHttpOrigin]);

  const runWebAppWebSocketProbe = useCallback(() => {
    setBusy('webapp-ws');
    return new Promise<void>((resolve) => {
      try {
        if (!webAppWsUrl) {
          throw new Error('WebApp URL is required');
        }
        const socket = new WebSocket(webAppWsUrl);
        let settled = false;
        const timeout = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          socket.close(1002, 'probe timeout');
          addLog({ direction: 'system', title: 'WebApp WS timeout', status: webAppWsUrl });
          setBusy('');
          resolve();
        }, 10000);
        const finish = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          setBusy('');
          resolve();
        };
        socket.onopen = () => {
          addLog({ direction: 'system', title: 'WebApp WS open', status: webAppWsUrl });
          if (webAppWsPayload.trim()) {
            socket.send(webAppWsPayload);
            addLog({ direction: 'out', title: 'WebApp WS send', status: webAppWsUrl, raw: webAppWsPayload });
          }
        };
        socket.onmessage = (event) => {
          const read = typeof event.data === 'string'
            ? Promise.resolve(event.data)
            : new Response(event.data).text();
          void read.then((raw) => {
            let payload: unknown = raw;
            try {
              payload = JSON.parse(raw);
            } catch {
              // Keep raw text for non-JSON webapp frames.
            }
            addLog({ direction: 'in', title: 'WebApp WS message', status: webAppWsUrl, payload, raw });
            socket.close(1000, 'probe complete');
            finish();
          });
        };
        socket.onerror = () => {
          addLog({ direction: 'system', title: 'WebApp WS error', status: webAppWsUrl });
          finish();
        };
        socket.onclose = (event) => {
          addLog({ direction: 'system', title: 'WebApp WS closed', status: `${event.code}${event.reason ? ` ${event.reason}` : ''}` });
          finish();
        };
      } catch (error) {
        addLog({ direction: 'system', title: 'WebApp WS failed', status: asErrorMessage(error) });
        setBusy('');
        resolve();
      }
    });
  }, [addLog, webAppWsPayload, webAppWsUrl]);

  const probeHubMetrics = useCallback(async () => {
    setBusy('metrics');
    try {
      await httpRequest(`${hubOrigin}/api/admin/metrics`, {
        headers: hubJwt.trim() ? { Authorization: `Bearer ${hubJwt.trim()}` } : undefined
      });
    } catch (error) {
      addLog({ direction: 'system', title: 'Metrics probe failed', status: asErrorMessage(error) });
    } finally {
      setBusy('');
    }
  }, [addLog, hubJwt, httpRequest, hubOrigin]);

  const formatPayload = useCallback(() => {
    try {
      setComposer((current) => ({ ...current, payload: prettyJSON(parseJSON(current.payload) ?? {}) }));
    } catch (error) {
      addLog({ direction: 'system', title: 'Format failed', status: asErrorMessage(error) });
    }
  }, [addLog]);

  const copyText = useCallback(
    (text: string, label: string) => {
      void navigator.clipboard.writeText(text).then(
        () => addLog({ direction: 'system', title: 'Copied', status: label }),
        (error) => addLog({ direction: 'system', title: 'Copy failed', status: asErrorMessage(error) })
      );
    },
    [addLog]
  );

  function updateInput<K extends keyof Settings>(key: K) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = event.target.type === 'checkbox'
        ? (event.target as HTMLInputElement).checked
        : event.target.value;
      patchSettings({ [key]: value } as Partial<Settings>);
    };
  }

  function updateRemoteWebSocketUrl(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    const publicHost = publicHostFromWebSocketUrl(value);
    const remoteWebSocketUrl = publicHost ? normalizeRemoteUrlInput(value) : value;
    patchSettings({
      remoteWebSocketUrl,
      ...(publicHost
        ? {
          desktopPublicHost: publicHost,
          remoteDeviceId: normalizeDeviceId(publicHost)
        }
        : {})
    });
  }

  function updateWebAppPublicUrl(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    patchSettings({
      webAppPublicUrl: normalizePublicHttpUrlInput(value, value)
    });
  }

  function statusIcon() {
    if (wsStatus === 'open') {
      return <CheckCircle2 size={16} />;
    }
    if (wsStatus === 'error') {
      return <XCircle size={16} />;
    }
    if (wsStatus === 'connecting') {
      return <RefreshCcw size={16} />;
    }
    return <Wifi size={16} />;
  }

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <Cable size={22} />
          </div>
          <div>
            <h1>Desktop Request Tester</h1>
            <p>{desktopWsUrl.replace(desktopToken, desktopToken ? '***' : '')}</p>
          </div>
        </div>
        <div className={`socket-pill ${wsStatus}`}>
          {statusIcon()}
          {statusLabel(wsStatus)}
        </div>
      </header>

      <section className="panel target-panel">
        <div className="mode-tabs" role="tablist" aria-label="调试模式">
          <button
            className={settings.targetMode === 'local' ? 'active' : ''}
            type="button"
            onClick={() => patchSettings({ targetMode: 'local' })}
          >
            <Server size={16} />
            本地调试
          </button>
          <button
            className={settings.targetMode === 'remote' ? 'active' : ''}
            type="button"
            onClick={() => patchSettings({ targetMode: 'remote' })}
          >
            <Globe2 size={16} />
            远程调试
          </button>
        </div>

        <div className="target-grid">
          {settings.targetMode === 'local' ? (
            <label>
              本地端口
              <input
                inputMode="numeric"
                value={settings.localPort}
                onChange={updateInput('localPort')}
                placeholder="7082"
              />
            </label>
          ) : (
            <label>
              URL
              <input
                value={settings.remoteWebSocketUrl}
                onChange={updateRemoteWebSocketUrl}
                placeholder="zma7bxd2v33a.m.zenmind.cc"
              />
            </label>
          )}
          <label>
            Desktop Token
            <input
              value={desktopToken}
              onChange={(event) => setDesktopToken(event.target.value)}
              placeholder="粘贴 Desktop app token"
            />
          </label>
        </div>

        <div className="url-box target-url">
          <span>WebSocket</span>
          <code>{desktopWsUrl.replace(desktopToken, desktopToken ? '***' : '')}</code>
          <button className="icon-button" type="button" onClick={() => copyText(desktopWsUrl, 'WS URL')} aria-label="复制 WebSocket URL">
            <Copy size={16} />
          </button>
        </div>

        <div className="button-row wrap">
          <button className="primary" type="button" onClick={() => void connectWebSocket()} disabled={wsStatus === 'connecting'}>
            <Wifi size={16} />
            连接
          </button>
          <button className="secondary" type="button" onClick={() => void runWebSocketProbe()} disabled={wsProbeRunning}>
            <Activity size={16} />
            {wsProbeRunning ? '探测中' : '探测'}
          </button>
          <button className="secondary" type="button" onClick={() => closeSocket(1000, 'manual close')}>
            <Unplug size={16} />
            断开
          </button>
          <button className="secondary" type="button" onClick={() => void runSmoke()} disabled={smokeRunning}>
            <Play size={16} />
            {smokeRunning ? '运行中' : '快速检查'}
          </button>
        </div>
      </section>

      <div className="workspace">
        <section className="panel composer-panel">
          <div className="panel-heading">
            <div>
              <h2>请求调试</h2>
              <span>选择模板、编辑参数，然后发送 WebSocket 请求</span>
            </div>
            <ListChecks size={18} />
          </div>

          <div className="template-grid">
            {templates.map((template) => (
              <button
                className={template.safe ? 'template safe' : 'template'}
                key={`${template.ns}-${template.type}-${template.label}`}
                type="button"
                onClick={() => applyTemplate(template)}
              >
                <span>{template.label}</span>
                <code>{template.ns}:{template.type}</code>
              </button>
            ))}
          </div>

          <div className="field-grid composer-grid">
            <label>
              Namespace
              <select
                value={composer.ns}
                onChange={(event) => {
                  const ns = event.target.value as Namespace;
                  setComposer((current) => ({
                    ...current,
                    ns,
                    type: ns === 'd' ? 'session.hello' : '/api/agents',
                    id: nextRequestId(ns === 'd' ? 'desk' : ns)
                  }));
                }}
              >
                <option value="d">d · desktop</option>
                <option value="ap">ap · agent-platform bridge</option>
                <option value="app">app · agent-platform</option>
              </select>
            </label>
            <label>
              Type
              <select
                value={composer.type}
                onChange={(event) =>
                  setComposer((current) => ({
                    ...current,
                    type: event.target.value,
                    id: nextRequestId(current.ns === 'd' ? 'desk' : current.ns)
                  }))
                }
              >
                {availableTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Request ID
              <input
                value={composer.id}
                onChange={(event) => setComposer((current) => ({ ...current, id: event.target.value }))}
              />
            </label>
          </div>

          <label className="textarea-label">
            Payload JSON
            <textarea
              value={composer.payload}
              onChange={(event) => setComposer((current) => ({ ...current, payload: event.target.value }))}
              spellCheck={false}
            />
          </label>

          <div className="button-row">
            <button className="primary" type="button" onClick={sendComposedFrame}>
              <Send size={16} />
              发送
            </button>
            <button className="secondary" type="button" onClick={formatPayload}>
              <Clipboard size={16} />
              格式化
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => {
                const payload = parseJSON(composer.payload);
                setRawFrame(prettyJSON(buildFrame(composer.ns, composer.type, payload, composer.id || nextRequestId())));
              }}
            >
              <Copy size={16} />
              生成原始帧
            </button>
          </div>
        </section>

        <section className="panel log-panel">
          <div className="panel-heading">
            <div>
              <h2>响应日志</h2>
              <span>发送、返回、推送和错误都会在这里出现</span>
            </div>
            <div className="button-row tight">
              <button
                className="icon-button"
                type="button"
                onClick={() => copyText(prettyJSON(sanitizeLogValue(logs, [desktopToken, hubJwt])), 'logs')}
                aria-label="复制日志"
              >
                <Copy size={16} />
              </button>
              <button className="icon-button" type="button" onClick={() => setLogs([])} aria-label="清空日志">
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          <div className="log-list">
            {logs.length === 0 ? (
              <div className="empty-log">还没有请求记录</div>
            ) : (
              logs.map((entry) => (
                <details className={`log-entry ${entry.direction}`} key={entry.id} open={entry.direction === 'system'}>
                  <summary>
                    <span className="log-time">{entry.at}</span>
                    <span className="log-direction">{entry.direction}</span>
                    <strong>{entry.title}</strong>
                    {entry.status ? <code>{entry.status}</code> : null}
                  </summary>
                  {entry.payload !== undefined ? <pre>{typeof entry.payload === 'string' ? entry.payload : prettyJSON(entry.payload)}</pre> : null}
                  {entry.raw && typeof entry.payload !== 'string' ? <pre>{entry.raw}</pre> : null}
                </details>
              ))
            )}
          </div>
        </section>
      </div>

      <details className="advanced-tools">
        <summary>
          <span>
            <Route size={16} />
            高级工具
          </span>
          <code>Admin · Bridge · Raw · HTTP</code>
        </summary>

        <div className="advanced-grid">
          <section className="panel config-panel">
            <div className="panel-heading">
              <div>
                <h2>连接选项</h2>
                <span>仅在需要自定义握手参数时调整</span>
              </div>
              <KeyRound size={18} />
            </div>

            <div className="field-grid two">
              <label>
                WS path
                <input value={settings.wsPath} onChange={updateInput('wsPath')} />
              </label>
              <label>
                Token mode
                <select value={settings.tokenMode} onChange={updateInput('tokenMode')}>
                  <option value="query">Query token</option>
                  <option value="subprotocol">Subprotocol</option>
                </select>
              </label>
              <label>
                Source
                <input value={settings.source} onChange={updateInput('source')} />
              </label>
              <label>
                Client device
                <input value={settings.clientDeviceId} onChange={updateInput('clientDeviceId')} />
              </label>
            </div>
          </section>

          <section className="panel config-panel">
            <div className="panel-heading">
              <div>
                <h2>Tunnel Hub Admin</h2>
                <span>使用官网 JWT 注册 Desktop、WebApp 或 legacy route</span>
              </div>
              <ShieldCheck size={18} />
            </div>
            <div className="field-grid two">
              <label className="span-2">
                Tunnel Hub
                <input value={settings.hubBaseUrl} onChange={updateInput('hubBaseUrl')} />
              </label>
              <label className="span-2">
                Official JWT
                <input value={hubJwt} onChange={(event) => setHubJwt(event.target.value)} placeholder="eyJ..." />
              </label>
              <label>
                Legacy service
                <input value={settings.serviceName} onChange={updateInput('serviceName')} />
              </label>
              <label>
                WebApp name
                <input value={settings.webAppName} onChange={updateInput('webAppName')} />
              </label>
              <label>
                Target URL
                <input value={settings.targetUrl} onChange={updateInput('targetUrl')} />
              </label>
              <label>
                WebApp URL
                <input value={settings.webAppPublicUrl} onChange={updateWebAppPublicUrl} placeholder="zwaexample.wa.zenmind.cc" />
              </label>
              <label className="span-2">
                Agent token
                <select value={selectedTokenId} onChange={(event) => setSelectedTokenId(event.target.value)}>
                  <option value="">Select an agent token</option>
                  {agents.map((agent) => (
                    <option key={agent.token.id} value={agent.token.id}>
                      {agent.online ? 'online' : 'offline'} · {agent.token.name} · {agent.token.tokenPrefix}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {selectedAgent ? (
              <div className={`agent-summary ${selectedAgent.online ? 'online' : 'offline'}`}>
                <span>{selectedAgent.online ? 'Online' : 'Offline'}</span>
                <strong>{selectedAgent.token.name}</strong>
                <code>{selectedAgent.sessionId || 'no session'}</code>
              </div>
            ) : null}
            <div className="button-row wrap">
              <button className="secondary" type="button" onClick={() => patchSettings({ targetUrl: 'http://127.0.0.1:7080' })}>
                <Server size={16} />
                App 7080
              </button>
              <button className="secondary" type="button" onClick={() => patchSettings({ targetUrl: 'http://127.0.0.1:7082' })}>
                <Wifi size={16} />
                Desktop 7082
              </button>
              <button className="secondary" type="button" onClick={() => void fetchAgents()} disabled={busy === 'agents'}>
                <RefreshCcw size={16} />
                Agents
              </button>
              <button className="secondary" type="button" onClick={() => void probeHubMetrics()} disabled={busy === 'metrics'}>
                <Activity size={16} />
                Metrics
              </button>
              <button className="primary" type="button" onClick={() => void registerDesktopDevice(false)} disabled={busy === 'desktop-register'}>
                <CheckCircle2 size={16} />
                Register Desktop
              </button>
              <button className="secondary" type="button" onClick={() => void registerDesktopDevice(true)} disabled={busy === 'desktop-register-rotate'}>
                <RefreshCcw size={16} />
                Rotate Register
              </button>
              <button className="primary" type="button" onClick={() => void registerDesktopWebApp()} disabled={busy === 'webapp-register'}>
                <Globe2 size={16} />
                Register WebApp
              </button>
              <button className="primary" type="button" onClick={() => void publishService()} disabled={busy === 'publish'}>
                <Link2 size={16} />
                Publish Legacy
              </button>
              <button className="danger" type="button" onClick={() => void deleteService()} disabled={busy === 'delete-service'}>
                <Trash2 size={16} />
                Delete
              </button>
            </div>
          </section>

          <section className="panel bridge-panel">
            <div className="panel-heading">
              <div>
                <h2>Desktop Bridge</h2>
                <span>本机 Action Bridge 和 CDP 调用</span>
              </div>
              <KeyRound size={18} />
            </div>

            <div className={`bridge-state ${bridgeStatus}`}>
              <span>{bridgeStatus === 'unknown' ? 'Not checked' : bridgeStatus === 'open' ? 'Open' : 'Error'}</span>
              <code>{bridgeOrigin}</code>
            </div>

            <div className="button-row wrap">
              <button className="secondary" type="button" onClick={() => void checkBridgeHealth()} disabled={busy === 'bridge-health'}>
                <Activity size={16} />
                Health
              </button>
              <button className="secondary" type="button" onClick={() => void loadBridgeActions()} disabled={busy === 'bridge-actions'}>
                <ListChecks size={16} />
                Actions
              </button>
              <button className="secondary" type="button" onClick={() => copyText(bridgeOrigin, 'bridge URL')}>
                <Copy size={16} />
                Copy
              </button>
            </div>

            <label>
              Action
              <select
                value={bridgeActionName}
                onChange={(event) => {
                  const action = event.target.value;
                  setBridgeActionName(action);
                  setBridgePayload(prettyJSON({
                    action,
                    args: {},
                    source: { agentKey: 'desktop-request-tester' }
                  }));
                }}
              >
                {bridgeActions.length === 0 ? (
                  <option value={bridgeActionName}>{bridgeActionName}</option>
                ) : (
                  bridgeActions.map((action) => (
                    <option key={action.name} value={action.name}>
                      {action.category} · {action.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            {bridgeAction ? (
              <div className="action-meta">
                <span>{bridgeAction.kind}</span>
                <strong>{bridgeAction.category}</strong>
                <p>{bridgeAction.description}</p>
              </div>
            ) : null}

            <label className="textarea-label compact">
              Action request
              <textarea value={bridgePayload} onChange={(event) => setBridgePayload(event.target.value)} spellCheck={false} />
            </label>
            <div className="button-row wrap">
              <button className="primary" type="button" onClick={() => void callBridgeAction()} disabled={busy === 'bridge-call'}>
                <Send size={16} />
                Call Action
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  try {
                    setBridgePayload(prettyJSON(parseJSON(bridgePayload) ?? {}));
                  } catch (error) {
                    addLog({ direction: 'system', title: 'Bridge format failed', status: asErrorMessage(error) });
                  }
                }}
              >
                <Clipboard size={16} />
                Format
              </button>
            </div>

            <details className="raw-frame">
              <summary>CDP call</summary>
              <textarea value={cdpPayload} onChange={(event) => setCdpPayload(event.target.value)} spellCheck={false} />
              <div className="button-row">
                <button className="secondary" type="button" onClick={() => void callBridgeCdp()} disabled={busy === 'bridge-cdp'}>
                  <Send size={16} />
                  Call CDP
                </button>
              </div>
            </details>
          </section>

          <section className="panel raw-panel">
            <div className="panel-heading">
              <div>
                <h2>原始帧</h2>
                <span>需要手写完整 WebSocket frame 时使用</span>
              </div>
              <Clipboard size={18} />
            </div>
            <textarea value={rawFrame} onChange={(event) => setRawFrame(event.target.value)} spellCheck={false} />
            <div className="button-row wrap">
              <button className="secondary" type="button" onClick={sendRawFrame}>
                <Send size={16} />
                Send raw
              </button>
              <button className="secondary" type="button" onClick={() => copyText(rawFrame, 'raw frame')}>
                <Copy size={16} />
                Copy
              </button>
            </div>
          </section>

          <section className="panel http-panel">
            <div className="panel-heading">
              <div>
                <h2>WebApp 探测</h2>
                <span>访问 browser-facing 的 *.wa HTTP 或 WebSocket 入口</span>
              </div>
              <button
                className={`toggle ${settings.useHttpProxy ? 'on' : ''}`}
                type="button"
                onClick={() => patchSettings({ useHttpProxy: !settings.useHttpProxy })}
              >
                {settings.useHttpProxy ? 'Proxy' : 'Direct'}
              </button>
            </div>
            <label>
              WebApp URL
              <input value={settings.webAppPublicUrl} onChange={updateWebAppPublicUrl} placeholder="zwaexample.wa.zenmind.cc" />
            </label>
            <div className="field-grid http-grid">
              <label>
                Method
                <select value={httpMethod} onChange={(event) => setHttpMethod(event.target.value)}>
                  <option>GET</option>
                  <option>POST</option>
                  <option>PUT</option>
                  <option>DELETE</option>
                </select>
              </label>
              <label>
                Path
                <input value={httpPath} onChange={(event) => setHttpPath(event.target.value)} />
              </label>
            </div>
            <label className="textarea-label compact">
              Body
              <textarea value={httpBody} onChange={(event) => setHttpBody(event.target.value)} spellCheck={false} />
            </label>
            <div className="button-row wrap">
              <button className="secondary" type="button" onClick={() => void sendHttpProbe()} disabled={busy === 'http'}>
                <Globe2 size={16} />
                Send HTTP
              </button>
              <button className="secondary" type="button" onClick={() => setHttpPath('/')}>
                <Server size={16} />
                Root
              </button>
              <button className="secondary" type="button" onClick={() => setHttpPath('/api/agents')}>
                <Activity size={16} />
                API Path
              </button>
            </div>
            <div className="field-grid http-grid">
              <label>
                WS Path
                <input value={webAppWsPath} onChange={(event) => setWebAppWsPath(event.target.value)} />
              </label>
              <label>
                WS Payload
                <input value={webAppWsPayload} onChange={(event) => setWebAppWsPayload(event.target.value)} />
              </label>
            </div>
            <div className="url-box target-url">
              <span>WebApp WS</span>
              <code>{webAppWsUrl || 'Configure WebApp URL'}</code>
              <button className="icon-button" type="button" onClick={() => copyText(webAppWsUrl, 'WebApp WS URL')} aria-label="复制 WebApp WebSocket URL" disabled={!webAppWsUrl}>
                <Copy size={16} />
              </button>
            </div>
            <div className="button-row wrap">
              <button className="secondary" type="button" onClick={() => void runWebAppWebSocketProbe()} disabled={busy === 'webapp-ws'}>
                <Wifi size={16} />
                Send WS
              </button>
              <button className="secondary" type="button" onClick={() => setWebAppWsPath('/ws')}>
                <Server size={16} />
                WS Path
              </button>
            </div>
            <div className="note">
              <AlertTriangle size={15} />
              <span>WebApp 不使用 Desktop Token；这里不会发送 ns=wa 业务帧。</span>
            </div>
          </section>
        </div>
      </details>
    </main>
  );
}
