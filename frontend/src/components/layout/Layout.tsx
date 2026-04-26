import { useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import NotificationsBell from "@/components/global/NotificationsBell";
import CommandPalette from "@/components/global/CommandPalette";
import OnboardingModal from "@/components/global/OnboardingModal";
import "./Layout.css";

const mainNavItems = [
  { path: "/", label: "Dashboard", icon: "grid" },
  { path: "/customers", label: "고객 관리", icon: "users" },
  { path: "/deals", label: "딜 파이프라인", icon: "layout" },
  { path: "/quotes", label: "견적 계산기", icon: "calculator" },
  { path: "/battlecards", label: "배틀카드", icon: "shield" },
  { path: "/proposals", label: "제안서 생성", icon: "file-text" },
  { path: "/modules", label: "모듈 카탈로그", icon: "package" },
  { path: "/insights", label: "통합 인사이트", icon: "trending-up" },
  { path: "/reports", label: "리포트", icon: "bar-chart" },
];

const adminNavItems = [
  { path: "/members", label: "멤버 관리", icon: "users" },
  { path: "/org/settings", label: "조직 설정", icon: "settings" },
  { path: "/settings/ai", label: "AI 설정", icon: "cpu" },
  { path: "/settings/notifications", label: "알림 설정", icon: "bell" },
  { path: "/audit-logs", label: "감사 로그", icon: "clipboard" },
];

function Layout() {
  const { user, signOut } = useAuth();
  const { currentOrg, organizations, myRole, switchOrg } = useOrg();
  const isAdmin = myRole === "owner" || myRole === "admin";
  const [showOnboarding, setShowOnboarding] = useState(false);

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
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 12,
            padding: "10px 16px",
            background: "linear-gradient(90deg, #312e81, #4338ca)",
            color: "#fff",
            fontSize: 13,
          }}
        >
          <button
            type="button"
            onClick={() => setShowOnboarding(true)}
            title="환영 가이드 다시 보기"
            style={{
              background: "rgba(255,255,255,0.15)",
              border: "none",
              color: "#fff",
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            가이드
          </button>
          <span style={{ opacity: 0.7, fontSize: 11 }}>Cmd/Ctrl + K 로 빠른 이동</span>
          <NotificationsBell />
        </div>
        <Outlet />
      </main>

      <CommandPalette />
      <OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} />
    </div>
  );
}

export default Layout;
