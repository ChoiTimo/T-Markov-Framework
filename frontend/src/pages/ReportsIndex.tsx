/**
 * ReportsIndex — 리포트 인덱스 페이지 (UI shell, mock).
 */
import { Link } from "react-router-dom";
import "./_shell.css";

const REPORTS = [
  {
    path: "/insights",
    title: "통합 인사이트",
    desc: "KPI · 일 요약 · Win/Loss 퍼널 · 모듈별 Win rate · 도구 사용 통계",
    kpi: { label: "주간 인사이트", value: "+12%" },
    color: "#4338ca",
  },
  {
    path: "/reports/competitive",
    title: "경쟁 인텔리전스 피드",
    desc: "경쟁사 동향 자동 수집 + 배틀카드 갱신 제안 큐",
    kpi: { label: "신규 신호", value: "5건" },
    color: "#dc2626",
  },
  {
    path: "/reports/ai-recommendations",
    title: "AI 추천 리포트",
    desc: "Claude 추천 호출 추적 · 적용률 · 상위 모듈",
    kpi: { label: "주간 호출", value: "412회" },
    color: "#16a34a",
  },
  {
    path: "/audit-logs",
    title: "감사 로그",
    desc: "모든 사용자 활동 기록 · 권한 변경 · 데이터 변경 이력",
    kpi: { label: "오늘 이벤트", value: "184건" },
    color: "#0891b2",
  },
];

export default function ReportsIndex() {
  return (
    <div className="page-shell">
      <header className="page-shell-head">
        <div>
          <div className="page-shell-title">리포트</div>
          <div className="page-shell-sub">조직 활동·AI 사용·경쟁 동향을 한 곳에서 모니터링합니다.</div>
        </div>
      </header>

      <div className="shell-grid-2">
        {REPORTS.map((r) => (
          <Link key={r.path} to={r.path} style={{ textDecoration: "none", color: "inherit" }}>
            <article
              className="shell-card"
              style={{
                cursor: "pointer",
                borderLeft: `4px solid ${r.color}`,
                padding: "20px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>{r.title}</div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>{r.kpi.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: r.color }}>{r.kpi.value}</div>
                </div>
              </div>
              <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
                {r.desc}
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: r.color, fontWeight: 600 }}>
                보기 →
              </div>
            </article>
          </Link>
        ))}
      </div>
    </div>
  );
}
