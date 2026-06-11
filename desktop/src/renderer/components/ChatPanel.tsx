import { useState, type FormEvent } from 'react';

interface Props {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatPanel({ onSend, disabled }: Props) {
  const [input, setInput] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput('');
  }

  return (
    <form onSubmit={handleSubmit} data-testid="chat-panel">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="输入内容需求..."
        disabled={disabled}
      />
      <button type="submit" disabled={disabled || !input.trim()}>
        发送
      </button>
    </form>
  );
}
