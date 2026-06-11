import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KBPage } from '../KBPage';

describe('KBPage', () => {
  it('shows drop zone', () => {
    render(<KBPage onUpload={vi.fn()} />);
    expect(screen.getByText(/拖入文件/)).toBeInTheDocument();
  });

  it('calls onUpload when file dropped', () => {
    const onUpload = vi.fn();
    const { container } = render(<KBPage onUpload={onUpload} />);
    const dropZone = container.querySelector('[data-testid="drop-zone"]')!;
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });
    expect(onUpload).toHaveBeenCalledWith(file);
  });
});
