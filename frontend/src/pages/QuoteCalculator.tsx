/**
 * 견적계산기 — 견적 목록 화면 (Phase 2 Sprint 2-1)
 *
 * - 조직의 견적 목록을 카드/테이블로 표시
 * - 상태 필터, 신규 생성, 상세 편집 이동
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import { listQuotes, deleteQuote, duplicateQuote, formatKRW } from "@/services/quotes";
import type { Quote, QuoteStatus } from "@/types/quote";
import "./Quotes.css";

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: "초안",
  pending_review: "검토 대기",
  approved: "승인",
  sent: "발송됨",
  accepted: "수주",
  rejected: "실주",
  expired: "만료",
  archived: "아카이브",
};

function QuoteCalculator() {
  const navigate = useNavigate();
  const { currentOrg, myRole } = useOrg();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const canEdit = myRole === "owner" || myRole === "admin" || myRole === "member";

  useEffect(() => {
    if (!currentOrg) return;
    let cancelled = false;
    setLoading(true);
    listQuotes(currentOrg.id, statusFilter || undefined)
      .then((data) => {
        if (!cancelled) {
          setQuotes(data);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "견적을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentOrg, statusFilter]);

  const filtered = quotes.filter((q) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (q.title || "").toLowerCase().includes(s) ||
      (q.quote_number || "").toLowerCase().includes(s) ||
      (q.customer_company || "").toLowerCase().includes(s) ||
      (q.customer_name || "").toLowerCase().includes(s)
    );
  });

  async function handleDuplicate(id: string) {
    try {
      const newQuote = await duplicateQuote(id);
      navigate(`/quotes/${newQuote.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "복제 실패");
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("이 견적을 삭제하시겠어요? 되돌릴 수 없습니다.")) return;
    try {
      await deleteQuote(id);
      setQuotes((prev) => prev.filter((q) => q.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    }
  }

  if (!currentOrg) {
    return (
      <div className="quotes-page">
        <h2>견적 관리</h2>
        <p className="muted">먼저 조직을 선택하거나 생성해주세요.</p>
      </div>
    );
  }

  return (
    <div className="quotes-page">
      <header className="quotes-header">
        <div>
          <h2>견적 관리</h2>
          <p className="muted">
            조직의 견적을 생성·버전 관리하고 PDF로 내보낼 수 있습니다.
          </p>
        </div>
        {canEdit && (
          <button
            className="btn btn-primary"
            onClick={() => navigate("/quotes/new")}
          >
            + 새 견적
          </button>
        )}
      </header>

      <div className="quotes-toolbar">
        <input
          type="text"
          placeholder="견적번호, 제목, 고객사 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="quotes-search"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="quotes-filter"
        >
          <option value="">전체 상태</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <div className="muted">불러오는 중…</div>}

      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          <h3>아직 견적이 없습니다</h3>
          <p className="muted">첫 견적을 만들어 세일즈 프로세스를 시작해보세요.</p>
          {canEdit && (
            <button
              className="btn btn-primary"
              onClick={() => navigate("/quotes/new")}
            >
              첫 견적 만들기
            </button>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="quotes-table-wrap">
          <table className="quotes-table">
            <thead>
              <tr>
                <th>견적번호</th>
                <th>제목</th>
                <th>고객사</th>
                <th>상태</th>
                <th>약정</th>
                <th className="num">월 금액 (세후)</th>
                <th>최종 수정</th>
                <th style={{ width: 160 }}>작업</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((q) => (
                <tr key={q.id}>
                  <td>
                    <code className="quote-number">{q.quote_number || "-"}</code>
                  </td>
                  <td>
                    <button
                      className="link-cell"
                      onClick={() => navigate(`/quotes/${q.id}`)}
                    >
                      {q.title || "(제목 없음)"}
                    </button>
                  </td>
                  <td>{q.customer_company || q.customer_name || "-"}</td>
                  <td>
                    <span className={`status-badge status-${q.status}`}>
                      {STATUS_LABELS[q.status]}
                    </span>
                  </td>
                  <td>{q.contract_months ? `${q.contract_months / 12}년` : "무약정"}</td>
                  <td className="num strong">{formatKRW(q.total_amount)}</td>
                  <td className="muted-date">
                    {new Date(q.updated_at).toLocaleDateString("ko-KR")}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => navigate(`/quotes/${q.id}`)}
                      >
                        편집
                      </button>
                      {canEdit && (
                        <>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleDuplicate(q.id)}
                          >
                            복제
                          </button>
                          {(myRole === "owner" || myRole === "admin") && (
                            <button
                              className="btn btn-ghost btn-sm danger"
                              onClick={() => handleDelete(q.id)}
                            >
                              삭제
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default QuoteCalculator;
