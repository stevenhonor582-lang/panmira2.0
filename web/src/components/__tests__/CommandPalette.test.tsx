import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CommandPalette } from '../CommandPalette';
import { useCommandPalette } from '../../store/command-palette';

describe('CommandPalette', () => {
  beforeEach(() => {
    useCommandPalette.setState({ open: false });
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renders dialog when open', () => {
    useCommandPalette.getState().setOpen(true);
    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('lists sidebar items as commands', () => {
    useCommandPalette.getState().setOpen(true);
    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>
    );
    expect(screen.getByText('总览')).toBeInTheDocument();
    expect(screen.getByText('模型池')).toBeInTheDocument();
    expect(screen.getByText('数智底座')).toBeInTheDocument();
  });

  it('closes on Escape key', () => {
    useCommandPalette.getState().setOpen(true);
    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(useCommandPalette.getState().open).toBe(false);
  });

  it('filters items by query', () => {
    useCommandPalette.getState().setOpen(true);
    render(
      <MemoryRouter>
        <CommandPalette />
      </MemoryRouter>
    );
    const input = screen.getByPlaceholderText(/搜索/);
    fireEvent.change(input, { target: { value: '模型' } });
    expect(screen.getByText('模型池')).toBeInTheDocument();
    expect(screen.queryByText('数智底座')).toBeNull();
  });

  it('navigates on item click and closes', () => {
    useCommandPalette.setState({ open: true });
    render(
      <MemoryRouter initialEntries={['/app']}>
        <CommandPalette />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText('模型池'));
    expect(useCommandPalette.getState().open).toBe(false);
  });
});
