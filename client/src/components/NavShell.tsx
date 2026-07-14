import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import './NavShell.css';

const TABS = [
  { to: '/', label: 'Wardrobe' },
  { to: '/outfits', label: 'Outfits' },
  { to: '/review', label: 'Review' },
  { to: '/stats', label: 'Stats' },
];

export function NavShell(props: { children: ReactNode; onPickFiles: () => void }) {
  return (
    <div className="shell">
      <header className="shell-header">
        <div className="brand">
          <span className="brand-mark">w</span>
          <span className="brand-name">
            wardrobe<span className="brand-dot">.io</span>
          </span>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <button className="primary" onClick={props.onPickFiles}>
          Add photos
        </button>
      </header>
      <main className="shell-main">{props.children}</main>
      <footer className="shell-foot">
        drop photos anywhere · everything stays on your machine
      </footer>
    </div>
  );
}
