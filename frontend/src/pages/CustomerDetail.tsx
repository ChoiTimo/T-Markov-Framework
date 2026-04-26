/**
 * CustomerDetail — 고객 상세 (UI shell, mock).
 */
import { Link, useParams } from "react-router-dom";
import "./_shell.css";

interface MockProposal { id: string; title: string; status: "draft" | "sent" | "won" | "lost"; value: number; date: string; }
interface MockActivity { ts: string; kind: "meeting" | "email" | "proposal" | "note"; text: string; }

const MOCK_PROPOSALS: Record<string, MockProposal[]> = {
  "c-001": [
    { id: "p-001", title: "스마트팩토리 SD-WAN 도입", status: "sent", value: 180000000, date: "2026-04-20" },
    { id: "p-002", title: "지점 보안 통합 (50개 거점)", status: "won", value: 220000000, date: "2026-03-15" },
    { id: "p-003", title: "클라우드 ZTNA 통합 운영", status: "draft", value: 80000000, date: "2026-04-25" },
  ],
};

const MOCK_ACTIVITIES: MockActivity[] = [
  { ts: "2026-04-25 14:30", kind: "proposal", text: "신규 제안서 '클라우드 ZTNA 통합 운영' 작성 시작" },
  { ts: "2026-04-22 10:00", kind: "meeting", text: "분기 리뷰 미팅 (강남지점)" },
  { ts: "2026-04-20 09:15", kind: "email", text: "RFP 응답 메일 발송" },
  { ts: "2026-04-15 16:45", kind: "note", text: "예산 승인 일정 1주 지연 통보" },
];

const STATUS_LABELS = { draft: "초안", sent: "발송", won: "성사", lost: "실패" };
const STATUS_COLORS = { draft: "shell-pill-gray", sent: "shell-pill-blue", won: "shell-pill-green", lost: "shell-pill-rose" };
const KIND_ICON = { meeting: "👥", email: "✉️", proposal: "📄", note: "📝" };

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const proposals = (id && MOCK_PROPOSALS[id]) || MOCK_PROPOSALS["c-001"];

  return (
    <div className="page-shell">
      <Link to="/customers" style={{ color: "#6b7280", fontSize: 13, textDecoration: "none" }}>← 고객 목록</Link>

      <header className="page-shell-head" style={{ marginTop: 8 }}>
        <div>
          <div className="page-shell-title">고객 #{id}</div>
          <div className="page-shell-sub">엔터프라이즈 · 제조 · 김상무</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost">정보 편집</button>
          <button className="btn btn-primary">+ 신규 제안서</button>
        </div>
      </header>

      <div className="page-shell-banner">UI 미리보기 단계입니다. mock 데이터로 구성되어 있습니다.</div>

      <div className="shell-grid-2">
        <section className="shell-card">
          <h3 style={{ marginTop: 0 }}>관련 제안서 ({proposals.length})</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {proposals.map((p) => (
              <li key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>{p.date}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className={`shell-pill ${STATUS_COLORS[p.status]}`}>{STATUS_LABELS[p.status]}</span>
                  <span style={{ fontSize: 13, color: "#4338ca", fontWeight: 600 }}>
                    {p.value.toLocaleString()}원
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="shell-card">
          <h3 style={{ marginTop: 0 }}>활동 타임라인</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {MOCK_ACTIVITIES.map((a, idx) => (
              <li key={idx} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: "1px solid #f3f4f6" }}>
                <div style={{ fontSize: 18 }}>{KIND_ICON[a.kind]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13 }}>{a.text}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>{a.ts}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
