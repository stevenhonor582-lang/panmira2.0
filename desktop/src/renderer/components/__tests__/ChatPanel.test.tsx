import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatPanel } from '../ChatPanel';

describe('ChatPanel', () => {
  it('renders input + send button', () => {
    render(<ChatPanel onSend={vi.fn()} />);
    expect(screen.getByPlaceholderText(/输入内容/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /发送/ })).toBeInTheDocument();
  });

  it('calls onSend when send clicked', () => {
    const onSend = vi.fn();
    render(<ChatPanel onSend={onSend} />);
    fireEvent.change(screen.getByPlaceholderText(/输入内容/), {
      target: { value: '写一段井口装置描述' }
    });
    fireEvent.click(screen.getByRole('button', { name: /发送/ }));
    expect(onSend).toHaveBeenCalledWith('写一段井口装置描述');
  });
});
