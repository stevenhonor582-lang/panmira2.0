/* ============================================================
   Panmira Web — Global State (Zustand)
   ============================================================ */

import { create } from 'zustand';
import type {
  ActiveView,
  ActivityEvent,
  BotInfo,
  CardState,
  ChatGroup,
  ChatMessage,
  ChatSession,
  ServerSession,
  ServerSessionMessage,
  Theme,
} from './types';

/* ---- team status types ---- */

export interface AgentMetadata {
  name: string;
  description?: string;
  model?: string;
  tools?: string;
}

export interface BotStatus {
  name: string;
  description?: string;
  specialties?: string[];
  icon?: string;
  platform: string;
  engine?: 'claude' | 'kimi' | 'codex' | 'openai-compat';
  model?: string;
  workingDirectory: string;
  status: 'idle' | 'busy' | 'error';
  currentTask?: {
    chatId: string;
    startTime: number;
    durationMs: number;
  };
  stats: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    totalCacheCreationTokens: number;
  };
  agents?: AgentMetadata[];
}

export interface TeamStatus {
  bots: BotStatus[];
  summary: {
    totalBots: number;
    busyBots: number;
    idleBots: number;
    totalCostUsd: number;
    totalTasks: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens: number;
    totalCacheCreationTokens: number;
  };
}

/* ---- helpers ---- */

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function persistSessions(sessions: Map<string, ChatSession>) {
  try {
    const obj: Record<string, ChatSession> = {};
    sessions.forEach((v, k) => {
      obj[k] = v;
    });
    localStorage.setItem('metabot:sessions', JSON.stringify(obj));
  } catch {
    // storage full — silently ignore
  }
}

function loadSessions(): Map<string, ChatSession> {
  try {
    const raw = localStorage.getItem('metabot:sessions');
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, ChatSession>;
    const map = new Map<string, ChatSession>();
    for (const [k, v] of Object.entries(obj)) {
      map.set(k, v);
    }
    return map;
  } catch {
    return new Map();
  }
}

/* ---- store interface ---- */

export interface CurrentUser {
  id: string;
  email: string | null;
  name: string;
  role: 'admin' | 'member';
  tenantId: string;
}

export interface AppStore {
  // Auth
  token: string | null;
  currentUser: CurrentUser | null;
  login: (token: string) => void;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;

  // Connection
  connected: boolean;
  setConnected: (c: boolean) => void;

  // Bots
  bots: BotInfo[];
  setBots: (bots: BotInfo[]) => void;
  activeBotName: string | null;
  setBot: (name: string) => void;

  // Sessions
  sessions: Map<string, ChatSession>;
  activeSessionId: string | null;
  createSession: (botName?: string) => string;
  deleteSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  addMessage: (sessionId: string, msg: ChatMessage) => void;
  updateMessageState: (
    sessionId: string,
    messageId: string,
    state: CardState,
    botName?: string,
  ) => void;
  updateMessageText: (
    sessionId: string,
    messageId: string,
    text: string,
  ) => void;
  addMessageAttachment: (
    sessionId: string,
    messageId: string,
    attachment: import('./types').FileAttachment,
  ) => void;
  markRunningMessagesDisconnected: () => void;
  clearSessions: () => void;
  getOrCreateBotSession: (botName: string) => string;
  /** Rename a session locally. */
  renameSession: (id: string, title: string) => void;
  /** Merge server-side sessions into local store (session persistence). */
  mergeServerSessions: (serverSessions: ServerSession[]) => void;
  /** Load server message history into a local session. */
  loadServerHistory: (chatId: string, messages: ServerSessionMessage[]) => void;

  // Groups
  groups: ChatGroup[];
  setGroups: (groups: ChatGroup[]) => void;
  addGroup: (group: ChatGroup) => void;
  removeGroup: (groupId: string) => void;
  createGroupSession: (group: ChatGroup) => string;

  // Navigation
  activeView: ActiveView;
  setView: (v: ActiveView) => void;

