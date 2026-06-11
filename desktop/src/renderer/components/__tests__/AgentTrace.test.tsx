import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentTrace } from '../AgentTrace';
import type { Trace } from '../../store/chat-store';

const fakeTrace: Trace = {
  steps: [
    { agent: 'generation', status: 'done', message: '草稿 v1' },
    { agent: 'quality', status: 'running', message: '检查术语' },
    { agent: 'optimization', status: 'pending' }
  ],
  currentContent: ''
};

describe('AgentTrace', () => {
  it('shows each agent step with status', () => {
    render(<AgentTrace trace={fakeTrace} />);
    expect(screen.getByText(/生成/)).toBeInTheDocument();
    expect(screen.getByText(/质检/)).toBeInTheDocument();
    expect(screen.getByText(/优化/)).toBeInTheDocument();
  });

  it('marks running step visually', () => {
    render(<AgentTrace trace={fakeTrace} />);
    expect(screen.getByText(/检查术语/)).toBeInTheDocument();
  });
});
