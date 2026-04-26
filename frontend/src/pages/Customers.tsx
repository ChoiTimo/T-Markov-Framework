/**
 * Customers — 고객 목록 (UI shell, mock 기반).
 * 신규 고객 모달 / 검색·필터 / 카드 뷰 / 상세 진입.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./_shell.css";

interface MockCustomer {
  id: string;
  company: string;
  industry: string;
  segment: "enterprise" | "midmarket" | "public" | "global";
  contact: string;
  proposalCount: number;
  totalValue: number;
  lastActivity: string;
}

const MOCK_CUSTOMERS: MockCustomer[] = [
  { id: "c-001", company: "삼성전자", industry: "제조", segment: "enterprise", contact: "김상무", proposalCount: 3, totalValue: 480000000, lastActivity: "2026-04-25" },
  { id: "c-002", company: "한국전력공사", industry: "공공/에너지", segment: "public", contact: "이부장", proposalCount: 2, totalValue: 320000000, lastActivity: "2026-04-22" },
  { id: "c-003", company: "신한은행", industry: "금융", segment: "enterprise", contact: "박팀장", proposalCount: 5, totalValue: 720000000, lastActivity: "2026-04-21" },
  { id: "c-004", company: "쿠팡", industry: "이커머스", segment: "midmarket", contact: "최매니저", proposalCount: 1, totalValue: 140000000, lastActivity: "2026-04-19" },
  { id: "c-005", company: "현대자동차", industry: "제조", segment: "global", contact: "정상무", proposalCount: 4, totalValue: 560000000, lastActivity: "2026-04-18" },
  { id: "c-006", company: "서울시청", industry: "공공", segment: "public", contact: "윤과장", proposalCount: 1, totalValue: 90000000, lastActivity: "2026-04-15" },
  { id: "c-007", company: "네이버클라우드", industry: "ICT", segment: "enterprise", contact: "장이사", proposalCount: 2, totalValue: 280000000, lastActivity: "2026-04-12" },
  { id: "c-008", company: "롯데마트", industry: "유통", segment: "midmarket", contact: "강매니저", proposalCount: 1, totalValue: 110000000, lastActivity: "2026-04-08" },
];

const SEGMENT_LABELS: Record<MockCustomer["segment"], string> = {
  enterprise: "엔터프라이즈",
  midmarket: "중견",
  public: "공공",
  global: "글로벌",
};
const SEGMENT_COLORS: Record<MockCustomer["segment"], string> = {
  enterprise: "shell-pill-blue",
  midmarket: "shell-pill-green",
  public: "shell-pill-purple",
  global: "shell-pill-amber",
};

function fmtKRW(n: number): string {
  return n.toLocaleString("ko-KR") + " 원";
}

export default function Customers() {
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState<"all" | MockCustomer["segment"]>("all");
  const [showCreate, setShowCreate] = useState(false);

  const filtered = useMemo(() => {
    return MOCK_CUSTOMERS.filter((c) => {
      if (segment !== "all" && c.segment !== segment) return false;
      if (q && !(c.company + c.industry + c.contact).toLowerCase().includes(q.toLowerCase()))
        return false;
      return true;
    });
  }, [q, segment]);

  return (
    <div className="page-shell">
      <header className="page-shell-head">
        <div>
          <div className="page-shell-title">고객 관리</div>
          <div className="page-shell-sub">고객 목록·세그먼트 분포·관련 제안서를 한곳에서 관리합니다.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + 신규 고객
        </button>
      </header>

      <div className="page-shell-banner">
        UI 미리보기 단계입니다. 백엔드 연결 후 customers 테이블에서 직접 로드합니다.
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          className="shell-search"
          placeholder="고객명·업종·담당자 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {(["all", "enterprise", "midmarket", "public", "global"] as const).map((s) => (
          <button
            key={s}
            className={`btn ${segment === s ? "btn-primary" : "btn-ghost"} small`}
            onClick={() => setSegment(s)}
          >
            {s === "all" ? "전체" : SEGMENT_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="shell-grid-3">
        {filtered.map((c) => (
          <Link key={c.id} to={`/customers/${c.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <article className="shell-card" style={{ cursor: "pointer", transition: "transform 0.1s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>{c.company}</div>
                <span className={`shell-pill ${SEGMENT_COLORS[c.segment]}`}>
                  {SEGMENT_LABELS[c.segment]}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
                {c.industry} · {c.contact}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                <div>
                  <div style={{ color: "#9ca3af" }}>제안서</div>
                  <div style={{ fontWeight: 600, fontSize: 18, color: "#1f2937" }}>{c.proposalCount}건</div>
                </div>
                <div>
                  <div style={{ color: "#9ca3af" }}>누적 가치</div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#4338ca" }}>{fmtKRW(c.totalValue)}</div>
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "#9ca3af" }}>
                마지막 활동: {c.lastActivity}
              </div>
            </article>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="shell-card" style={{ textAlign: "center", color: "#9ca3af", padding: 40 }}>
          조건에 맞는 고객이 없습니다.
        </div>
      )}

      {showCreate && (
        <div role="dialog" aria-modal="true"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="shell-card" style={{ width: 480, maxWidth: "90%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>신규 고객 등록</h3>
              <button className="btn btn-ghost small" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <input className="shell-search" style={{ width: "100%" }} placeholder="회사명" />
              <input className="shell-search" style={{ width: "100%" }} placeholder="업종" />
              <input className="shell-search" style={{ width: "100%" }} placeholder="담당자명" />
              <select className="shell-search" style={{ width: "100%" }}>
                <option>세그먼트 선택</option>
                <option>엔터프라이즈</option>
                <option>중견</option>
                <option>공공</option>
                <option>글로벌</option>
              </select>
            </div>
            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>취소</button>
              <button className="btn btn-primary" onClick={() => setShowCreate(false)}>저장 (mock)</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
