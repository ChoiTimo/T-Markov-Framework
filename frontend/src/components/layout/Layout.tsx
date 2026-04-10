import { Outlet, NavLink } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import "./Layout.css";

const navItems = [
  { path: "/", label: "Dashboard", icon: "grid" },
  { path: "/quotes", label: "견적계산기", icon: "calculator" },
  { path: "/battlecards", label: "배틀카드", icon: "shield" },
  { path: "/proposals", label: "제안서 생성", icon: "file-text" },
];

function Layout() {
  const { user, signOut } = useAuth();

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
          {user && (
            <div className="user-section">
              <div className="user-info">
                {user.user_metadata?.avatar_url && (
                  <img
                    src={user.user_metadata.avatar_url}
                    alt=""
                    className="user-avatar"
                  />
                )}
                <span className="user-email">
                  {user.email?.split("@")[0]}
                </span>
              </div>
              <button className="sign-out-btn" onClick={signOut}>
                로그아웃
              </button>
            </div>
          )}
          <span className="phase-badge">Phase 1</span>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
