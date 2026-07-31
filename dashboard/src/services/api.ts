// API Service Layer for Wirebot Dashboard
// Centralized API client with TypeScript types

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const RETRYABLE_FETCH_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const REQUEST_TIMEOUT_MS = 20_000;

// =============================================================================
// Types
// =============================================================================

export interface Session {
  id: string;
  name: string;
  status:
    | 'created'
    | 'idle'
    | 'initializing'
    | 'connecting'
    | 'qr_ready'
    | 'authenticating'
    | 'ready'
    | 'disconnected'
    | 'failed';
  phone?: string;
  pushName?: string;
  lastActive?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionStats {
  total: number;
  active: number;
  ready: number;
  disconnected: number;
  byStatus: Record<string, number>;
  memoryUsage: { heapUsed: number; heapTotal: number; rss: number };
}

export interface MessageTimeSeriesPoint {
  timestamp: string;
  sent: number;
  received: number;
}

export interface MessageStatsResponse {
  timeSeries: MessageTimeSeriesPoint[];
  byType: Record<string, number>;
  bySession: Array<{ sessionId: string; name: string; sent: number; received: number }>;
  topChats: Array<{ chatId: string; messageCount: number }>;
}

export interface SessionUptimeEntry {
  id: string;
  name: string;
  status: string;
  connectedAt: string | null;
  lastActiveAt: string | null;
  uptimeMs: number | null;
}

export interface SessionsUptimeSummary {
  sessions: SessionUptimeEntry[];
  statusDistribution: Record<string, number>;
}

export interface Webhook {
  id: string;
  sessionId: string;
  url: string;
  events: string[];
  active: boolean;
  secret?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  deliveryId: string;
  event: string;
  statusCode: number | null;
  success: boolean;
  attempt: number;
  durationMs: number | null;
  requestPayload: Record<string, unknown> | null;
  requestHeaders: Record<string, string> | null;
  responsePayload: unknown;
  error: string | null;
  createdAt: string;
}

export interface WebhookDeliveriesResponse {
  items: WebhookDelivery[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  role: 'admin' | 'user' | 'readonly';
  allowedIps?: string[];
  allowedSessions?: string[];
  isActive: boolean;
  expiresAt?: string;
  lastUsedAt?: string;
  usageCount: number;
  createdAt: string;
  apiKey?: string; // Only returned on creation
}

export interface AuditLog {
  id: string;
  action: string;
  severity: 'info' | 'warn' | 'error';
  apiKeyId?: string;
  apiKeyName?: string;
  sessionId?: string;
  sessionName?: string;
  ipAddress?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  errorMessage?: string;
  createdAt: string;
}

export interface MessageResponse {
  messageId: string;
  timestamp: number;
}

export interface Contact {
  id: string;
  name?: string;
  pushName?: string;
  number: string;
  isMyContact: boolean;
  isBlocked: boolean;
  /** Populated client-side from live WS message events, not returned by the API */
  lastMessage?: string;
  /** Populated client-side from live WS message events, not returned by the API */
  lastMessageTime?: string;
  /** Populated client-side from live WS message events, not returned by the API */
  unread?: boolean;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactTagAssignment {
  id?: string;
  sessionId: string;
  jid: string;
  name?: string | null;
  tags: string[];
  /** Operator (API key name) who has claimed this chat, if any. */
  assignedTo?: string | null;
  /** When the chat was claimed. */
  assignedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Group {
  id: string;
  name: string;
  participantsCount?: number;
  isAdmin?: boolean;
  /** Populated client-side from live WS message events, not returned by the API */
  lastMessage?: string;
  /** Populated client-side from live WS message events, not returned by the API */
  lastMessageTime?: string;
  /** Populated client-side from live WS message events, not returned by the API */
  unread?: boolean;
}

export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  sessionId: string;
  waMessageId?: string;
  chatId: string;
  from: string;
  to: string;
  body?: string;
  type: string;
  direction: 'incoming' | 'outgoing';
  timestamp?: number;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface HealthStatus {
  status: 'ok' | 'error';
  timestamp?: string;
  details?: {
    database?: { status: string };
    redis?: { status: string };
    queue?: { status: string };
  };
}

export interface InfraStatus {
  database: { connected: boolean; type: string; host: string };
  redis: { connected: boolean; host: string; port: number };
  queue: {
    enabled: boolean;
    messages: { pending: number; completed: number; failed: number };
    webhooks: { pending: number; completed: number; failed: number };
  };
  storage: { type: 'local' | 's3'; path?: string; bucket?: string };
  engine: { type: string; headless: boolean };
}

export interface SaveConfigPayload {
  database?: {
    type: 'sqlite' | 'postgres';
    builtIn?: boolean;
    host?: string;
    port?: string;
    username?: string;
    password?: string;
    database?: string;
    poolSize?: number;
    sslEnabled?: boolean;
  };
  redis?: {
    enabled?: boolean;
    builtIn?: boolean;
    host?: string;
    port?: string;
    password?: string;
  };
  queue?: {
    enabled?: boolean;
  };
  storage?: {
    type: 'local' | 's3';
    builtIn?: boolean;
    localPath?: string;
    s3Bucket?: string;
    s3Region?: string;
    s3AccessKey?: string;
    s3SecretKey?: string;
    s3Endpoint?: string;
  };
  engine?: {
    headless?: boolean;
    sessionDataPath?: string;
    browserArgs?: string;
  };
}

export interface Settings {
  general: { apiBaseUrl: string; sessionTimeout: number; autoReconnect: boolean; debugMode: boolean };
  api: { rateLimit: number; rateLimitWindow: number; enableDocs: boolean };
  notifications: { emailEnabled: boolean; notificationEmail: string; webhookAlerts: boolean };
}

// =============================================================================
// API Client
// =============================================================================

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  const method = (options.method || 'GET').toUpperCase();
  const maxAttempts = RETRYABLE_FETCH_METHODS.has(method) ? 3 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      await sleep(attempt * 1500);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  throw new Error('Failed to fetch');
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  // Get API key from sessionStorage for authentication
  const apiKey = sessionStorage.getItem('wirebot_api_key');

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    ...options.headers,
  };