  // Theme
  theme: Theme;
  toggleTheme: () => void;

  // Font size
  fontSize: 'small' | 'normal' | 'large' | 'xl';
  setFontSize: (size: 'small' | 'normal' | 'large' | 'xl') => void;

  // Team
  teamStatus: TeamStatus | null;
  setTeamStatus: (status: TeamStatus) => void;
  teamViewMode: 'workspace' | 'office';
  setTeamViewMode: (mode: 'workspace' | 'office') => void;
  selectedAgentKey: string | null;
  setSelectedAgentKey: (key: string | null) => void;
  teamChatBotName: string | null;
  setTeamChatBotName: (name: string | null) => void;
  teamDetailTab: 'activity' | 'stats' | 'info' | 'sessions';
  setTeamDetailTab: (tab: 'activity' | 'stats' | 'info' | 'sessions') => void;

  // Activity feed
  activityEvents: ActivityEvent[];
  addActivityEvent: (event: ActivityEvent) => void;
  setActivityEvents: (events: ActivityEvent[]) => void;

  // Incoming voice call
  incomingVoiceCall: { sessionId: string; roomId: string; token: string; appId: string; userId: string; aiUserId: string; chatId: string; botName: string; prompt?: string } | null;
  setIncomingVoiceCall: (call: { sessionId: string; roomId: string; token: string; appId: string; userId: string; aiUserId: string; chatId: string; botName: string; prompt?: string } | null) => void;

  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Global defaults for new bots
  defaultEngine: string;
  setDefaultEngine: (engine: string) => void;
  defaultModel: string;
  setDefaultModel: (model: string) => void;
  defaultWorkDir: string;
  setDefaultWorkDir: (dir: string) => void;

  // AI Providers
  aiProviders: import('./utils/models').AIProvider[];
  loadProviders: () => Promise<void>;
  addProvider: (provider: import('./utils/models').AIProvider) => Promise<void>;
  updateProvider: (id: string, updates: Partial<import('./utils/models').AIProvider>) => Promise<void>;
  removeProvider: (id: string) => Promise<void>;
  defaultProviderId: string;
  setDefaultProviderId: (id: string) => void;
  // ASR (streaming speech recognition)
  asrState: 'idle' | 'connecting' | 'active' | 'error';
  asrPartialText: string;
  setAsrState: (state: 'idle' | 'connecting' | 'active' | 'error') => void;
  setAsrPartialText: (text: string) => void;
}

