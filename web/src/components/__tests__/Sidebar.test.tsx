import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../Sidebar';

describe('Sidebar', () => {
  const groups = [
    {
      label: '工作台',
      items: [
        { to: '/app', label: '总览' },
        { to: '/app/status', label: '实时状态' },
      ],
    },
    {
      label: '资源',
      items: [
        { to: '/app/models', label: '模型池' },
        { to: '/app/knowledge', label: '数智底座' },
        { to: '/app/resources', label: 'Skill / MCP 池' },
      ],
    },
  ];

  it('renders all group labels', () => {
    render(<MemoryRouter><Sidebar groups={groups} /></MemoryRouter>);
    expect(screen.getByText('工作台')).toBeInTheDocument();
    expect(screen.getByText('资源')).toBeInTheDocument();
  });

  it('renders all item labels', () => {
    render(<MemoryRouter><Sidebar groups={groups} /></MemoryRouter>);
    expect(screen.getByText('总览')).toBeInTheDocument();
    expect(screen.getByText('模型池')).toBeInTheDocument();
    expect(screen.getByText('数智底座')).toBeInTheDocument();
  });

  it('renders links with correct href', () => {
    render(<MemoryRouter><Sidebar groups={groups} /></MemoryRouter>);
    const dashboardLink = screen.getByText('总览').closest('a');
    expect(dashboardLink).toHaveAttribute('href', '/app');
  });

  it('highlights active route with aria-current', () => {
    render(<MemoryRouter initialEntries={['/app/models']}><Sidebar groups={groups} /></MemoryRouter>);
    const activeLink = screen.getByText('模型池').closest('a');
    expect(activeLink).toHaveAttribute('aria-current', 'page');
  });
});