  const response = await fetchWithRetry(url, { cache: 'no-store', ...options, headers });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// =============================================================================
// Auth API
// =============================================================================

export const authApi = {
  /**
   * Validates an API key against the backend and returns the role.
   * Uses VITE_API_URL so it always hits the correct backend, even when
   * the dashboard is hosted as a separate static site (e.g. on Render).
   */
  validate: (apiKey: string) =>
    request<{ valid: boolean; role?: string; name?: string }>('/auth/validate', {
      method: 'POST',
      headers: { 'X-API-Key': apiKey },
    }),
};

// =============================================================================
// Session API
// =============================================================================

export const sessionApi = {
  list: () => request<Session[]>('/sessions'),
  get: (id: string) => request<Session>(`/sessions/${id}`),
  create: (name: string) =>
    request<Session>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  delete: (id: string) => request<void>(`/sessions/${id}`, { method: 'DELETE' }),
  start: (id: string) => request<Session>(`/sessions/${id}/start`, { method: 'POST' }),
  stop: (id: string) => request<Session>(`/sessions/${id}/stop`, { method: 'POST' }),
  getQR: (id: string) => request<{ qrCode: string; status: string }>(`/sessions/${id}/qr`),
  getStats: () => request<SessionStats>('/sessions/stats/overview'),
  getGroups: (id: string) => request<{ id: string; name: string }[]>(`/sessions/${id}/groups`),
};

// =============================================================================
// Stats/Analytics API
// =============================================================================

export const statsApi = {
  getMessageStats: (period: '24h' | '7d' | '14d' | '30d') =>
    request<MessageStatsResponse>(`/stats/messages?period=${period}`),
  getSessionsUptime: () => request<SessionsUptimeSummary>('/stats/sessions-uptime'),
};

// =============================================================================
// Webhook API
// =============================================================================

export const webhookApi = {
  listBySession: (sessionId: string) => request<Webhook[]>(`/sessions/${sessionId}/webhooks`),
  listAll: () => request<Webhook[]>('/webhooks'),
  get: (sessionId: string, id: string) => request<Webhook>(`/sessions/${sessionId}/webhooks/${id}`),
  create: (sessionId: string, data: { url: string; events: string[] }) =>
    request<Webhook>(`/sessions/${sessionId}/webhooks`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (sessionId: string, id: string, data: Partial<Webhook>) =>
    request<Webhook>(`/sessions/${sessionId}/webhooks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (sessionId: string, id: string) =>
    request<void>(`/sessions/${sessionId}/webhooks/${id}`, { method: 'DELETE' }),
  test: (sessionId: string, id: string) =>
    request<{ success: boolean; statusCode?: number; error?: string }>(`/sessions/${sessionId}/webhooks/${id}/test`, {
      method: 'POST',
    }),
  getDeliveries: (sessionId: string, id: string, page = 1, limit = 20) =>
    request<WebhookDeliveriesResponse>(
      `/sessions/${sessionId}/webhooks/${id}/deliveries?page=${page}&limit=${limit}`,
    ),
  getDelivery: (sessionId: string, id: string, deliveryId: string) =>
    request<WebhookDelivery>(`/sessions/${sessionId}/webhooks/${id}/deliveries/${deliveryId}`),
};

// =============================================================================
// API Key API
// =============================================================================

export const apiKeyApi = {
  list: () => request<ApiKey[]>('/auth/api-keys'),
  get: (id: string) => request<ApiKey>(`/auth/api-keys/${id}`),
  create: (data: {
    name: string;
    role: string;
    allowedIps?: string[];
    allowedSessions?: string[];
    expiresAt?: string;
  }) =>
    request<ApiKey>('/auth/api-keys', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<ApiKey>) =>
    request<ApiKey>(`/auth/api-keys/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/auth/api-keys/${id}`, { method: 'DELETE' }),
  revoke: (id: string) => request<ApiKey>(`/auth/api-keys/${id}/revoke`, { method: 'POST' }),
};

// =============================================================================
// Audit/Logs API
// =============================================================================

export const auditApi = {
  list: (params?: { action?: string; severity?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.action) query.set('action', params.action);
    if (params?.severity) query.set('severity', params.severity);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const queryStr = query.toString();
    return request<{ data: AuditLog[]; total: number }>(`/audit${queryStr ? `?${queryStr}` : ''}`);
  },
};

// =============================================================================
// Message API
// =============================================================================

export const messageApi = {
  sendText: (sessionId: string, chatId: string, text: string) =>
    request<MessageResponse>(`/sessions/${sessionId}/messages/send-text`, {
      method: 'POST',
      body: JSON.stringify({ chatId, text }),
    }),
  sendImage: (sessionId: string, chatId: string, url: string, caption?: string) =>
    request<MessageResponse>(`/sessions/${sessionId}/messages/send-image`, {
      method: 'POST',
      body: JSON.stringify({ chatId, url, caption }),
    }),
  sendVideo: (sessionId: string, chatId: string, url: string, caption?: string) =>
    request<MessageResponse>(`/sessions/${sessionId}/messages/send-video`, {
      method: 'POST',
      body: JSON.stringify({ chatId, url, caption }),
    }),
  sendAudio: (sessionId: string, chatId: string, url: string) =>
    request<MessageResponse>(`/sessions/${sessionId}/messages/send-audio`, {
      method: 'POST',
      body: JSON.stringify({ chatId, url }),
    }),
  sendDocument: (sessionId: string, chatId: string, url: string, filename?: string) =>
    request<MessageResponse>(`/sessions/${sessionId}/messages/send-document`, {
      method: 'POST',
      body: JSON.stringify({ chatId, url, filename }),
    }),
};

// =============================================================================
// Broadcast API
// =============================================================================

export type BroadcastStatus = 'pending' | 'scheduled' | 'processing' | 'completed' | 'cancelled' | 'failed';

export interface BroadcastProgress {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  cancelled: number;
}

export interface BroadcastRecipientResult {
  chatId: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  messageId?: string;
  error?: string;
  sentAt?: string;
}

export interface BroadcastSummary {
  broadcastId: string;
  status: BroadcastStatus;
  message: string;
  totalRecipients: number;
  scheduledAt: string | null;
  progress: BroadcastProgress;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface BroadcastDetail {
  broadcastId: string;
  status: BroadcastStatus;
  message: string;
  recipients: string[];
  scheduledAt: string | null;
  progress: BroadcastProgress;
  results: BroadcastRecipientResult[];
  startedAt: string | null;
  completedAt: string | null;
}

export interface CreateBroadcastPayload {
  message: string;
  recipients?: string[];
  allContacts?: boolean;
  scheduledAt?: string;
  options?: {
    delayBetweenMessages?: number;
    randomizeDelay?: boolean;
    stopOnError?: boolean;
  };
}

export interface CreateBroadcastResponse {
  broadcastId: string;
  status: BroadcastStatus;
  totalRecipients: number;
  scheduledAt?: string;
  estimatedCompletionTime?: string;
  statusUrl: string;
}

export const broadcastApi = {
  create: (sessionId: string, payload: CreateBroadcastPayload) =>
    request<CreateBroadcastResponse>(`/sessions/${sessionId}/broadcasts`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  list: (sessionId: string) => request<BroadcastSummary[]>(`/sessions/${sessionId}/broadcasts`),
  getStatus: (sessionId: string, broadcastId: string) =>
    request<BroadcastDetail>(`/sessions/${sessionId}/broadcasts/${broadcastId}`),
  cancel: (sessionId: string, broadcastId: string) =>
    request<{ broadcastId: string; status: BroadcastStatus; progress: BroadcastProgress }>(
      `/sessions/${sessionId}/broadcasts/${broadcastId}/cancel`,
      { method: 'POST' },
    ),
};

// =============================================================================
// Message Template API
// =============================================================================

export const templateApi = {
  list: () => request<MessageTemplate[]>('/templates'),
  get: (id: string) => request<MessageTemplate>(`/templates/${id}`),
  create: (data: { name: string; content: string }) =>
    request<MessageTemplate>('/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: Partial<Pick<MessageTemplate, 'name' | 'content'>>) =>
    request<MessageTemplate>(`/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/templates/${id}`, { method: 'DELETE' }),
};

// =============================================================================
// Chat API
// =============================================================================

export const chatApi = {
  getContacts: (sessionId: string) => request<Contact[]>(`/sessions/${sessionId}/contacts`),
  getGroups: (sessionId: string) => request<Group[]>(`/sessions/${sessionId}/groups`),
  getMessages: (sessionId: string, chatId: string, limit = 50, offset = 0) =>
    request<{ messages: Message[]; total: number }>(
      `/sessions/${sessionId}/messages?chatId=${chatId}&limit=${limit}&offset=${offset}`,
    ),
};

// =============================================================================
// Tag / Contact Tagging API
// =============================================================================

export const tagApi = {
  list: () => request<Tag[]>('/tags'),
  get: (id: string) => request<Tag>(`/tags/${id}`),
  create: (data: { name: string; color?: string }) =>
    request<Tag>('/tags', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { name?: string; color?: string }) =>
    request<Tag>(`/tags/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: string) => request<void>(`/tags/${id}`, { method: 'DELETE' }),
};

export const contactTagApi = {
  listBySession: (sessionId: string, tag?: string) =>
    request<ContactTagAssignment[]>(`/sessions/${sessionId}/contact-tags${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`),
  get: (sessionId: string, jid: string) =>
    request<ContactTagAssignment>(`/sessions/${sessionId}/contact-tags/${encodeURIComponent(jid)}`),
  setTags: (sessionId: string, jid: string, tags: string[], name?: string) =>
    request<ContactTagAssignment>(`/sessions/${sessionId}/contact-tags/${encodeURIComponent(jid)}`, {
      method: 'PUT',
      body: JSON.stringify({ tags, name }),
    }),
  addTag: (sessionId: string, jid: string, tag: string, name?: string) =>
    request<ContactTagAssignment>(`/sessions/${sessionId}/contact-tags/${encodeURIComponent(jid)}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag, name }),
    }),
  removeTag: (sessionId: string, jid: string, tag: string) =>
    request<ContactTagAssignment>(
      `/sessions/${sessionId}/contact-tags/${encodeURIComponent(jid)}/tags/${encodeURIComponent(tag)}`,
      { method: 'DELETE' },
    ),
  delete: (sessionId: string, jid: string) =>
    request<void>(`/sessions/${sessionId}/contact-tags/${encodeURIComponent(jid)}`, { method: 'DELETE' }),
  /** Claim (assign) a chat to the current operator (identified server-side by API key). */
  claim: (sessionId: string, jid: string) =>
    request<ContactTagAssignment>(`/sessions/${sessionId}/contact-tags/${encodeURIComponent(jid)}/claim`, {
      method: 'POST',
    }),
  /** Release the current claim on a chat. */
  unassign: (sessionId: string, jid: string) =>
    request<ContactTagAssignment>(`/sessions/${sessionId}/contact-tags/${encodeURIComponent(jid)}/claim`, {
      method: 'DELETE',
    }),
};

// =============================================================================
// Health & Infrastructure API
// =============================================================================

export const healthApi = {
  check: () => request<HealthStatus>('/health'),
  ready: () => request<HealthStatus>('/health/ready'),
};

export const infraApi = {
  getStatus: () => request<InfraStatus>('/infra/status'),
  updateConfig: (config: Partial<InfraStatus>) =>
    request<InfraStatus>('/infra/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  saveConfig: (config: SaveConfigPayload) =>
    request<{ message: string; saved: boolean; envPath: string; profiles: string[] }>('/infra/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  restart: (profiles?: string[], profilesToRemove?: string[]) =>
    request<{
      message: string;
      restarting: boolean;
      profiles: string[];
      profilesToRemove: string[];
      estimatedTime: number;
    }>('/infra/restart', {
      method: 'POST',
      body: JSON.stringify({ profiles: profiles || [], profilesToRemove: profilesToRemove || [] }),
    }),
  healthCheck: () => request<{ status: string; timestamp: string }>('/infra/health'),
};

// =============================================================================
// Settings API
// =============================================================================

export const settingsApi = {
  get: () => request<Settings>('/settings'),
  update: (settings: Partial<Settings>) =>
    request<Settings>('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
};

// =============================================================================
// Plugin Types
// =============================================================================

export interface Plugin {
  id: string;
  name: string;
  version: string;
  type: 'engine' | 'storage' | 'queue' | 'auth' | 'extension';
  description?: string;
  author?: string;
  status: 'installed' | 'enabled' | 'disabled' | 'error';
  config: Record<string, unknown>;
  builtIn: boolean;
  provides: string[];
  loadedAt?: string;
  enabledAt?: string;
  error?: string;
}

export interface Engine {
  id: string;
  name: string;
  enabled: boolean;
  features: string[];
}

// =============================================================================
// Plugins API
// =============================================================================

export const pluginsApi = {
  list: () => request<Plugin[]>('/plugins'),
  get: (id: string) => request<Plugin>(`/plugins/${id}`),
  enable: (id: string) =>
    request<{ success: boolean; message: string }>(`/plugins/${id}/enable`, {
      method: 'POST',
    }),
  disable: (id: string) =>
    request<{ success: boolean; message: string }>(`/plugins/${id}/disable`, {
      method: 'POST',
    }),
  updateConfig: (id: string, config: Record<string, unknown>) =>
    request<{ success: boolean; message: string }>(`/plugins/${id}/config`, {
      method: 'PUT',
      body: JSON.stringify({ config }),
    }),
  healthCheck: (id: string) => request<{ healthy: boolean; message?: string }>(`/plugins/${id}/health`),
  getEngines: () => request<Engine[]>('/infra/engines'),
  getCurrentEngine: () => request<{ engineType: string }>('/infra/engines/current'),
};
