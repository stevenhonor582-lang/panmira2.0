import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { ChatPage } from './pages/ChatPage';
import { BrowserPage } from './pages/BrowserPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { KBPage } from './pages/KBPage';

function Nav() {
  const loc = useLocation();
  const linkStyle = (path: string): React.CSSProperties => ({
    padding: '8px 16px',
    textDecoration: 'none',
    color: loc.pathname === path ? '#1e40af' : '#555',
    fontWeight: loc.pathname === path ? 600 : 400,
    borderBottom: loc.pathname === path ? '2px solid #1e40af' : '2px solid transparent',
  });
  return (
    <nav style={{ display: 'flex', gap: 4, padding: '0 24px', borderBottom: '1px solid #eee', background: '#fafafa' }}>
      <Link to="/" style={linkStyle('/')}>Chat</Link>
      <Link to="/templates" style={linkStyle('/templates')}>Templates</Link>
      <Link to="/browser" style={linkStyle('/browser')}>Browser</Link>
      <Link to="/kb" style={linkStyle('/kb')}>KB</Link>
    </nav>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Nav />
      {children}
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Shell><ChatPage /></Shell>} />
        <Route path="/templates" element={<Shell><TemplatesPage /></Shell>} />
        <Route path="/browser" element={<Shell><BrowserPage /></Shell>} />
        <Route path="/kb" element={<Shell><KBPage /></Shell>} />
      </Routes>
    </BrowserRouter>
  );
}
