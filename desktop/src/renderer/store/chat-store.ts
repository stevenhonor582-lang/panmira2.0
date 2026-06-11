import { create } from 'zustand';
import type { AgentName, StepStatus, Role } from '../../../shared/agent-types';

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
}

export interface TraceStep {
  agent: AgentName;
  status: StepStatus;
  message?: string;
  startedAt?: number;
  endedAt?: number;
}

export interface Trace {
  steps: TraceStep[];
  currentContent: string;
}

interface ChatState {
  messages: Message[];
  currentTrace: Trace | null;
  isStreaming: boolean;
  appendMessage: (m: Omit<Message, 'id' | 'timestamp'>) => void;
  startTrace: () => void;
  updateTraceStep: (agent: AgentName, status: StepStatus, message?: string) => void;
  appendContent: (delta: string) => void;
  finishStream: () => void;
  reset: () => void;
}

let nextId = 0;
const genId = () => `m_${++nextId}`;

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  currentTrace: null,
  isStreaming: false,

  appendMessage: (m) =>
    set((s) => ({
      messages: [...s.messages, { ...m, id: genId(), timestamp: Date.now() }]
    })),

  startTrace: () =>
    set({
      currentTrace: {
        steps: [
          { agent: 'generation', status: 'pending' },
          { agent: 'quality', status: 'pending' },
          { agent: 'optimization', status: 'pending' },
          { agent: 'verification', status: 'pending' },
          { agent: 'memory', status: 'pending' },
          { agent: 'execution', status: 'pending' }
        ],
        currentContent: ''
      },
      isStreaming: true
    }),

  updateTraceStep: (agent, status, message) =>
    set((s) => {
      if (!s.currentTrace) return s;
      return {
        currentTrace: {
          ...s.currentTrace,
          steps: s.currentTrace.steps.map((step) =>
            step.agent === agent
              ? {
                  ...step,
                  status,
                  message,
                  startedAt: step.startedAt ?? Date.now(),
                  endedAt: status === 'done' || status === 'failed' ? Date.now() : undefined
                }
              : step
          )
        }
      };
    }),

  appendContent: (delta) =>
    set((s) =>
      s.currentTrace
        ? { currentTrace: { ...s.currentTrace, currentContent: s.currentTrace.currentContent + delta } }
        : s
    ),

  finishStream: () => {
    const trace = get().currentTrace;
    if (!trace) return;
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: genId(),
          role: 'assistant',
          content: trace.currentContent,
          timestamp: Date.now()
        }
      ],
      currentTrace: null,
      isStreaming: false
    }));
  },

  reset: () => set({ messages: [], currentTrace: null, isStreaming: false })
}));
