import type { IncomingMessage, ServerResponse } from 'node:http';
import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import { connect as connectNet, type Socket } from 'node:net';
import { connect as connectTls, type TLSSocket } from 'node:tls';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import {
  buildDesktopTokenTransport,
  normalizeDesktopWsUrlInput,
  type DesktopTokenMode
} from './src/desktopWsProtocol';

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'origin'
]);

const websocketGuid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

type ProbeSocket = Socket | TLSSocket;

type WsProbeRequest = {
  url?: string;
  token?: string;
  tokenMode?: DesktopTokenMode | 'none';
  frame?: unknown;
  timeoutMs?: number;
};

type WsProbeMessage = {
  opcode: 'text' | 'binary';
  raw?: string;
  payload?: unknown;
  bytes?: number;
};

type WsProbeResult = {
  ok: boolean;
  stage: 'handshake' | 'open' | 'message' | 'close' | 'timeout' | 'error';
  opened: boolean;
  elapsedMs: number;
  url?: string;
  tokenMode?: WsProbeRequest['tokenMode'];
  statusCode?: number;
  statusMessage?: string;
  headers?: Record<string, string>;
  acceptValid?: boolean;
  protocol?: string;
  sentFrame?: boolean;
  firstMessage?: WsProbeMessage;
  messages?: WsProbeMessage[];
  close?: { code?: number; reason: string };
  body?: string;
  error?: string;
};

function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(chunks.length > 0 ? Buffer.concat(chunks) : undefined));
    req.on('error', reject);
  });
}

function headersFromRequest(req: IncomingMessage) {
  const headers = new Headers();
  for (const [key, rawValue] of Object.entries(req.headers)) {
    const normalized = key.toLowerCase();
    if (hopByHopHeaders.has(normalized) || normalized.startsWith('sec-')) {
      continue;
    }
    if (Array.isArray(rawValue)) {
      headers.set(key, rawValue.join(', '));
    } else if (typeof rawValue === 'string') {
      headers.set(key, rawValue);
    }
  }
  return headers;
}

function writeJSON(res: ServerResponse, statusCode: number, payload: unknown) {
  res.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  });
  res.end(JSON.stringify(payload, null, 2));
}

