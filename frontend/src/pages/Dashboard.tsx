/**
 * Dashboard — 메인 홈 화면.
 * 현재 조직 정보, Quick Actions, 로드맵 상태를 보여줌.
 */
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";
import { useNavigate } from "react-router-dom";
import AssistantPanel from "@/components/ai/AssistantPanel";
import "./Dashboard.css";

const phases = [
  { id: 0, label: "인프라", status: "done" as const },
  { id: 1, label: "인증 · Admin", status: "current" as const },
  { id: 2, label: "핵심 도구", status: "pending" as const },
  { id: 3, label: "AI 통합", status: "pending" as const },
  { id: 4, label: "외부 연동", status: "pending" as const },
  { id: 5, label: "대시보드", status: "pending" as const },
];

function Dashboard() {
  const { user } = useAuth();
  const { currentOrg, organizations, myRole } = useOrg();
  const navigate = useNavigate();
  const displayName =
    user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h2 className="dashboard-greeting">
            안녕하세요, {displayName}님
          </h2>
          <p className="dashboard-subtitle">SmartWAN Platform에 오신 것을 환영합니다</p>
        </div>
        {currentOrg && (
          <div className="dashboard-org-badge">
            <span className="org-name">{currentOrg.name}</span>
            <span className="role-badge">{myRole}</span>
          </div>
        )}
      </header>

      {/* Quick Stats */}
      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{organizations.length}</div>
          <div className="stat-label">소속 조직</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{myRole === "owner" || myRole === "admin" ? "관리자" : "멤버"}</div>
          <div className="stat-label">현재 역할</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">Phase 1</div>
          <div className="stat-label">현재 단계</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">3</div>
          <div className="stat-label">도구 준비중</div>
        </div>
      </section>

      {/* Quick Actions */}
      {!currentOrg && (
        <section className="card onboarding-card">
          <h3>시작하기</h3>
          <p>아직 소속된 조직이 없습니다. 새로운 조직을 만들어서 팀원을 초대하세요.</p>
          <button
            className="btn btn-primary"
            onClick={() => navigate("/org/new")}
          >
            조직 만들기
          </button>
        </section>
      )}

      {currentOrg && (myRole === "owner" || myRole === "admin") && (
        <section className="card">
          <h3>빠른 작업</h3>
          <div className="quick-actions">
            <button className="action-btn" onClick={() => navigate("/members")}>
              <span className="action-icon">👥</span>
              <span>멤버 관리</span>
            </button>
            <button className="action-btn" onClick={() => navigate("/org/settings")}>
              <span className="action-icon">⚙️</span>
              <span>조직 설정</span>
            </button>
            <button className="action-btn" onClick={() => navigate("/audit-logs")}>
              <span className="action-icon">📋</span>
              <span>감사 로그</span>
            </button>
            <button className="action-btn" onClick={() => navigate("/profile")}>
              <span className="action-icon">👤</span>
              <span>내 프로필</span>
            </button>
          </div>
        </section>
      )}

      {/* Roadmap */}
      <section className="card">
        <h3>개발 로드맵</h3>
        <div className="roadmap">
          {phases.map((p) => (
            <div key={p.id} className={`roadmap-item ${p.status}`}>
              <div className="roadmap-dot" />
              <div className="roadmap-label">
                <span className="roadmap-phase">Phase {p.id}</span>
                <span className="roadmap-desc">{p.label}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Upcoming Tools */}
      <section className="card">
        <h3>곧 출시될 도구</h3>
        <div className="tools-preview">
          {[
            { name: "견적 계산기", desc: "SD-WAN/SASE 맞춤형 견적 자동 산출", phase: "Phase 2" },
            { name: "배틀카드", desc: "경쟁사 비교 분석 및 대응 전략", phase: "Phase 2" },
            { name: "제안서 생성기", desc: "AI 기반 맞춤형 제안서 자동 생성", phase: "Phase 2~3" },
          ].map((tool) => (
            <div key={tool.name} className="tool-preview-item">
              <div className="tool-name">{tool.name}</div>
              <div className="tool-desc">{tool.desc}</div>
              <span className="tool-phase">{tool.phase}</span>
            </div>
          ))}
        </div>
      </section>

      <AssistantPanel surface="dashboard" surfaceRefId={null} />
    </div>
  );
}

export default Dashboard;
