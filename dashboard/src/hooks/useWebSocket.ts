import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface SessionStatusEvent {
  sessionId: string;
  status: string;
  timestamp: string;
}

interface QRCodeEvent {
  sessionId: string;
  qrCode: string;
  timestamp: string;
}

interface MessageEvent {
  sessionId: string;
  message: Record<string, unknown>;
  timestamp: string;
}

interface WebSocketEvents {
  onSessionStatus?: (event: SessionStatusEvent) => void;
  onQRCode?: (event: QRCodeEvent) => void;
  onMessage?: (event: MessageEvent) => void;
}

const getSocketUrl = () => {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  if (import.meta.env.VITE_API_URL) {
    return new URL(import.meta.env.VITE_API_URL, window.location.origin).origin;
  }

  return window.location.origin;
};

const SOCKET_URL = getSocketUrl();

/**
 * React hook that manages a single persistent Socket.IO connection to the
 * backend /events namespace. Callbacks are stored in a mutable ref so the
 * socket listener is never stale and never needs to be re-registered when
 * parent component state (e.g. activeChat) changes.
 */
export function useWebSocket(events: WebSocketEvents = {}, sessionId?: string) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  // Surfaced to consumers so the UI can show a "real-time updates unavailable"
  // indicator instead of silently having no live updates.
  const [connectError, setConnectError] = useState<string | null>(null);
  const subSessionId = sessionId || '*';

  // ─── Stable callback refs ────────────────────────────────────────────────
  // Always keep the ref pointing to the latest callbacks so the stable
  // socket listener can read them without ever being re-registered.
  const callbacksRef = useRef<WebSocketEvents>(events);
  // No deps array — runs on EVERY render to always have the freshest callbacks
  useEffect(() => {
    callbacksRef.current = events;
  });

  // ─── Connect once on mount ───────────────────────────────────────────────
  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    const apiKey = sessionStorage.getItem('wirebot_api_key');
    if (!apiKey) {
      console.warn('[WebSocket] No API key found — skipping connection');
      setConnectError('missing-api-key');
      return;
    }

    console.log('[WebSocket] Connecting to', SOCKET_URL);

    const socket = io(`${SOCKET_URL}/events`, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      auth: { apiKey },
      extraHeaders: { 'X-API-Key': apiKey },
      query: { apiKey },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[WebSocket] ✅ Connected — socket id:', socket.id);
      setIsConnected(true);
      setConnectError(null);
    });

    socket.on('disconnect', (reason) => {
      console.log('[WebSocket] ❌ Disconnected — reason:', reason);
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.warn('[WebSocket] Connection error:', error.message);
      setConnectError(error.message);
    });

    // ── SINGLE stable 'message' listener ─────────────────────────────────
    // Registered ONCE. Always reads latest callbacks via callbacksRef.
    socket.on('message', (eventMsg: unknown) => {
      const msg = eventMsg as Record<string, unknown>;
      if (!msg || msg['type'] !== 'event' || !msg['payload']) return;

      const payload = msg['payload'] as { event: string; sessionId: string; data: unknown };
      const { event, sessionId: msgSessionId, data } = payload;

      console.log(`[WebSocket] 📨 ${event} | session=${msgSessionId}`, data);

      if (event === 'session.status' && callbacksRef.current.onSessionStatus) {
        const d = data as Record<string, unknown>;
        callbacksRef.current.onSessionStatus({
          sessionId: msgSessionId,
          status: d['status'] as string,
          timestamp: msg['timestamp'] as string,
        });
      }

      if (event === 'session.qr' && callbacksRef.current.onQRCode) {
        const d = data as Record<string, unknown>;
        callbacksRef.current.onQRCode({
          sessionId: msgSessionId,
          qrCode: d['qrCode'] as string,
          timestamp: msg['timestamp'] as string,
        });
      }

      if (
        (event === 'message.received' || event === 'message.sent') &&
        callbacksRef.current.onMessage
      ) {
        console.log(`[WebSocket] 💬 Routing ${event} → onMessage`, data);
        callbacksRef.current.onMessage({
          sessionId: msgSessionId,
          message: data as Record<string, unknown>,
          timestamp: msg['timestamp'] as string,
        });
      }
    });
  }, []); // empty deps — only ever created once

  // ─── Mount / unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    connect();
    return () => {
      if (socketRef.current) {
        console.log('[WebSocket] Disconnecting on unmount');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [connect]);

  // ─── Subscribe / unsubscribe when session or connection changes ──────────
  useEffect(() => {
    if (!socketRef.current || !isConnected) return;
    const socket = socketRef.current;

    console.log(`[WebSocket] Subscribing → session=${subSessionId} events=['*']`);
    socket.emit('message', {
      type: 'subscribe',
      sessionId: subSessionId,
      events: ['*'],
    });

    return () => {
      // Always attempt the unsubscribe, even if the socket is mid-reconnect
      // (connected === false but not yet destroyed). Gating on `.connected`
      // let a stale server-side subscription survive a reconnect, leaking
      // events for the old session into whatever chat/session is selected next.
      console.log(`[WebSocket] Unsubscribing → session=${subSessionId}`);
      socket.emit('message', { type: 'unsubscribe', sessionId: subSessionId });
    };
  }, [isConnected, subSessionId]);

  return { isConnected, connectError };
}