export const useStore = create<AppStore>((set, get) => ({
  /* ---- Auth ---- */
  token: (() => {
    const t = localStorage.getItem('metabot:token');
    if (t && t.startsWith('eyJ')) {
      try {
        const payload = JSON.parse(atob(t.split('.')[1]));
        if (payload.exp && payload.exp * 1000 < Date.now()) {
          // Access token expired — try refresh in background
          const rt = localStorage.getItem('metabot:refresh');
          if (rt) {
            fetch('/api/auth/refresh', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken: rt }),
            }).then(r => r.ok ? r.json() : null).then(data => {
              if (data?.accessToken) {
                localStorage.setItem('metabot:token', data.accessToken);
                if (data.refreshToken) localStorage.setItem('metabot:refresh', data.refreshToken);
                set({ token: data.accessToken });
              } else {
                localStorage.removeItem('metabot:token');
                localStorage.removeItem('metabot:user');
                localStorage.removeItem('metabot:refresh');
                set({ token: null, currentUser: null });
              }
            }).catch(() => {});
          }
          // Return expired token temporarily so UI doesn't flash login page
          return t;
        }
      } catch { /* not a valid JWT, keep it (could be API secret) */ }
    }
    return t;
  })(),
  currentUser: (() => { try { return JSON.parse(localStorage.getItem('metabot:user') || 'null'); } catch { return null; } })(),

  login(token: string) {
    localStorage.setItem('metabot:token', token);
    set({ token });
    // Fetch current user info
    if (token.startsWith('eyJ')) {
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((user) => {
          if (user) {
            localStorage.setItem('metabot:user', JSON.stringify(user));
            set({ currentUser: user });
          }
        })
        .catch(() => {});
    } else {
      // API secret login — assume admin, fetch user list to get admin user
      fetch('/api/auth/users', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const admin = (data?.users || []).find((u: any) => u.role === 'admin');
          if (admin) {
            localStorage.setItem('metabot:user', JSON.stringify(admin));
            set({ currentUser: admin });
          }
        })
        .catch(() => {});
    }
  },

  async loginWithEmail(email: string, password: string) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Login failed');
    }
    const data = await res.json();
    localStorage.setItem('metabot:token', data.accessToken);
    localStorage.setItem('metabot:user', JSON.stringify(data.user));
    if (data.refreshToken) localStorage.setItem('metabot:refresh', data.refreshToken);
    set({ token: data.accessToken, currentUser: data.user });
  },

  async registerWithEmail(email: string, password: string, name?: string) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Registration failed');
    }
    const data = await res.json();
    localStorage.setItem('metabot:token', data.accessToken);
    localStorage.setItem('metabot:user', JSON.stringify(data.user));
    if (data.refreshToken) localStorage.setItem('metabot:refresh', data.refreshToken);
    set({ token: data.accessToken, currentUser: data.user });
  },

  logout() {
    localStorage.removeItem('metabot:token');
    localStorage.removeItem('metabot:user');
    localStorage.removeItem('metabot:refresh');
    set({ token: null, currentUser: null, connected: false, bots: [], activeBotName: null });
  },

  /* ---- Connection ---- */
  connected: false,
  setConnected(c: boolean) {
    set({ connected: c });
  },

  /* ---- Bots ---- */
  bots: [],
  setBots(bots: BotInfo[]) {
    const state = get();
    const updates: Partial<AppStore> = { bots };
    // Auto-select first bot if none selected
    if (!state.activeBotName && bots.length > 0) {
      updates.activeBotName = bots[0].name;
    }
    set(updates);
  },
  activeBotName: null,
  setBot(name: string) {
    set({ activeBotName: name });
  },

  /* ---- Sessions ---- */
  sessions: loadSessions(),
  activeSessionId: null,

  createSession(botName?: string) {
    const state = get();
    const bot = botName || state.activeBotName || 'default';
    const id = generateId();
    const session: ChatSession = {
      id,
      botName: bot,
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const sessions = new Map(state.sessions);
    sessions.set(id, session);
    persistSessions(sessions);
    set({ sessions, activeSessionId: id });
    return id;
  },

  deleteSession(id: string) {
    const sessions = new Map(get().sessions);
    sessions.delete(id);
    persistSessions(sessions);
    const updates: Partial<AppStore> = { sessions };
    if (get().activeSessionId === id) {
      // Select the most recent remaining session, or null
      const sorted = Array.from(sessions.values()).sort(
        (a, b) => b.updatedAt - a.updatedAt,
      );
      updates.activeSessionId = sorted.length > 0 ? sorted[0].id : null;
    }
    set(updates);
  },

  setActiveSession(id: string | null) {
    set({ activeSessionId: id });
  },

  addMessage(sessionId: string, msg: ChatMessage) {
    const sessions = new Map(get().sessions);
    const session = sessions.get(sessionId);
    if (!session) return;

    const updated: ChatSession = {
      ...session,
      messages: [...session.messages, msg],
      updatedAt: Date.now(),
      // Update title from first user message
      title:
        session.messages.length === 0 && msg.type === 'user'
          ? msg.text.slice(0, 60) || 'New Chat'
          : session.title,
    };
    sessions.set(sessionId, updated);
    persistSessions(sessions);
    set({ sessions });
  },

  updateMessageState(sessionId: string, messageId: string, state: CardState, botName?: string) {
    const sessions = new Map(get().sessions);
    const session = sessions.get(sessionId);
    if (!session) return;

    const messages = session.messages.map((m) =>
      m.id === messageId
        ? { ...m, state, text: state.responseText || m.text, ...(botName ? { botName } : {}) }
        : m,
    );
    sessions.set(sessionId, { ...session, messages, updatedAt: Date.now() });
    persistSessions(sessions);
    set({ sessions });
  },

  updateMessageText(sessionId: string, messageId: string, text: string) {
    const sessions = new Map(get().sessions);
    const session = sessions.get(sessionId);
    if (!session) return;

    const messages = session.messages.map((m) =>
      m.id === messageId ? { ...m, text } : m,
    );
    sessions.set(sessionId, { ...session, messages, updatedAt: Date.now() });
    persistSessions(sessions);
    set({ sessions });
  },

  addMessageAttachment(sessionId: string, messageId: string, attachment: import('./types').FileAttachment) {
    const sessions = new Map(get().sessions);
    const session = sessions.get(sessionId);
    if (!session) return;

    const messages = session.messages.map((m) => {
      if (m.id === messageId) {
        return { ...m, attachments: [...(m.attachments || []), attachment] };
      }
      return m;
    });
    sessions.set(sessionId, { ...session, messages, updatedAt: Date.now() });
    persistSessions(sessions);
    set({ sessions });
  },

  markRunningMessagesDisconnected() {
    const sessions = new Map(get().sessions);
    let changed = false;
    for (const [id, session] of sessions) {
      const messages = session.messages.map((m) => {
        if (m.type === 'assistant' && m.state && (m.state.status === 'thinking' || m.state.status === 'running')) {
          changed = true;
          return { ...m, state: { ...m.state, status: 'error' as const, errorMessage: 'Connection lost' } };
        }
        return m;
      });
      if (changed) sessions.set(id, { ...session, messages });
    }
    if (changed) {
      persistSessions(sessions);
      set({ sessions });
    }
  },

  clearSessions() {
    localStorage.removeItem('metabot:sessions');
    set({ sessions: new Map(), activeSessionId: null });
  },

  getOrCreateBotSession(botName: string) {
    const state = get();
    // Find existing session for this bot
    for (const [id, session] of state.sessions) {
      if (session.botName === botName) {
        set({ activeSessionId: id, activeBotName: botName });
        return id;
      }
    }
    // Create new session for this bot
    const id = generateId();
    const session: ChatSession = {
      id,
      botName,
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const sessions = new Map(state.sessions);
    sessions.set(id, session);
    persistSessions(sessions);
    set({ sessions, activeSessionId: id, activeBotName: botName });
    return id;
  },

  renameSession(id: string, title: string) {
    const sessions = new Map(get().sessions);
    const session = sessions.get(id);
    if (!session) return;
    sessions.set(id, { ...session, title });
    persistSessions(sessions);
    set({ sessions });
  },

  mergeServerSessions(serverSessions: ServerSession[]) {
    const sessions = new Map(get().sessions);
    let changed = false;
    for (const ss of serverSessions) {
      // Server sessions use chatId as key — same as local session ID
      if (!sessions.has(ss.chatId)) {
        // Session exists on server but not locally — restore it
        sessions.set(ss.chatId, {
          id: ss.chatId,
          botName: ss.botName,
          title: ss.title || 'Restored Chat',
          messages: [],
          createdAt: ss.createdAt,
          updatedAt: ss.updatedAt,
        });
        changed = true;
      }
    }
    if (changed) {
      persistSessions(sessions);
      set({ sessions });
    }
  },

  loadServerHistory(chatId: string, messages: ServerSessionMessage[]) {
    const sessions = new Map(get().sessions);
    const session = sessions.get(chatId);
    if (!session) return;
    // Only load if local session has fewer messages (avoid overwriting in-progress work)
    if (session.messages.length >= messages.length) return;

    const chatMessages: ChatMessage[] = messages.map((m, i) => ({
      id: `srv-${chatId}-${i}`,
      type: m.role === 'user' ? 'user' as const : 'assistant' as const,
      text: m.text,
      timestamp: m.timestamp,
      state: m.role === 'assistant' ? {
        status: 'complete' as const,
        userPrompt: '',
        responseText: m.text,
        toolCalls: [],
        costUsd: m.costUsd,
        durationMs: m.durationMs,
      } : undefined,
    }));
    sessions.set(chatId, { ...session, messages: chatMessages });
    persistSessions(sessions);
    set({ sessions });
  },

  /* ---- Groups ---- */
  groups: [],
  setGroups(groups: ChatGroup[]) {
    set({ groups });
  },
  addGroup(group: ChatGroup) {
    set({ groups: [...get().groups, group] });
  },
  removeGroup(groupId: string) {
    set({ groups: get().groups.filter((g) => g.id !== groupId) });
  },
  createGroupSession(group: ChatGroup) {
    const state = get();
    const id = generateId();
    const session: ChatSession = {
      id,
      botName: group.name,  // display name in sidebar
      title: group.name,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      groupId: group.id,
    };
    const sessions = new Map(state.sessions);
    sessions.set(id, session);
    persistSessions(sessions);
    set({ sessions, activeSessionId: id, activeView: 'chat' });
    return id;
  },

  /* ---- Navigation ---- */
  activeView: 'chat',
  setView(v: ActiveView) {
    set({ activeView: v });
  },

  /* ---- Theme ---- */
  theme: (localStorage.getItem('metabot:theme') as Theme) || 'dark',
  toggleTheme() {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('metabot:theme', next);
    document.documentElement.setAttribute('data-theme', next);
    set({ theme: next });
  },

  /* ---- Font size ---- */
  fontSize: (localStorage.getItem('metabot:fontsize') as 'small' | 'normal' | 'large' | 'xl') || 'normal',
  setFontSize(size: 'small' | 'normal' | 'large' | 'xl') {
    const scales: Record<string, string> = { small: '0.9', normal: '1', large: '1.1', xl: '1.25' };
    localStorage.setItem('metabot:fontsize', size);
    document.documentElement.style.setProperty('--font-scale', scales[size] || '1');
    set({ fontSize: size });
  },

  /* ---- Team ---- */
  teamStatus: null,
  setTeamStatus(status: TeamStatus) {
    set({ teamStatus: status });
  },
  teamViewMode: (localStorage.getItem('metabot:teamViewMode') as 'workspace' | 'office') || 'workspace',
  setTeamViewMode(mode: 'workspace' | 'office') {
    localStorage.setItem('metabot:teamViewMode', mode);
    set({ teamViewMode: mode });
  },
  selectedAgentKey: null,
  setSelectedAgentKey(key: string | null) {
    set({ selectedAgentKey: key });
  },
  teamChatBotName: null,
  setTeamChatBotName(name: string | null) {
    set({ teamChatBotName: name });
  },
  teamDetailTab: 'activity',
  setTeamDetailTab(tab: 'activity' | 'stats' | 'info' | 'sessions') {
    set({ teamDetailTab: tab });
  },

  /* ---- Activity feed ---- */
  activityEvents: [],
  addActivityEvent(event: ActivityEvent) {
    const events = [event, ...get().activityEvents].slice(0, 100);
    set({ activityEvents: events });
  },
  setActivityEvents(events: ActivityEvent[]) {
    set({ activityEvents: events });
  },

  /* ---- Incoming voice call ---- */
  incomingVoiceCall: null,
  setIncomingVoiceCall(call) {
    set({ incomingVoiceCall: call });
  },

  /* ---- Streaming ASR ---- */
  asrState: 'idle' as 'idle' | 'connecting' | 'active' | 'error',
  asrPartialText: '',
  setAsrState(state: 'idle' | 'connecting' | 'active' | 'error') { set({ asrState: state }); },
  setAsrPartialText(text: string) { set({ asrPartialText: text }); },

  /* ---- Sidebar ---- */
  sidebarOpen: window.innerWidth > 768,
  toggleSidebar() {
    set({ sidebarOpen: !get().sidebarOpen });
  },
  setSidebarOpen(open: boolean) {
    set({ sidebarOpen: open });
  },

  /* ---- Global defaults ---- */
  defaultEngine: localStorage.getItem('metabot:defaultEngine') || 'claude',
  setDefaultEngine(engine: string) {
    localStorage.setItem('metabot:defaultEngine', engine);
    set({ defaultEngine: engine });
  },
  defaultModel: localStorage.getItem('metabot:defaultModel') || '',
  setDefaultModel(model: string) {
    localStorage.setItem('metabot:defaultModel', model);
    set({ defaultModel: model });
  },
  defaultWorkDir: localStorage.getItem('metabot:defaultWorkDir') || '',
  setDefaultWorkDir(dir: string) {
    localStorage.setItem('metabot:defaultWorkDir', dir);
    set({ defaultWorkDir: dir });
  },

  /* ---- AI Providers ---- */
  aiProviders: [] as import('./utils/models').AIProvider[],
  async loadProviders() {
    try {
      const token = get().token;
      const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch('/api/providers', { headers: authHeaders });
      const data = await res.json();
      const serverProviders: Array<{ id: string; name: string; baseUrl: string; model: string; isDefault: boolean; apiKeyEncrypted: string | null }> = data.providers || [];

      // Migrate localStorage providers to server on first load
      const localRaw = localStorage.getItem('metabot:aiProviders');
      if (localRaw && serverProviders.length === 0) {
        try {
          const localProviders: import('./utils/models').AIProvider[] = JSON.parse(localRaw);
          for (const p of localProviders) {
            await fetch('/api/providers', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...authHeaders },
              body: JSON.stringify({ name: p.name, type: 'openai', baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model, isDefault: false }),
            });
          }
          const res2 = await fetch('/api/providers', { headers: authHeaders });
          const data2 = await res2.json();
          set({ aiProviders: (data2.providers || []).map(mapServerProvider) });
          localStorage.removeItem('metabot:aiProviders');
          return;
        } catch { /* migration failed, continue with server data */ }
      }

      const mapped = serverProviders.map(mapServerProvider);
      const defaultP = serverProviders.find((p) => p.isDefault);
      set({ aiProviders: mapped, defaultProviderId: defaultP?.id || '' });
      localStorage.removeItem('metabot:aiProviders');
    } catch { /* fetch failed */ }
  },
  async addProvider(provider) {
    const token = get().token;
    const res = await fetch('/api/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ name: provider.name, type: 'openai', baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model }),
    });
    if (res.ok) {
      const data = await res.json();
      set({ aiProviders: [...get().aiProviders, mapServerProvider(data.provider)] });
    }
  },
  async updateProvider(id, updates) {
    const token = get().token;
    const res = await fetch(`/api/providers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const data = await res.json();
      const providers = get().aiProviders.map((p) => p.id === id ? mapServerProvider(data.provider) : p);
      set({ aiProviders: providers });
    }
  },
  async removeProvider(id) {
    const token = get().token;
    const res = await fetch(`/api/providers/${id}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (res.ok) {
      const providers = get().aiProviders.filter((p) => p.id !== id);
      const updates: Partial<AppStore> = { aiProviders: providers };
      if (get().defaultProviderId === id) updates.defaultProviderId = '';
      set(updates);
    }
  },
  defaultProviderId: '',
  setDefaultProviderId(id) {
    const token = get().token;
    if (token) {
      fetch(`/api/providers/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isDefault: true }),
      }).catch(() => {});
    }
    set({ defaultProviderId: id });
  },
}));

function mapServerProvider(p: { id: string; name: string; baseUrl: string; model: string; apiKeyEncrypted: string | null; type?: string }): import('./utils/models').AIProvider {
  return {
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    apiKey: p.apiKeyEncrypted || '',
    model: p.model,
    type: (p.type === 'embedding' ? 'embedding' : 'LLM') as import('./utils/models').AIProvider['type'],
  };
}
