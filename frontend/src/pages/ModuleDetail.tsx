/**
 * ModuleDetail — 단일 모듈 상세 (UI shell, mock).
 * Win rate 추이 (mock SVG line chart) + 최근 사용 제안서.
 */
import { Link, useParams } from "react-router-dom";
import "./_shell.css";

const TREND = [42, 47, 51, 58, 60, 64, 67, 71, 68, 72, 75, 78];
const RECENT_PROPOSALS = [
  { id: "p-001", title: "스마트팩토리 SD-WAN 도입", customer: "삼성전자", date: "2026-04-25", outcome: "won" as const },
  { id: "p-007", title: "엣지 보안 통합", customer: "한국전력공사", date: "2026-04-22", outcome: "pending" as const },
  { id: "p-014", title: "글로벌 R&D 망", customer: "현대자동차", date: "2026-04-18", outcome: "won" as const },
  { id: "p-022", title: "이커머스 ZTNA", customer: "쿠팡", date: "2026-04-12", outcome: "lost" as const },
  { id: "p-031", title: "공공 백본", customer: "서울시청", date: "2026-04-08", outcome: "won" as const },
];

const OUTCOME_LABELS = { won: "Won", lost: "Lost", pending: "진행 중" };
const OUTCOME_COLORS = { won: "shell-pill-green", lost: "shell-pill-rose", pending: "shell-pill-gray" };

export default function ModuleDetail() {
  const { code } = useParams<{ code: string }>();
  const max = Math.max(...TREND);
  const min = Math.min(...TREND);

  return (
    <div className="page-shell">
      <Link to="/modules" style={{ color: "#6b7280", fontSize: 13, textDecoration: "none" }}>← 모듈 카탈로그</Link>

      <header className="page-shell-head" style={{ marginTop: 8 }}>
        <div>
          <div style={{ fontFamily: "monospace", fontSize: 13, color: "#6b7280" }}>{code}</div>
          <div className="page-shell-title">모듈 상세</div>
          <div className="page-shell-sub">
            누적 사용 빈도 · Win rate 추이 · 최근 적용된 제안서를 한곳에서.
          </div>
        </div>
      </header>

      <div className="page-shell-banner">UI 미리보기 단계입니다. mock 데이터로 구성되어 있습니다.</div>

      <div className="shell-grid-2">
        <section className="shell-card">
          <h3 style={{ marginTop: 0 }}>Win rate 추이 (12 개월)</h3>
          <svg viewBox="0 0 480 200" width="100%" height={200}>
            {/* 배경 그리드 */}
            {[0, 25, 50, 75, 100].map((p) => (
              <line key={p} x1={40} x2={460} y1={20 + (160 * (100 - p)) / 100} y2={20 + (160 * (100 - p)) / 100} stroke="#f3f4f6" strokeWidth={1} />
            ))}
            {/* y축 레이블 */}
            {[0, 25, 50, 75, 100].map((p) => (
              <text key={p} x={32} y={24 + (160 * (100 - p)) / 100} fontSize={10} fill="#9ca3af" textAnchor="end">
                {p}%
              </text>
            ))}
            {/* 라인 */}
            <polyline
              points={TREND.map((v, i) => `${40 + (i * 420) / (TREND.length - 1)},${20 + 160 * (1 - v / 100)}`).join(" ")}
              fill="none"
              stroke="#4338ca"
              strokeWidth={2}
            />
            {/* 점 */}
            {TREND.map((v, i) => (
              <circle key={i} cx={40 + (i * 420) / (TREND.length - 1)} cy={20 + 160 * (1 - v / 100)} r={3} fill="#4338ca" />
            ))}
          </svg>
          <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#6b7280", marginTop: 8 }}>
            <span>최고 {max}%</span>
            <span>최저 {min}%</span>
            <span>평균 {Math.round(TREND.reduce((a, b) => a + b, 0) / TREND.length)}%</span>
          </div>
        </section>

        <section className="shell-card">
          <h3 style={{ marginTop: 0 }}>최근 적용된 제안서</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {RECENT_PROPOSALS.map((p) => (
              <li key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>{p.customer} · {p.date}</div>
                </div>
                <span className={`shell-pill ${OUTCOME_COLORS[p.outcome]}`}>{OUTCOME_LABELS[p.outcome]}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
