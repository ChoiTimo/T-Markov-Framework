/**
 * BattleCards — 목록 페이지 (Phase 2 Sprint 2-2)
 * 경쟁사별 배틀카드 카드 그리드 + 필터 + 검색 + 생성
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import {
  createCard,
  deleteCard,
  listCards,
} from "@/services/battlecards";
import type { BattleCard, BattleCardStatus } from "@/types/battlecard";
import { STATUS_LABELS } from "@/types/battlecard";
import "./BattleCards.css";

function threatStars(n: number): string {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function BattleCards() {
  const navigate = useNavigate();
  const { currentOrg, myRole } = useOrg();
  const [cards, setCards] = useState<BattleCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [threatMin, setThreatMin] = useState<number>(0);
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(false);

  // New card quick form
  const [newCompetitorName, setNewCompetitorName] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newThreat, setNewThreat] = useState(3);
  const [newCategory, setNewCategory] = useState("global-vendor");
  const [creating, setCreating] = useState(false);

  const canEdit = myRole === "owner" || myRole === "admin" || myRole === "member";

  useEffect(() => {
    if (!currentOrg) return;
    let cancelled = false;
    setLoading(true);
    listCards({
      orgId: currentOrg.id,
      status: statusFilter || undefined,
      category: category || undefined,
      threat_min: threatMin || undefined,
      q: q || undefined,
    })
      .then((data) => {
        if (!cancelled) {
          setCards(data);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "로드 실패");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentOrg, statusFilter, category, threatMin, q]);

  const grouped = useMemo(() => {
    const byThreat: Record<number, BattleCard[]> = {};
    cards.forEach((c) => {
      const t = c.competitor?.threat_level ?? 3;
      byThreat[t] = byThreat[t] ?? [];
      byThreat[t].push(c);
    });
    return byThreat;
  }, [cards]);

  async function handleCreate() {
    if (!currentOrg) return;
    if (!newCompetitorName.trim() || !newTitle.trim()) {
      setError("경쟁사명과 카드 제목을 입력해주세요.");
      return;
    }
    setCreating(true);
    try {
      const card = await createCard({
        organization_id: currentOrg.id,
        competitor: {
          organization_id: currentOrg.id,
          name: newCompetitorName,
          category: newCategory,
          threat_level: newThreat,
        },
        title: newTitle,
      });
      setShowNew(false);
      setNewCompetitorName("");
      setNewTitle("");
      navigate(`/battlecards/${card.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("이 배틀카드를 삭제하시겠어요?")) return;
    try {
      await deleteCard(id);
      setCards((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    }
  }

  if (!currentOrg) {
    return (
      <div className="battlecards-page">
        <h2>배틀카드</h2>
        <p className="muted">먼저 조직을 선택하거나 생성해주세요.</p>
      </div>
    );
  }

  return (
    <div className="battlecards-page">
      <header className="bc-header">
        <div>
          <h2>배틀카드</h2>
          <p className="muted">
            경쟁사별 강점·약점·차별화 포인트를 관리하고 견적·제안서에서 바로 참조할 수 있습니다.
          </p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowNew(!showNew)}>
            {showNew ? "닫기" : "+ 새 카드"}
          </button>
        )}
      </header>

      {showNew && (
        <section className="card bc-new-form">
          <h3>새 배틀카드</h3>
          <div className="form-grid">
            <label>
              <span>경쟁사 이름 *</span>
              <input
                type="text"
                value={newCompetitorName}
                onChange={(e) => setNewCompetitorName(e.target.value)}
                placeholder="예: Cisco SD-WAN"
              />
            </label>
            <label>
              <span>카드 제목 *</span>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="예: 2026 Cisco 대응 전략"
              />
            </label>
            <label>
              <span>카테고리</span>
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
                <option value="global-vendor">글로벌 벤더</option>
                <option value="domestic-telco">국내 통신사</option>
                <option value="cloud-native">클라우드 네이티브</option>
                <option value="startup">스타트업</option>
              </select>
            </label>
            <label>
              <span>위협도 (1-5)</span>
              <input
                type="number"
                min="1"
                max="5"
                value={newThreat}
                onChange={(e) => setNewThreat(Number(e.target.value))}
              />
            </label>
          </div>
          <div className="row-actions" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
              {creating ? "생성 중…" : "생성"}
            </button>
            <button className="btn btn-ghost" onClick={() => setShowNew(false)}>
              취소
            </button>
          </div>
        </section>
      )}

      <div className="bc-toolbar">
        <input
          type="text"
          className="bc-search"
          placeholder="카드 제목, 핵심 메시지, 경쟁사 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">전체 상태</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">전체 카테고리</option>
          <option value="global-vendor">글로벌 벤더</option>
          <option value="domestic-telco">국내 통신사</option>
          <option value="cloud-native">클라우드 네이티브</option>
          <option value="startup">스타트업</option>
        </select>
        <select value={threatMin} onChange={(e) => setThreatMin(Number(e.target.value))}>
          <option value={0}>위협도 전체</option>
          <option value={5}>⭐ 5 이상</option>
          <option value={4}>⭐ 4 이상</option>
          <option value={3}>⭐ 3 이상</option>
        </select>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <div className="muted">불러오는 중…</div>}

      {!loading && cards.length === 0 && (
        <div className="empty-state">
          <h3>아직 배틀카드가 없습니다</h3>
          <p className="muted">첫 경쟁사 카드를 만들어 대응 전략을 기록해보세요.</p>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setShowNew(true)}>
              첫 카드 만들기
            </button>
          )}
        </div>
      )}

      {/* Card grid - grouped by threat level descending */}
      {[5, 4, 3, 2, 1].map((t) => {
        const group = grouped[t];
        if (!group || group.length === 0) return null;
        return (
          <section key={t} className="bc-threat-group">
            <h3 className="bc-threat-label">
              <span className={`threat-badge threat-${t}`}>{threatStars(t)}</span>
              <span>위협도 {t}</span>
              <span className="muted small">({group.length})</span>
            </h3>
            <div className="bc-grid">
              {group.map((card) => (
                <article key={card.id} className="bc-card" onClick={() => navigate(`/battlecards/${card.id}`)}>
                  <header className="bc-card-head">
                    <div className="bc-card-title-row">
                      <h4>{card.competitor?.name || "(삭제된 경쟁사)"}</h4>
                      <span className={`status-badge status-${card.status as BattleCardStatus}`}>
                        {STATUS_LABELS[card.status]}
                      </span>
                    </div>
                    {card.competitor?.category && (
                      <span className="bc-category">{card.competitor.category}</span>
                    )}
                  </header>
                  <div className="bc-card-body">
                    <div className="bc-card-title">{card.title}</div>
                    {card.key_insight && <p className="bc-insight">💡 {card.key_insight}</p>}
                    {card.competitor?.summary && (
                      <p className="bc-summary">{card.competitor.summary}</p>
                    )}
                  </div>
                  <footer className="bc-card-foot">
                    <span className="muted small">
                      {card.last_reviewed_at
                        ? `리뷰: ${new Date(card.last_reviewed_at).toLocaleDateString("ko-KR")}`
                        : "리뷰 전"}
                    </span>
                    {(myRole === "owner" || myRole === "admin") && (
                      <button
                        className="btn btn-ghost btn-sm danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(card.id);
                        }}
                      >
                        삭제
                      </button>
                    )}
                  </footer>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default BattleCards;
