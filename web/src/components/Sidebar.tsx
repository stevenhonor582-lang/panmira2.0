import { NavLink } from 'react-router-dom';

export interface SidebarItem {
  to: string;
  label: string;
  icon?: string;
}

export interface SidebarGroup {
  label: string;
  items: SidebarItem[];
}

interface Props {
  groups: SidebarGroup[];
  onNavigate?: () => void;
}

export function Sidebar({ groups, onNavigate }: Props) {
  return (
    <nav className="sidebar" aria-label="主导航">
      {groups.map((group) => (
        <div key={group.label} className="sidebar-group">
          <div className="sidebar-group-label">{group.label}</div>
          <ul className="sidebar-list">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/app'}
                  className={({ isActive }) =>
                    isActive ? 'sidebar-link active' : 'sidebar-link'
                  }
                  onClick={onNavigate}
                >
                  {item.icon && <span className="sidebar-icon">{item.icon}</span>}
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
