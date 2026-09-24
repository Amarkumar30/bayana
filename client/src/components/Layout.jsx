import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Layout() {
  const { vendor, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    {
      to: '/dashboard',
      label: 'Dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      to: '/clients',
      label: 'Clients',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      to: '/proposals',
      label: 'Proposals',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      to: '/contracts',
      label: 'Contracts',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      ),
    },
    {
      to: '/invoices',
      label: 'Invoices',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      to: '/settings',
      label: 'Settings',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col md:flex-row text-stone-900">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-stone-200 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-amber-800 text-white font-bold flex items-center justify-center text-sm shadow-sm">
            B
          </span>
          <span className="font-bold text-lg tracking-tight text-amber-950">Bayana</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg text-stone-600 hover:bg-stone-100"
          aria-label="Toggle navigation menu"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-20 bg-stone-900/40 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}>
          <div
            className="w-64 bg-white h-full p-4 flex flex-col justify-between shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="flex items-center gap-2 px-2 py-3 mb-4 border-b border-stone-100">
                <span className="w-8 h-8 rounded-lg bg-amber-800 text-white font-bold flex items-center justify-center text-sm">
                  B
                </span>
                <div>
                  <div className="font-bold text-sm text-stone-900">{vendor?.businessName || 'Bayana'}</div>
                  <div className="text-xs text-stone-500 truncate max-w-[140px]">{vendor?.email}</div>
                </div>
              </div>
              <nav className="space-y-1">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                        isActive ? 'bg-amber-50 text-amber-900 font-semibold' : 'text-stone-600 hover:bg-stone-100'
                      }`
                    }
                  >
                    {item.icon}
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
            <div className="pt-4 border-t border-stone-100 space-y-2">
              <a
                href={`/book/${vendor?.publicSlug || 'bayana-studio'}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2 px-3 text-xs font-semibold text-amber-900 bg-amber-50 rounded-lg hover:bg-amber-100"
              >
                <span>View Public Booking Page</span>
                <span>↗</span>
              </a>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full py-2 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 rounded-lg text-left"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col justify-between w-64 bg-white border-r border-stone-200 p-5 sticky top-0 h-screen shrink-0">
        <div>
          {/* Brand header */}
          <div className="flex items-center gap-3 px-2 py-2 mb-6">
            <span className="w-9 h-9 rounded-xl bg-amber-800 text-white font-bold flex items-center justify-center text-base shadow-sm">
              B
            </span>
            <div>
              <span className="font-bold text-lg tracking-tight text-amber-950 block leading-tight">Bayana</span>
              <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider block">CRM for Creatives</span>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                    isActive ? 'bg-amber-800 text-white shadow-sm' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                  }`
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* User profile & footer */}
        <div className="pt-4 border-t border-stone-100 space-y-3">
          <div className="px-2">
            <p className="text-xs font-bold text-stone-900 truncate">{vendor?.businessName || 'Bayana Studio'}</p>
            <p className="text-[11px] text-stone-500 truncate">{vendor?.email}</p>
          </div>

          <a
            href={`/book/${vendor?.publicSlug || 'bayana-studio'}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between w-full py-2 px-3 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 rounded-lg transition"
          >
            <span>Public Booking Link</span>
            <span>↗</span>
          </a>

          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 w-full py-2 px-3 text-xs font-medium text-stone-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}
