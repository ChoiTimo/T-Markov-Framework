/**
 * BattleCardDetail — 상세 페이지 (Phase 2 Sprint 2-2)
 * 인라인 편집 + 드래그앤드롭으로 포인트 재정렬 + 탭별 분류
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useOrg } from "@/contexts/OrgContext";
import {
  addPoint,
  addReference,
  archiveCard,
  deletePoint,
  deleteReference,
  getCard,
  patchPoint,
  publishCard,
  reorderPoints,
  updateCard,
  updateCompetitor,
} from "@/services/battlecards";
import type {
  BattleCard,
  BattlePoint,
  PointType,
} from "@/types/battlecard";
import {
  POINT_TYPE_COLORS,
  POINT_TYPE_LABELS,
  POINT_TYPE_ORDER,
  STATUS_LABELS,
} from "@/types/battlecard";
import "./BattleCards.css";

// ---- Sortable point row ----
function SortablePointRow({
  point,
  canEdit,
  onPatch,
  onDelete,
}: {
  point: BattlePoint;
  canEdit: boolean;
  onPatch: (patch: Partial<BattlePoint>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: point.id,
  });
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(point.title);
  const [detail, setDetail] = useState(point.detail || "");
  const [url, setUrl] = useState(point.evidence_url || "");

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function save() {
    onPatch({ title, detail, evidence_url: url || null });
    setEditing(false);
  }

  function cancel() {
    setTitle(point.title);
    setDetail(point.detail || "");
    setUrl(point.evidence_url || "");
    setEditing(false);
  }

  return (
    <div ref={setNodeRef} style={style} className="point-row">
      {canEdit && (
        <span className="drag-handle" {...attributes} {...listeners} title="드래그로 순서 변경">
          ⋮⋮
        </span>
      )}
      <div className="point-body">
        {editing ? (
          <>
            <input
              className="point-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="포인트 제목"
              autoFocus
            />
            <textarea
              className="point-detail-input"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="상세 내용 (마크다운 bullet 가능)"
              rows={3}
            />
            <input
              className="point-url-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="출처 URL (선택)"
            />
            <div className="row-actions">
              <button className="btn btn-primary btn-sm" onClick={save}>저장</button>
              <button className="btn btn-ghost btn-sm" onClick={cancel}>취소</button>
            </div>
          </>
        ) : (
          <>
            <div className="point-title" onClick={() => canEdit && setEditing(true)}>
              {point.title}
              {point.ai_generated && <span className="ai-badge">AI</span>}
            </div>
            {point.detail && <div className="point-detail">{point.detail}</div>}
            {point.evidence_url && (
              <a href={point.evidence_url} target="_blank" rel="noreferrer" className="point-url">
                🔗 출처 보기
              </a>
            )}
          </>
        )}
      </div>
      {canEdit && !editing && (
        <div className="point-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>편집</button>
          <button className="btn btn-ghost btn-sm danger" onClick={onDelete}>삭제</button>
        </div>
      )}
    </div>
  );
}

// ---- Main detail page ----
function BattleCardDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { myRole } = useOrg();

  const canEdit = myRole === "owner" || myRole === "admin" || myRole === "member";

  const [card, setCard] = useState<BattleCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Card meta edits
  const [editMeta, setEditMeta] = useState(false);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [overview, setOverview] = useState("");
  const [keyInsight, setKeyInsight] = useState("");

  // Competitor meta
  const [editComp, setEditComp] = useState(false);
  const [compSummary, setCompSummary] = useState("");
  const [compThreat, setCompThreat] = useState(3);
  const [compCategory, setCompCategory] = useState("");

  // Active tab
  const [activeTab, setActiveTab] = useState<PointType>("differentiator");

  // Add point form
  const [newPointTitle, setNewPointTitle] = useState("");
  const [newPointDetail, setNewPointDetail] = useState("");

  // Add reference
  const [newRefTitle, setNewRefTitle] = useState("");
  const [newRefUrl, setNewRefUrl] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const reload = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getCard(id);
      setCard(data);
      setTitle(data.title);
      setSubtitle(data.subtitle || "");
      setOverview(data.overview || "");
      setKeyInsight(data.key_insight || "");
      setCompSummary(data.competitor?.summary || "");
      setCompThreat(data.competitor?.threat_level || 3);
      setCompCategory(data.competitor?.category || "");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "로드 실패");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const pointsByType = useMemo(() => {
    const map: Record<PointType, BattlePoint[]> = {
      strength: [], weakness: [], differentiator: [],
      counter: [], question: [], insight: [],
    };
    (card?.points || []).forEach((p) => {
      map[p.type].push(p);
    });
    Object.keys(map).forEach((t) => {
      map[t as PointType].sort((a, b) => a.sort_order - b.sort_order);
    });
    return map;
  }, [card?.points]);

  async function saveMeta() {
    if (!card) return;
    try {
      await updateCard(card.id, { title, subtitle, overview, key_insight: keyInsight });
      setEditMeta(false);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장 실패");
    }
  }

  async function saveCompetitor() {
    if (!card?.competitor) return;
    try {
      await updateCompetitor(card.competitor.id, {
        summary: compSummary,
        threat_level: compThreat,
        category: compCategory,
      });
      setEditComp(false);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장 실패");
    }
  }

  async function handleAddPoint() {
    if (!card || !newPointTitle.trim()) return;
    try {
      await addPoint(card.id, {
        type: activeTab,
        title: newPointTitle,
        detail: newPointDetail || undefined,
        sort_order: pointsByType[activeTab].length,
      });
      setNewPointTitle("");
      setNewPointDetail("");
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "추가 실패");
    }
  }

  async function handlePatchPoint(pid: string, patch: Partial<BattlePoint>) {
    if (!card) return;
    try {
      await patchPoint(card.id, pid, patch);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "수정 실패");
    }
  }

  async function handleDeletePoint(pid: string) {
    if (!card) return;
    if (!window.confirm("이 포인트를 삭제하시겠어요?")) return;
    try {
      await deletePoint(card.id, pid);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    if (!card) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const list = pointsByType[activeTab];
    const oldIdx = list.findIndex((p) => p.id === active.id);
    const newIdx = list.findIndex((p) => p.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const moved = arrayMove(list, oldIdx, newIdx);
    // Optimistic update
    setCard((c) => {
      if (!c) return c;
      const others = (c.points || []).filter((p) => p.type !== activeTab);
      const renumbered = moved.map((p, i) => ({ ...p, sort_order: i }));
      return { ...c, points: [...others, ...renumbered] };
    });
    try {
      await reorderPoints(card.id, moved.map((p, i) => ({ id: p.id, sort_order: i })));
    } catch (e) {
      alert(e instanceof Error ? e.message : "순서 저장 실패");
      await reload();
    }
  }

  async function handlePublish() {
    if (!card) return;
    try {
      await publishCard(card.id);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "공개 실패");
    }
  }

  async function handleArchive() {
    if (!card) return;
    if (!window.confirm("이 카드를 아카이브하시겠어요?")) return;
    try {
      await archiveCard(card.id);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "아카이브 실패");
    }
  }

  async function handleAddReference() {
    if (!card || !newRefTitle.trim()) return;
    try {
      await addReference(card.id, {
        title: newRefTitle,
        url: newRefUrl || undefined,
        source_type: "news",
      });
      setNewRefTitle("");
      setNewRefUrl("");
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "참조 추가 실패");
    }
  }

  if (loading && !card) return <div className="battlecards-page"><p className="muted">로딩…</p></div>;
  if (error) return <div className="battlecards-page"><div className="alert alert-error">{error}</div></div>;
  if (!card) return null;

  const comp = card.competitor;
  const activeList = pointsByType[activeTab];

  return (
    <div className="battlecards-page bc-detail">
      <div className="breadcrumb">
        <button className="link-cell" onClick={() => navigate("/battlecards")}>← 배틀카드 목록</button>
      </div>

      {/* Header card */}
      <section className="card bc-detail-header">
        <div className="bc-detail-head-row">
          <div>
            <div className="bc-detail-competitor">
              {comp?.logo_url && <img src={comp.logo_url} alt="" className="bc-logo" />}
              <div>
                <h2>{comp?.name || "(경쟁사)"}</h2>
                <div className="bc-detail-meta">
                  <span className={`status-badge status-${card.status}`}>{STATUS_LABELS[card.status]}</span>
                  {comp?.category && <span className="bc-category">{comp.category}</span>}
                  {comp && (
                    <span className={`threat-badge threat-${comp.threat_level}`}>
                      위협도 {comp.threat_level}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {!editMeta && (
              <>
                <h3 className="bc-detail-title">{card.title}</h3>
                {card.subtitle && <p className="muted">{card.subtitle}</p>}
                {card.key_insight && (
                  <p className="bc-detail-insight">💡 {card.key_insight}</p>
                )}
              </>
            )}
          </div>
          <div className="row-actions">
            {canEdit && card.status !== "published" && (
              <button className="btn btn-primary" onClick={handlePublish}>📢 공개</button>
            )}
            {canEdit && card.status === "published" && (myRole === "owner" || myRole === "admin") && (
              <button className="btn btn-ghost" onClick={handleArchive}>🗄 아카이브</button>
            )}
            {canEdit && (
              <button className="btn btn-ghost" onClick={() => setEditMeta(!editMeta)}>
                {editMeta ? "취소" : "카드 편집"}
              </button>
            )}
          </div>
        </div>

        {editMeta && (
          <div className="bc-edit-form">
            <label>
              <span>카드 제목</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label>
              <span>부제</span>
              <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
            </label>
            <label>
              <span>핵심 메시지 (한 줄)</span>
              <input value={keyInsight} onChange={(e) => setKeyInsight(e.target.value)} />
            </label>
            <label>
              <span>개요</span>
              <textarea rows={4} value={overview} onChange={(e) => setOverview(e.target.value)} />
            </label>
            <button className="btn btn-primary" onClick={saveMeta}>저장</button>
          </div>
        )}

        {!editMeta && card.overview && (
          <div className="bc-overview">{card.overview}</div>
        )}
      </section>

      {/* Competitor panel */}
      <section className="card">
        <div className="card-header-row">
          <h3>경쟁사 정보</h3>
          {canEdit && (
            <button className="btn btn-ghost btn-sm" onClick={() => setEditComp(!editComp)}>
              {editComp ? "취소" : "편집"}
            </button>
          )}
        </div>
        {editComp ? (
          <div className="bc-edit-form">
            <label>
              <span>요약</span>
              <input value={compSummary} onChange={(e) => setCompSummary(e.target.value)} />
            </label>
            <label>
              <span>위협도 (1-5)</span>
              <input type="number" min={1} max={5} value={compThreat} onChange={(e) => setCompThreat(Number(e.target.value))} />
            </label>
            <label>
              <span>카테고리</span>
              <select value={compCategory} onChange={(e) => setCompCategory(e.target.value)}>
                <option value="global-vendor">글로벌 벤더</option>
                <option value="domestic-telco">국내 통신사</option>
                <option value="cloud-native">클라우드 네이티브</option>
                <option value="startup">스타트업</option>
              </select>
            </label>
            <button className="btn btn-primary" onClick={saveCompetitor}>저장</button>
          </div>
        ) : (
          <>
            {comp?.summary && <p>{comp.summary}</p>}
            {comp?.website && (
              <p>
                <a href={comp.website} target="_blank" rel="noreferrer">🔗 {comp.website}</a>
              </p>
            )}
          </>
        )}
      </section>

      {/* Tabs for point types */}
      <section className="card">
        <div className="bc-tabs">
          {POINT_TYPE_ORDER.map((t) => (
            <button
              key={t}
              className={`bc-tab ${activeTab === t ? "active" : ""}`}
              onClick={() => setActiveTab(t)}
              style={{ borderColor: activeTab === t ? POINT_TYPE_COLORS[t] : undefined }}
            >
              {POINT_TYPE_LABELS[t]}
              <span className="bc-tab-count">{pointsByType[t].length}</span>
            </button>
          ))}
        </div>

        <div className="bc-points" style={{ borderTopColor: POINT_TYPE_COLORS[activeTab] }}>
          {activeList.length === 0 ? (
            <p className="muted empty-state-inline">
              아직 {POINT_TYPE_LABELS[activeTab]} 포인트가 없습니다.
            </p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={activeList.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                {activeList.map((p) => (
                  <SortablePointRow
                    key={p.id}
                    point={p}
                    canEdit={canEdit}
                    onPatch={(patch) => handlePatchPoint(p.id, patch)}
                    onDelete={() => handleDeletePoint(p.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}

          {canEdit && (
            <div className="bc-add-point">
              <input
                type="text"
                value={newPointTitle}
                onChange={(e) => setNewPointTitle(e.target.value)}
                placeholder={`새 ${POINT_TYPE_LABELS[activeTab]} 포인트 제목`}
              />
              <textarea
                value={newPointDetail}
                onChange={(e) => setNewPointDetail(e.target.value)}
                placeholder="상세 내용 (선택)"
                rows={2}
              />
              <button className="btn btn-primary btn-sm" onClick={handleAddPoint}>
                + 추가
              </button>
            </div>
          )}
        </div>
      </section>

      {/* References */}
      <section className="card">
        <h3>참조 자료</h3>
        {(card.references || []).length === 0 ? (
          <p className="muted">참조 링크가 없습니다.</p>
        ) : (
          <ul className="ref-list">
            {(card.references || []).map((r) => (
              <li key={r.id}>
                <span className={`ref-type ref-${r.source_type}`}>{r.source_type}</span>
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer">{r.title}</a>
                ) : (
                  <span>{r.title}</span>
                )}
                {canEdit && (
                  <button
                    className="btn btn-ghost btn-sm danger"
                    onClick={() => deleteReference(card.id, r.id).then(reload)}
                  >
                    삭제
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="bc-add-ref">
            <input
              type="text"
              value={newRefTitle}
              onChange={(e) => setNewRefTitle(e.target.value)}
              placeholder="참조 제목"
            />
            <input
              type="url"
              value={newRefUrl}
              onChange={(e) => setNewRefUrl(e.target.value)}
              placeholder="URL"
            />
            <button className="btn btn-ghost btn-sm" onClick={handleAddReference}>+ 참조 추가</button>
          </div>
        )}
      </section>
    </div>
  );
}

export default BattleCardDetail;
