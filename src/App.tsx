import {
  Activity,
  Cable,
  CheckCircle2,
  Clipboard,
  Copy,
  Globe2,
  KeyRound,
  ListChecks,
  Play,
  RefreshCcw,
  Route,
  Send,
  Server,
	ShieldCheck,
	Trash2,
	Unplug,
	Upload,
	Wifi,
	XCircle
} from 'lucide-react';
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildDesktopBusinessFrame,
  buildDesktopTokenTransport,
  buildLocalDesktopWsUrl,
  defaultLocalDesktopPort,
  desktopPublicBaseDomain,
  deviceIdFromDesktopHost,
	normalizeDesktopWsUrlInput,
	normalizePort,
	publicHostFromDesktopWsUrl,
	resolveUploadPublicHost,
	type DesktopTokenMode,
	type Namespace,
	type TargetMode
} from './desktopWsProtocol';

type WebSocketStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';
type LogDirection = 'in' | 'out' | 'system' | 'http';

type Settings = {
  targetMode: TargetMode;
  localPort: string;
  remoteTarget: string;
  hubBaseUrl: string;
  registrationDeviceId: string;
  tokenMode: DesktopTokenMode;
};

type Composer = {
	ns: Namespace;
	type: string;
	id: string;
	payload: string;
};

type UploadDraft = {
	chatId: string;
	requestId: string;
	publicHost: string;
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
  url?: string;
  tokenMode?: DesktopTokenMode | 'none';
  statusCode?: number;
  statusMessage?: string;
  protocol?: string;
  acceptValid?: boolean;
  sentFrame?: boolean;
  error?: string;
  body?: string;
  close?: {
    code?: number;
    reason?: string;
  };
  firstMessage?: {
    opcode?: string;
    raw?: string;
    payload?: unknown;
    bytes?: number;
  };
  messages?: Array<{
    opcode?: string;
    raw?: string;
    payload?: unknown;
    bytes?: number;
  }>;
};

const storageKey = 'desktop-request-tester.settings.v2';
const legacyStorageKey = 'desktop-request-tester.settings.v1';
const defaultHubBaseUrl = import.meta.env.VITE_TUNNEL_HUB_BASE_URL || 'https://tunnel-hub.zenmind.cc';
const envRemoteTarget = normalizeDesktopWsUrlInput(import.meta.env.VITE_DESKTOP_PUBLIC_HOST || '');
const defaultRegistrationDeviceId = deviceIdFromDesktopHost(envRemoteTarget) || 'mac-mini-office';

const defaultSettings: Settings = {
  targetMode: 'local',
  localPort: defaultLocalDesktopPort,
  remoteTarget: envRemoteTarget,
  hubBaseUrl: defaultHubBaseUrl,
  registrationDeviceId: defaultRegistrationDeviceId,
  tokenMode: 'query'
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

const desktopWaRequestTypes = ['desktop-defined.wa.action'];

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
      message: '用一句话确认 Desktop WS Server 的 agent-platform namespace 可用',
      agentKey: 'zenmi',
      stream: false,
      includeUsage: true
    }
  },
  { label: 'WA Example', ns: 'wa', type: 'desktop-defined.wa.action', payload: {}, safe: true }
];

const smokeTemplates = templates.filter((template) =>
  template.ns === 'd' &&
  ['session.hello', 'capability.list', 'action.list', 'device.status', 'runtime.info'].includes(
    template.type
  )
);

function defaultTypeForNamespace(ns: Namespace) {
  if (ns === 'd') {
    return 'session.hello';
  }
  if (ns === 'ap') {
    return '/api/agents';
  }
  return 'desktop-defined.wa.action';
}

function requestPrefix(ns: Namespace) {
  return ns === 'd' ? 'desk' : ns;
}

