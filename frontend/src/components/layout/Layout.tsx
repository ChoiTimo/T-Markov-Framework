import { Outlet, NavLink } from "react-router-dom";
import "./Layout.css";

const navItems = [
  { path: "/", label: "Dashboard", icon: "grid" },
  { path: "/quotes", label: "견적계산기", icon: "calculator" },
  { path: "/battlecards", label: "배틀카드", icon: "shield" },
  { path: "/proposals", label: "제안서 생성", icon: "file-text" },
];

function Layout() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="logo">SmartWAN</h1>
          <span className="version">v0.1.0</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="phase-badge">Phase 0</span>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