function safeJSONStringify(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function tryParseJSON(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function readFrameMeta(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const record = value as { frame?: unknown; id?: unknown; type?: unknown; code?: unknown };
  return {
    frame: typeof record.frame === 'string' ? record.frame : '',
    id: typeof record.id === 'string' ? record.id : '',
    type: typeof record.type === 'string' ? record.type : '',
    code: typeof record.code === 'number' ? record.code : undefined
  };
}

function sanitizeProbeUrl(value: string, token?: string) {
  try {
    const url = new URL(value);
    if (url.searchParams.has('token')) {
      url.searchParams.set('token', '***');
    }
    const text = url.toString();
    return token ? text.replaceAll(token, '***') : text;
  } catch {
    return token ? value.replaceAll(token, '***') : value;
  }
}

function buildProbeTransport(rawURL: string, tokenMode: WsProbeRequest['tokenMode'], token?: string) {
  const normalized = normalizeDesktopWsUrlInput(rawURL);
  if (!normalized) {
    throw new Error('Only ws and wss targets are supported.');
  }
  if (tokenMode === 'none') {
    const target = new URL(normalized);
    target.searchParams.delete('token');
    return {
      url: target.toString(),
      protocols: undefined
    };
  }
  return buildDesktopTokenTransport(normalized, tokenMode || 'query', token || '');
}

function parseHeaders(lines: string[]) {
  const headers: Record<string, string> = {};
  for (const line of lines) {
    const index = line.indexOf(':');
    if (index <= 0) {
      continue;
    }
    headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return headers;
}

function encodeClientFrame(opcode: number, payload: Buffer) {
  const mask = randomBytes(4);
  const length = payload.length;
  const header: number[] = [0x80 | opcode];
  if (length < 126) {
    header.push(0x80 | length);
  } else if (length < 65536) {
    header.push(0x80 | 126, (length >> 8) & 0xff, length & 0xff);
  } else {
    const high = Math.floor(length / 2 ** 32);
    const low = length >>> 0;
    header.push(
      0x80 | 127,
      (high >> 24) & 0xff,
      (high >> 16) & 0xff,
      (high >> 8) & 0xff,
      high & 0xff,
      (low >> 24) & 0xff,
      (low >> 16) & 0xff,
      (low >> 8) & 0xff,
      low & 0xff
    );
  }
  const masked = Buffer.alloc(payload.length);
  for (let index = 0; index < payload.length; index += 1) {
    masked[index] = payload[index] ^ mask[index % 4];
  }
  return Buffer.concat([Buffer.from(header), mask, masked]);
}

function readCloseFrame(payload: Buffer) {
  if (payload.length < 2) {
    return { reason: '' };
  }
  return {
    code: payload.readUInt16BE(0),
    reason: payload.subarray(2).toString('utf8')
  };
}

function readServerFrame(buffer: Buffer) {
  if (buffer.length < 2) {
    return null;
  }
  const first = buffer[0];
  const second = buffer[1];
  const opcode = first & 0x0f;
  const masked = (second & 0x80) !== 0;
  let length = second & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < offset + 2) {
      return null;
    }
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    if (buffer.length < offset + 8) {
      return null;
    }
    const high = buffer.readUInt32BE(offset);
    const low = buffer.readUInt32BE(offset + 4);
    length = high * 2 ** 32 + low;
    offset += 8;
    if (!Number.isSafeInteger(length)) {
      throw new Error('WebSocket frame is too large to inspect safely.');
    }
  }
  const maskOffset = offset;
  if (masked) {
    offset += 4;
  }
  if (buffer.length < offset + length) {
    return null;
  }
  const payload = Buffer.from(buffer.subarray(offset, offset + length));
  if (masked) {
    const mask = buffer.subarray(maskOffset, maskOffset + 4);
    for (let index = 0; index < payload.length; index += 1) {
      payload[index] ^= mask[index % 4];
    }
  }
  return {
    opcode,
    payload,
    rest: buffer.subarray(offset + length)
  };
}

async function probeWebSocket(input: WsProbeRequest): Promise<WsProbeResult> {
  const startedAt = Date.now();
  const timeoutMs = Math.min(Math.max(input.timeoutMs || 9000, 1000), 30000);
  const token = input.token?.trim() || '';
  const tokenMode = input.tokenMode || 'query';
  const transport = buildProbeTransport(input.url || '', tokenMode, token);
  const target = new URL(transport.url);
  const expectedFrameId = readFrameMeta(input.frame).id;
  const safeURL = sanitizeProbeUrl(target.toString(), token);
  const key = randomBytes(16).toString('base64');
  const expectedAccept = createHash('sha1').update(`${key}${websocketGuid}`).digest('base64');
  const messages: WsProbeMessage[] = [];
  const port = target.port ? Number(target.port) : target.protocol === 'wss:' ? 443 : 80;
  const path = `${target.pathname || '/'}${target.search}`;
  const headers = [
    `GET ${path || '/'} HTTP/1.1`,
    `Host: ${target.host}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${key}`,
    'Sec-WebSocket-Version: 13',
    'User-Agent: Desktop-Request-Tester/0.1'
  ];

  if (transport.protocols?.[0]) {
    headers.push(`Sec-WebSocket-Protocol: ${transport.protocols[0]}`);
  }

  const requestText = `${headers.join('\r\n')}\r\n\r\n`;

  return new Promise((resolve) => {
    let socket: ProbeSocket | null = null;
    let settled = false;
    let opened = false;
    let headerParsed = false;
    let buffer = Buffer.alloc(0);
    let handshakeBody = Buffer.alloc(0);
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let handshakeStatusCode: number | undefined;
    let handshakeStatusMessage: string | undefined;
    let handshakeHeaders: Record<string, string> | undefined;
    let handshakeAcceptValid: boolean | undefined;
    let handshakeProtocol: string | undefined;

    const finish = (result: Omit<WsProbeResult, 'elapsedMs' | 'url' | 'opened'>) => {
      if (settled) {
        return;
      }
      settled = true;
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      clearTimeout(timeout);
      if (socket && !socket.destroyed) {
        socket.destroy();
      }
      resolve({
        ...result,
        opened,
        elapsedMs: Date.now() - startedAt,
        url: safeURL,
        tokenMode,
        statusCode: result.statusCode ?? handshakeStatusCode,
        statusMessage: result.statusMessage ?? handshakeStatusMessage,
        headers: result.headers ?? handshakeHeaders,
        acceptValid: result.acceptValid ?? handshakeAcceptValid,
        protocol: result.protocol ?? handshakeProtocol,
        firstMessage: result.firstMessage ?? messages[0],
        messages
      });
    };

    const timeout = setTimeout(() => {
      finish({
        ok: false,
        stage: 'timeout',
        sentFrame: Boolean(input.frame),
        body: handshakeBody.length > 0 ? handshakeBody.toString('utf8').slice(0, 2000) : undefined,
        error: `Timed out after ${timeoutMs}ms`
      });
    }, timeoutMs);

    const parseFrames = () => {
      while (buffer.length > 0) {
        const frame = readServerFrame(buffer);
        if (!frame) {
          return;
        }
        buffer = Buffer.from(frame.rest);
        if (frame.opcode === 0x1) {
          const raw = frame.payload.toString('utf8');
          const payload = tryParseJSON(raw);
          messages.push({ opcode: 'text', raw, payload });
          const meta = readFrameMeta(payload);
          if (!expectedFrameId || meta.id === expectedFrameId || meta.frame === 'error') {
            finish({
              ok: meta.frame === 'error' ? false : true,
              stage: 'message',
              sentFrame: Boolean(input.frame),
              error: meta.frame === 'error' ? `${meta.type || 'error'}${meta.code ? ` (${meta.code})` : ''}` : undefined
            });
            return;
          }
        }
        if (frame.opcode === 0x2) {
          messages.push({ opcode: 'binary', bytes: frame.payload.length });
          if (!expectedFrameId) {
            finish({ ok: true, stage: 'message', sentFrame: Boolean(input.frame) });
            return;
          }
        }
        if (frame.opcode === 0x8) {
          finish({
            ok: false,
            stage: 'close',
            sentFrame: Boolean(input.frame),
            close: readCloseFrame(frame.payload)
          });
          return;
        }
        if (frame.opcode === 0x9 && socket) {
          socket.write(encodeClientFrame(0xA, frame.payload));
        }
      }
    };

    const parseHandshake = () => {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        return;
      }
      const rawHeader = buffer.subarray(0, headerEnd).toString('utf8');
      const lines = rawHeader.split('\r\n');
      const statusMatch = /^HTTP\/\d(?:\.\d)?\s+(\d{3})(?:\s+(.*))?$/u.exec(lines[0] || '');
      const statusCode = statusMatch ? Number(statusMatch[1]) : 0;
      const statusMessage = statusMatch?.[2] || '';
      const responseHeaders = parseHeaders(lines.slice(1));
      buffer = Buffer.from(buffer.subarray(headerEnd + 4));
      handshakeBody = Buffer.concat([handshakeBody, buffer]);
      headerParsed = true;
      handshakeStatusCode = statusCode;
      handshakeStatusMessage = statusMessage;
      handshakeHeaders = responseHeaders;

      if (statusCode !== 101) {
        finish({
          ok: false,
          stage: 'handshake',
          statusCode,
          statusMessage,
          headers: responseHeaders,
          body: handshakeBody.toString('utf8').slice(0, 2000)
        });
        return;
      }

      opened = true;
      const protocol = responseHeaders['sec-websocket-protocol'];
      const acceptValid = responseHeaders['sec-websocket-accept'] === expectedAccept;
      handshakeProtocol = protocol;
      handshakeAcceptValid = acceptValid;
      buffer = Buffer.from(handshakeBody);
      handshakeBody = Buffer.alloc(0);
      if (input.frame !== undefined && socket) {
        socket.write(encodeClientFrame(0x1, Buffer.from(safeJSONStringify(input.frame), 'utf8')));
      }
      parseFrames();
      if (!settled && input.frame === undefined) {
        idleTimer = setTimeout(() => {
          finish({
            ok: true,
            stage: 'open',
            statusCode,
            statusMessage,
            headers: responseHeaders,
            acceptValid,
            protocol,
            sentFrame: false
          });
        }, 300);
      } else if (!settled && input.frame !== undefined) {
        idleTimer = setTimeout(() => {
          finish({
            ok: true,
            stage: 'open',
            statusCode,
            statusMessage,
            headers: responseHeaders,
            acceptValid,
            protocol,
            sentFrame: true
          });
        }, Math.min(1500, timeoutMs));
      }
    };

    const onData = (chunk: Buffer) => {
      if (settled) {
        return;
      }
      buffer = Buffer.concat([buffer, chunk]);
      try {
        if (!headerParsed) {
          parseHandshake();
        } else {
          parseFrames();
        }
      } catch (error) {
        finish({
          ok: false,
          stage: 'error',
          sentFrame: Boolean(input.frame),
          error: error instanceof Error ? error.message : String(error)
        });
      }
    };

    try {
      socket =
        target.protocol === 'wss:'
          ? connectTls({ host: target.hostname, port, servername: target.hostname })
          : connectNet({ host: target.hostname, port });
      socket.once(target.protocol === 'wss:' ? 'secureConnect' : 'connect', () => {
        socket?.write(requestText);
      });
      socket.on('data', onData);
      socket.once('end', () => {
        if (!settled) {
          finish({
            ok: false,
            stage: opened ? 'close' : 'handshake',
            sentFrame: Boolean(input.frame),
            body: handshakeBody.length > 0 ? handshakeBody.toString('utf8').slice(0, 2000) : undefined,
            close: opened ? { reason: 'socket ended' } : undefined
          });
        }
      });
      socket.once('error', (error) => {
        finish({
          ok: false,
          stage: 'error',
          sentFrame: Boolean(input.frame),
          error: error.message
        });
      });
    } catch (error) {
      finish({
        ok: false,
        stage: 'error',
        sentFrame: Boolean(input.frame),
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

async function proxyRequest(req: IncomingMessage, res: ServerResponse) {
  try {
    const parsed = new URL(req.url || '/', 'http://127.0.0.1');
    const rawURL = parsed.searchParams.get('url') || '';
    const target = new URL(rawURL);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Only http and https targets are supported.' }));
      return;
    }

    const body = await readBody(req);
    const bodyInit = body ? new Uint8Array(body) : undefined;
    const response = await fetch(target, {
      method: req.method,
      headers: headersFromRequest(req),
      body: bodyInit,
      redirect: 'manual'
    });

    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (!hopByHopHeaders.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    res.setHeader('Access-Control-Allow-Origin', '*');
    const payload = Buffer.from(await response.arrayBuffer());
    res.end(payload);
  } catch (error) {
    writeJSON(res, 502, { error: error instanceof Error ? error.message : String(error) });
  }
}

async function probeWebSocketRequest(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') {
    writeJSON(res, 204, {});
    return;
  }
  if (req.method !== 'POST') {
    writeJSON(res, 405, { error: 'POST required.' });
    return;
  }
  try {
    const body = await readBody(req);
    const input = body ? (JSON.parse(body.toString('utf8')) as WsProbeRequest) : {};
    const result = await probeWebSocket(input);
    writeJSON(res, 200, result);
  } catch (error) {
    writeJSON(res, 400, { error: error instanceof Error ? error.message : String(error) });
  }
}

function desktopProxyPlugin(): Plugin {
  return {
    name: 'desktop-request-tester-proxy',
    configureServer(server) {
      server.middlewares.use('/__tester_proxy', (req, res) => {
        void proxyRequest(req, res);
      });
      server.middlewares.use('/__tester_ws_probe', (req, res) => {
        void probeWebSocketRequest(req, res);
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), desktopProxyPlugin()],
  server: {
    host: '127.0.0.1',
    port: 11975
  }
});
