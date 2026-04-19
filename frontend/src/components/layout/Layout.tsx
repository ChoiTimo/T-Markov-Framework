import { Outlet, NavLink } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import "./Layout.css";

const mainNavItems = [
  { path: "/", label: "Dashboard", icon: "grid" },
  { path: "/quotes", label: "견적계산기", icon: "calculator" },
  { path: "/battlecards", label: "배틀카드", icon: "shield" },
  { path: "/proposals", label: "제안서 생성", icon: "file-text" },
  { path: "/reports/ai-recommendations", label: "AI 추천 리포트", icon: "bar-chart" },
];

const adminNavItems = [
  { path: "/members", label: "멤버 관리", icon: "users" },
  { path: "/org/settings", label: "조직 설정", icon: "settings" },
  { path: "/audit-logs", label: "감사 로그", icon: "clipboard" },
];

function Layout() {
  const { user, signOut } = useAuth();
  const { currentOrg, organizations, myRole, switchOrg } = useOrg();
  const isAdmin = myRole === "owner" || myRole === "admin";

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="logo">SmartWAN</h1>
          <span className="version">v0.2.0</span>
        </div>

        {/* 조직 전환 */}
        {organizations.length > 0 && (
          <div className="org-switcher">
            <select
              className="org-select"
              value={currentOrg?.id ?? ""}
              onChange={(e) => switchOrg(e.target.value)}
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            {myRole && <span className="role-pill">{myRole}</span>}
          </div>
        )}

        <nav className="sidebar-nav">
          <div className="nav-section-label">메인</div>
          {mainNavItems.map((item) => (
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

          {isAdmin && (
            <>
              <div className="nav-section-label" style={{ marginTop: 16 }}>
                관리
              </div>
              {adminNavItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `nav-item ${isActive ? "active" : ""}`
                  }
                >
                  <span className="nav-label">{item.label}</span>
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          {user && (
            <div className="user-section">
              <NavLink to="/profile" className="user-info-link">
                <div className="user-info">
                  {user.user_metadata?.avatar_url && (
                    <img
                      src={user.user_metadata.avatar_url}
                      alt=""
                      className="user-avatar"
                    />
                  )}
                  <span className="user-email">
                    {user.user_metadata?.full_name ||
                      user.email?.split("@")[0]}
                  </span>
                </div>
              </NavLink>
              <button className="sign-out-btn" onClick={signOut}>
                로그아웃
              </button>
            </div>
          )}
          <span className="phase-badge">Sprint 1-2</span>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