function loadSettings(): Settings {
  try {
    const raw =
      window.localStorage.getItem(storageKey) ??
      window.localStorage.getItem(legacyStorageKey);
    if (!raw) {
      return defaultSettings;
    }

    const stored = JSON.parse(raw) as Partial<Settings> & {
      desktopPublicHost?: unknown;
      remoteDeviceId?: unknown;
      remoteWebSocketUrl?: unknown;
      tokenMode?: unknown;
    };
    const legacyTarget =
      stored.remoteTarget ??
      stored.remoteWebSocketUrl ??
      stored.desktopPublicHost ??
      envRemoteTarget;
    const remoteTarget = normalizeDesktopWsUrlInput(legacyTarget, typeof legacyTarget === 'string' ? legacyTarget : '');
    const registrationDeviceId =
      typeof stored.registrationDeviceId === 'string' && stored.registrationDeviceId.trim()
        ? stored.registrationDeviceId.trim()
        : typeof stored.remoteDeviceId === 'string' && stored.remoteDeviceId.trim()
          ? stored.remoteDeviceId.trim()
          : deviceIdFromDesktopHost(remoteTarget) || defaultRegistrationDeviceId;

    return {
      targetMode: stored.targetMode === 'remote' ? 'remote' : 'local',
      localPort: normalizePort(stored.localPort),
      remoteTarget,
      hubBaseUrl: typeof stored.hubBaseUrl === 'string' && stored.hubBaseUrl.trim()
        ? stored.hubBaseUrl
        : defaultHubBaseUrl,
      registrationDeviceId,
      tokenMode: stored.tokenMode === 'subprotocol' ? 'subprotocol' : 'query'
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

function formatFileSize(size: number) {
	if (!Number.isFinite(size) || size < 0) {
		return '0 B';
	}
	if (size < 1024) {
		return `${size} B`;
	}
	const units = ['KB', 'MB', 'GB'];
	let value = size / 1024;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function isFrameLike(value: unknown): value is {
  ns?: string;
  frame?: string;
  id?: string;
  type?: string;
  code?: number;
} {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function responseStatus(value: unknown) {
  if (!isFrameLike(value)) {
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
  if (!isFrameLike(frame)) {
    return '';
  }
  return typeof frame.id === 'string' ? frame.id : '';
}

function frameKind(frame: unknown) {
  if (!isFrameLike(frame)) {
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
  const record = value as { frame?: string; ns?: string; type?: string; data?: unknown; payload?: unknown };
  if (record.frame !== 'response' || record.ns !== 'd') {
    return [];
  }
  if (record.type !== 'capability.list' && record.type !== 'session.hello') {
    return [];
  }
  const dataSource = record.data ?? record.payload;
  const data = dataSource && typeof dataSource === 'object' && !Array.isArray(dataSource)
    ? dataSource as { requestTypes?: unknown }
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
  const [remoteDesktopTypes, setRemoteDesktopTypes] = useState<string[]>([]);
  const [wsStatus, setWsStatus] = useState<WebSocketStatus>('idle');
  const [busy, setBusy] = useState('');
  const [smokeRunning, setSmokeRunning] = useState(false);
  const [wsProbeRunning, setWsProbeRunning] = useState(false);
	const [composer, setComposer] = useState<Composer>({
		ns: 'd',
		type: 'session.hello',
		id: 'req_hello',
		payload: '{}'
	});
	const [uploadDraft, setUploadDraft] = useState<UploadDraft>({
		chatId: 'chat_upload',
		requestId: '',
		publicHost: ''
	});
	const [uploadFile, setUploadFile] = useState<File | null>(null);
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
  const desktopWsBaseUrl = useMemo(
    () =>
      settings.targetMode === 'local'
        ? buildLocalDesktopWsUrl(localPort)
        : normalizeDesktopWsUrlInput(settings.remoteTarget),
    [localPort, settings.remoteTarget, settings.targetMode]
  );
  const desktopTransport = useMemo(
    () => desktopWsBaseUrl
      ? buildDesktopTokenTransport(desktopWsBaseUrl, settings.tokenMode, desktopToken)
      : null,
    [desktopToken, desktopWsBaseUrl, settings.tokenMode]
  );
	const displayWsUrl = desktopTransport?.url || 'Configure a Desktop WS target';
	const safeDisplayWsUrl = maskSensitiveText(displayWsUrl, [desktopToken]);
	const uploadPublicHost = useMemo(
		() => resolveUploadPublicHost(settings.targetMode, settings.remoteTarget, uploadDraft.publicHost),
		[settings.remoteTarget, settings.targetMode, uploadDraft.publicHost]
	);
	const uploadEndpoint = `${hubOrigin}/api/upload`;
	const requestTypeOptions = useMemo(() => {
    if (composer.ns === 'd') {
      return Array.from(new Set(remoteDesktopTypes.length > 0
        ? remoteDesktopTypes
        : [...desktopImplementedRequestTypes, ...desktopReservedRequestTypes]));
    }
    if (composer.ns === 'ap') {
      return agentPlatformRequestTypes;
    }
    return desktopWaRequestTypes;
  }, [composer.ns, remoteDesktopTypes]);

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
  }, [desktopToken, hubJwt]);

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

  const httpRequest = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const response = await fetch(`/__tester_proxy?url=${encodeURIComponent(url)}`, init);
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
    [addLog]
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
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      socket.close(code, reason);
    }
  }, []);

  useEffect(() => () => closeSocket(1000, 'unmount'), [closeSocket]);

  const connectWebSocket = useCallback(() => {
    closeSocket(1000, 'reconnect');
    if (!desktopTransport) {
      const error = new Error('Remote Desktop WS URL is required');
      setWsStatus('error');
      addLog({ direction: 'system', title: 'WebSocket connect skipped', status: error.message });
      return Promise.reject(error);
    }
    setWsStatus('connecting');
    return new Promise<void>((resolve, reject) => {
      let socket: WebSocket;
      try {
        socket = desktopTransport.protocols
          ? new WebSocket(desktopTransport.url, desktopTransport.protocols)
          : new WebSocket(desktopTransport.url);
      } catch (error) {
        setWsStatus('error');
        addLog({ direction: 'system', title: 'WebSocket connect failed', status: asErrorMessage(error) });
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }

      socketRef.current = socket;
      const timeout = window.setTimeout(() => {
        setWsStatus('error');
        socket.close(1002, 'connect timeout');
        reject(new Error('WebSocket connect timeout'));
      }, 10000);

      socket.onopen = () => {
        window.clearTimeout(timeout);
        setWsStatus('open');
        addLog({
          direction: 'system',
          title: 'WebSocket open',
          status: `${desktopTransport.tokenMode} · ${desktopTransport.url}`
        });
        resolve();
      };
      socket.onerror = () => {
        window.clearTimeout(timeout);
        setWsStatus('error');
        addLog({ direction: 'system', title: 'WebSocket error', status: desktopTransport.url });
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
  }, [addLog, closeSocket, desktopTransport, handleIncoming]);

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
        status: isFrameLike(frame) ? `${String(frame.ns || '')} ${String(frame.type || '')}` : '',
        payload: frame,
        raw: text
      });
      return waiter;
    },
    [addLog]
  );

  const buildFrame = useCallback(
    (ns: Namespace, type: string, payload: unknown, id = nextRequestId(requestPrefix(ns))) =>
      buildDesktopBusinessFrame(ns, type, payload, id),
    [nextRequestId]
  );

  const sendComposedFrame = useCallback(() => {
    try {
      const type = composer.type.trim();
      if (!type) {
        throw new Error('Frame type is required');
      }
      const payload = parseJSON(composer.payload) ?? {};
      const id = composer.id.trim() || nextRequestId(requestPrefix(composer.ns));
      const frame = buildFrame(composer.ns, type, payload, id);
      void transmitFrame(frame);
      setComposer((current) => ({ ...current, id: nextRequestId(requestPrefix(current.ns)) }));
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
      const id = nextRequestId(requestPrefix(template.ns));
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
    if (!desktopWsBaseUrl) {
      addLog({ direction: 'system', title: 'WS probe skipped', status: 'Remote Desktop WS URL is required' });
      return;
    }
    setWsProbeRunning(true);
    try {
      const frame = buildFrame('d', 'session.hello', {}, nextRequestId('probe'));
      const response = await fetch('/__tester_ws_probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: desktopWsBaseUrl,
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
          ? `OK ${probe.stage || 'open'} · ${probe.tokenMode || settings.tokenMode}${probe.elapsedMs !== undefined ? ` · ${probe.elapsedMs}ms` : ''}`
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
  }, [addLog, buildFrame, desktopToken, desktopWsBaseUrl, nextRequestId, settings.tokenMode]);

	const registerDesktopDevice = useCallback(async (rotateToken = false) => {
    if (!hubJwt.trim()) {
      addLog({ direction: 'system', title: 'Desktop registration skipped', status: 'Official JWT is required' });
      return;
    }
    const deviceId = settings.registrationDeviceId.trim();
    if (!deviceId) {
      addLog({ direction: 'system', title: 'Desktop registration skipped', status: 'Registration device ID is required' });
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
          deviceId,
          rotateToken
        })
      });
      const response = payload as DesktopRegisterResponse;
      const nextRemoteTarget = normalizeDesktopWsUrlInput(response.webSocketUrl || response.publicHost);
      if (nextRemoteTarget) {
        patchSettings({
          remoteTarget: nextRemoteTarget,
          registrationDeviceId: response.deviceId || deviceId,
          targetMode: 'remote'
        });
      }
      addLog({
        direction: 'system',
        title: response.rotated ? 'Desktop registration rotated' : 'Desktop registered',
        status: response.webSocketUrl || response.publicHost || response.deviceId,
        payload: response
      });
    } catch (error) {
      addLog({ direction: 'system', title: 'Desktop registration failed', status: asErrorMessage(error) });
    } finally {
      setBusy('');
    }
	}, [addLog, httpRequest, hubJwt, hubOrigin, patchSettings, settings.registrationDeviceId]);

	const uploadAttachment = useCallback(async () => {
		if (!desktopToken.trim()) {
			addLog({ direction: 'system', title: 'Upload skipped', status: 'Desktop token is required' });
			return;
		}
		if (!uploadDraft.chatId.trim()) {
			addLog({ direction: 'system', title: 'Upload skipped', status: 'chatId is required' });
			return;
		}
		if (!uploadPublicHost) {
			addLog({ direction: 'system', title: 'Upload skipped', status: 'publicHost is required' });
			return;
		}
		if (!uploadFile) {
			addLog({ direction: 'system', title: 'Upload skipped', status: 'file is required' });
			return;
		}
		setBusy('upload');
		try {
			const form = new FormData();
			form.set('chatId', uploadDraft.chatId.trim());
			if (uploadDraft.requestId.trim()) {
				form.set('requestId', uploadDraft.requestId.trim());
			}
			form.set('publicHost', uploadPublicHost);
			form.set('file', uploadFile);
			const payload = await httpRequest(uploadEndpoint, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${desktopToken.trim()}`
				},
				body: form
			});
			addLog({
				direction: 'system',
				title: 'Upload completed',
				status: `${uploadFile.name} -> ${uploadDraft.chatId.trim()}`,
				payload
			});
		} catch (error) {
			addLog({ direction: 'system', title: 'Upload failed', status: asErrorMessage(error) });
		} finally {
			setBusy('');
		}
	}, [addLog, desktopToken, httpRequest, uploadDraft.chatId, uploadDraft.requestId, uploadEndpoint, uploadFile, uploadPublicHost]);

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
      patchSettings({ [key]: event.target.value } as Partial<Settings>);
    };
	}

	function updateUploadInput<K extends keyof UploadDraft>(key: K) {
		return (event: ChangeEvent<HTMLInputElement>) => {
			setUploadDraft((current) => ({ ...current, [key]: event.target.value }));
		};
	}

  function updateRemoteTarget(event: ChangeEvent<HTMLInputElement>) {
    patchSettings({ remoteTarget: event.target.value });
  }

  function normalizeRemoteTargetOnBlur() {
    const normalized = normalizeDesktopWsUrlInput(settings.remoteTarget);
    if (!normalized) {
      return;
    }
    patchSettings({
      remoteTarget: normalized,
      registrationDeviceId: settings.registrationDeviceId || deviceIdFromDesktopHost(publicHostFromDesktopWsUrl(normalized))
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
            <h1>Desktop WS Tester</h1>
            <p>{safeDisplayWsUrl}</p>
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
                placeholder={defaultLocalDesktopPort}
              />
            </label>
          ) : (
            <label>
              Desktop WS host or URL
              <input
                value={settings.remoteTarget}
                onBlur={normalizeRemoteTargetOnBlur}
                onChange={updateRemoteTarget}
                placeholder={`zm2tjftlkpdi.${desktopPublicBaseDomain}`}
              />
            </label>
          )}
          <label>
            Desktop Token
            <input
              value={desktopToken}
              onChange={(event) => setDesktopToken(event.target.value)}
              placeholder="粘贴 Desktop/platform auth token"
            />
          </label>
        </div>

        <div className="url-box target-url">
          <span>WebSocket</span>
          <code>{safeDisplayWsUrl}</code>
          <button
            className="icon-button"
            type="button"
            onClick={() => copyText(desktopTransport?.url || '', 'WS URL')}
            aria-label="复制 WebSocket URL"
            disabled={!desktopTransport}
          >
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

			<section className="panel upload-panel">
				<div className="panel-heading">
					<div>
						<h2>附件上传</h2>
						<span>POST /api/upload</span>
					</div>
					<Upload size={18} />
				</div>

				<div className="field-grid upload-grid">
					<label>
						Chat ID
						<input value={uploadDraft.chatId} onChange={updateUploadInput('chatId')} placeholder="chat_xxx" />
					</label>
					<label>
						Request ID
						<input value={uploadDraft.requestId} onChange={updateUploadInput('requestId')} placeholder="optional" />
					</label>
					<label>
						Public Host
						<input
							value={uploadDraft.publicHost}
							onChange={updateUploadInput('publicHost')}
							placeholder={settings.targetMode === 'remote' ? publicHostFromDesktopWsUrl(settings.remoteTarget) : `zmxxxx.${desktopPublicBaseDomain}`}
						/>
					</label>
					<label>
						File
						<input type="file" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} />
					</label>
				</div>

				<div className="url-box upload-url">
					<span>Endpoint</span>
					<code>{uploadEndpoint}</code>
					<span>Host</span>
					<code>{uploadPublicHost || 'manual publicHost required'}</code>
				</div>

				<div className="button-row wrap">
					<button className="primary" type="button" onClick={() => void uploadAttachment()} disabled={busy === 'upload'}>
						<Upload size={16} />
						{busy === 'upload' ? '上传中' : '上传'}
					</button>
					{uploadFile ? <code>{uploadFile.name} · {formatFileSize(uploadFile.size)}</code> : null}
				</div>
			</section>

			<div className="workspace">
        <section className="panel composer-panel">
          <div className="panel-heading">
            <div>
              <h2>请求调试</h2>
              <span>发送 Desktop WS Server business frame</span>
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
                    type: defaultTypeForNamespace(ns),
                    id: nextRequestId(requestPrefix(ns))
                  }));
                }}
              >
                <option value="d">d · desktop</option>
                <option value="ap">ap · agent-platform</option>
                <option value="wa">wa · desktop web namespace</option>
              </select>
            </label>
            <label>
              Type
              <input
                list="request-type-options"
                value={composer.type}
                onChange={(event) =>
                  setComposer((current) => ({
                    ...current,
                    type: event.target.value,
                    id: nextRequestId(requestPrefix(current.ns))
                  }))
                }
              />
              <datalist id="request-type-options">
                {requestTypeOptions.map((type) => (
                  <option key={type} value={type} />
                ))}
              </datalist>
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
                const payload = parseJSON(composer.payload) ?? {};
                setRawFrame(prettyJSON(buildFrame(composer.ns, composer.type, payload, composer.id || nextRequestId(requestPrefix(composer.ns)))));
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
              <span>握手、发送、返回、推送和错误都会在这里出现</span>
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
          <code>Desktop registration · Auth · Raw</code>
        </summary>

        <div className="advanced-grid">
          <section className="panel config-panel">
            <div className="panel-heading">
              <div>
                <h2>连接选项</h2>
                <span>Desktop Token transport mode</span>
              </div>
              <KeyRound size={18} />
            </div>

            <div className="field-grid">
              <label>
                Token mode
                <select value={settings.tokenMode} onChange={updateInput('tokenMode')}>
                  <option value="query">Query token</option>
                  <option value="subprotocol">Subprotocol bearer</option>
                </select>
              </label>
            </div>
          </section>

          <section className="panel config-panel">
            <div className="panel-heading">
              <div>
                <h2>Desktop Registration</h2>
                <span>POST /api/desktop/devices/register</span>
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
              <label className="span-2">
                Registration device ID
                <input value={settings.registrationDeviceId} onChange={updateInput('registrationDeviceId')} />
              </label>
            </div>
            <div className="button-row wrap">
              <button className="primary" type="button" onClick={() => void registerDesktopDevice(false)} disabled={busy === 'desktop-register'}>
                <CheckCircle2 size={16} />
                Register Desktop
              </button>
              <button className="secondary" type="button" onClick={() => void registerDesktopDevice(true)} disabled={busy === 'desktop-register-rotate'}>
                <RefreshCcw size={16} />
                Rotate Register
              </button>
            </div>
          </section>

          <section className="panel raw-panel">
            <div className="panel-heading">
              <div>
                <h2>原始帧</h2>
                <span>需要手写完整 Desktop WS frame 时使用</span>
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
        </div>
      </details>
    </main>
  );
}
