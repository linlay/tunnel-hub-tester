export type Namespace = 'd' | 'ap' | 'wa';
export type TargetMode = 'local' | 'remote';
export type DesktopTokenMode = 'query' | 'subprotocol';

export type DesktopBusinessFrame = {
  ns: Namespace;
  frame: 'request';
  type: string;
  id: string;
  payload: unknown;
};

export const defaultDesktopWsPath = '/ws';
export const defaultLocalDesktopPort = '7082';
export const desktopPublicBaseDomain = 'm.zenmind.cc';

export function normalizePort(value: unknown, fallback = defaultLocalDesktopPort) {
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

export function normalizeDesktopWsPath() {
  return defaultDesktopWsPath;
}

export function buildLocalDesktopWsUrl(port: unknown = defaultLocalDesktopPort) {
  return `ws://127.0.0.1:${normalizePort(port)}${defaultDesktopWsPath}`;
}

export function normalizeDesktopWsUrlInput(value: unknown, fallback = '') {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
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
      return fallback;
    }
    url.pathname = defaultDesktopWsPath;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return fallback;
  }
}

export function normalizeRemoteTargetInput(value: unknown, fallback = '') {
  const normalized = normalizeDesktopWsUrlInput(value, fallback);
  if (!normalized) {
    return fallback;
  }
  const url = new URL(normalized);
  return `${url.host}${url.search}`;
}

export function publicHostFromDesktopWsUrl(value: unknown) {
  const normalized = normalizeDesktopWsUrlInput(value);
  if (!normalized) {
    return '';
  }
  return new URL(normalized).host;
}

export function deviceIdFromDesktopHost(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }
  const host = value
    .trim()
    .replace(/^https?:\/\//u, '')
    .replace(/^wss?:\/\//u, '')
    .split('/')[0]
    .toLowerCase();
  const suffix = `.${desktopPublicBaseDomain}`;
  return host.endsWith(suffix) ? host.slice(0, -suffix.length) : host.split('.')[0] || '';
}

export function applyDesktopTokenToUrl(rawUrl: string, tokenMode: DesktopTokenMode, token: string) {
  const target = new URL(normalizeDesktopWsUrlInput(rawUrl, rawUrl));
  target.searchParams.delete('token');
  if (tokenMode === 'query' && token.trim()) {
    target.searchParams.set('token', token.trim());
  }
  return target.toString();
}

export function desktopSubprotocol(token: string) {
  const trimmed = token.trim();
  return trimmed ? `bearer.${trimmed}` : undefined;
}

export function buildDesktopTokenTransport(rawUrl: string, tokenMode: DesktopTokenMode, token: string) {
  const url = applyDesktopTokenToUrl(rawUrl, tokenMode, token);
  const protocol = tokenMode === 'subprotocol' ? desktopSubprotocol(token) : undefined;
  return {
    url,
    tokenMode,
    protocols: protocol ? [protocol] : undefined
  };
}

export function buildDesktopBusinessFrame(
  ns: Namespace,
  type: string,
  payload: unknown,
  id: string
): DesktopBusinessFrame {
  return {
    ns,
    frame: 'request',
    type,
    id,
    payload: payload === undefined ? {} : payload
  };
}
