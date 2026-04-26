/**
 * ProposalEditor — Sprint 2-4 (extended editor)
 *
 * Sprint 2-3 baseline + Sprint 2-4 additions:
 *  - DnD slide reordering (@dnd-kit sortable)
 *  - Per-slide duplicate / delete actions
 *  - Module library reselection (insert from 18-module catalog)
 *  - Version drawer with snapshot restore
 *  - Inline markdown editor for slide body text
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useOrg } from "@/contexts/OrgContext";
import { listCards } from "@/services/battlecards";
import { listQuotes } from "@/services/quotes";
import {
  assembleProposal,
  deleteSlide,
  downloadBlob,
  duplicateSlide,
  getProposal,
  insertSlide,
  listSlideModules,
  listVersions,
  patchSlide,
  publishProposal,
  recommendModules,
  renderProposalPptx,
  reorderSlides,
  restoreVersion,
  snapshotVersion,
  updateProposal,
} from "@/services/proposals";
import type {
  AssembleResult,
  NeuroLevel,
  Proposal,
  ProposalSlide,
  ProposalSlideModule,
  ProposalStatus,
  ProposalVersion,
  RecommendationResult,
  SlidePhase,
  TargetPersona,
} from "@/types/proposal";
import {
  DOGMA_LABELS,
  NEURO_LEVEL_LABELS,
  PERSONA_LABELS,
  PHASE_COLORS,
  PHASE_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/types/proposal";
import type { BattleCard } from "@/types/battlecard";
import type { Quote } from "@/types/quote";
import AssistantPanel from "@/components/ai/AssistantPanel";
import SuccessProbabilityGauge from "@/components/proposals/SuccessProbabilityGauge";
import WinLossLabelModal from "@/components/proposals/WinLossLabelModal";
import "./Proposals.css";

// ------------------------------------------------------------------
// Simple markdown renderer (bold, bullets, line breaks).
// Keeps us free of extra runtime deps while covering 90% of cases.
// ------------------------------------------------------------------

function renderMarkdown(src: string): ReactElement {
  const lines = src.split("\n");
  const blocks: ReactElement[] = [];
  let bulletBuf: string[] = [];
  const flushBullets = (key: string) => {
    if (!bulletBuf.length) return;
    blocks.push(
      <ul key={key} className="pe-md-bullets">
        {bulletBuf.map((b, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: inlineMd(b) }} />
        ))}
      </ul>,
    );
    bulletBuf = [];
  };
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (/^[-*]\s+/.test(line)) {
      bulletBuf.push(line.replace(/^[-*]\s+/, ""));
    } else if (line === "") {
      flushBullets(`u-${idx}`);
      blocks.push(<div key={`sp-${idx}`} className="pe-md-spacer" />);
    } else {
      flushBullets(`u-${idx}`);
      blocks.push(
        <p
          key={`p-${idx}`}
          className="pe-md-p"
          dangerouslySetInnerHTML={{ __html: inlineMd(line) }}
        />,
      );
    }
  });
  flushBullets("u-end");
  return <div className="pe-md-preview">{blocks}</div>;
}

function inlineMd(text: string): string {
  // Order matters: escape first, then bold, then italic.
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

// ------------------------------------------------------------------
// Main component
// ------------------------------------------------------------------

function ProposalEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentOrg, myRole } = useOrg();

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [slides, setSlides] = useState<ProposalSlide[]>([]);
  const [showWinLossModal, setShowWinLossModal] = useState(false);
  const [lastDealOutcome, setLastDealOutcome] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [battleCards, setBattleCards] = useState<BattleCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assembling, setAssembling] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [lastAssemble, setLastAssemble] = useState<AssembleResult | null>(null);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);

  // Sprint 2-4 state
  const [showModuleLib, setShowModuleLib] = useState(false);
  const [moduleInsertPosition, setModuleInsertPosition] = useState<number | null>(null);
  const [modules, setModules] = useState<ProposalSlideModule[]>([]);
  const [modulesLoaded, setModulesLoaded] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<ProposalVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // Sprint 2-5 state — Claude API recommendation
  const [showRecommend, setShowRecommend] = useState(false);
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  const [recommendError, setRecommendError] = useState<string | null>(null);
  const [recommendNotes, setRecommendNotes] = useState("");

  const canEdit = myRole === "owner" || myRole === "admin" || myRole === "member";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function reload() {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getProposal(id);
      setProposal(data);
      setSlides(data.slides || []);
      setError(null);
    } catch (e: any) {
      setError(e.message || "로드 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [id]);

  useEffect(() => {
    if (!currentOrg) return;
    Promise.all([
      listQuotes(currentOrg.id),
      listCards({ orgId: currentOrg.id }),
    ])
      .then(([qs, bcs]) => {
        setQuotes(qs);
        setBattleCards(bcs);
      })
      .catch(() => {
        /* optional data, non-fatal */
      });
  }, [currentOrg?.id]);

  const activeSlide = useMemo(
    () => slides.find((s) => s.id === activeSlideId) || null,
    [slides, activeSlideId],
  );

  async function ensureModulesLoaded() {
    if (modulesLoaded || !currentOrg) return;
    try {
      const mods = await listSlideModules(currentOrg.id);
      setModules(mods);
      setModulesLoaded(true);
    } catch (e: any) {
      alert(e.message || "모듈 카탈로그 로드 실패");
    }
  }

  async function handleHeaderSave(patch: Partial<Proposal>) {
    if (!proposal) return;
    try {
      const updated = await updateProposal(proposal.id, patch as any);
      setProposal((p) => (p ? { ...p, ...updated } : p));
    } catch (e: any) {
      alert(e.message || "저장 실패");
    }
  }

  async function handleAssemble(preserveCustomizations = true) {
    if (!proposal) return;
    setAssembling(true);
    try {
      const res = await assembleProposal(proposal.id, { preserve_customizations: preserveCustomizations });
      setSlides(res.slides);
      setLastAssemble(res.result);
    } catch (e: any) {
      alert(e.message || "슬라이드 조립 실패");
    } finally {
      setAssembling(false);
    }
  }

  async function handleRender() {
    if (!proposal) return;
    setRendering(true);
    try {
      const blob = await renderProposalPptx(proposal.id);
      downloadBlob(blob, `${proposal.proposal_number || "proposal"}.pptx`);
    } catch (e: any) {
      alert(e.message || "PPTX 생성 실패");
    } finally {
      setRendering(false);
    }
  }

  async function handlePublish(target: ProposalStatus) {
    if (!proposal) return;
    try {
      const updated = await publishProposal(proposal.id, target);
      setProposal((p) => (p ? { ...p, ...updated } : p));
    } catch (e: any) {
      alert(e.message || "상태 변경 실패");
    }
  }

  async function handleSnapshot() {
    if (!proposal) return;
    const note = prompt("변경 요약 (선택):", "") || "";
    try {
      await snapshotVersion(proposal.id, note);
      alert("버전 스냅샷이 저장되었습니다.");
      await refreshVersions();
    } catch (e: any) {
      alert(e.message || "스냅샷 실패");
    }
  }

  async function handleSlidePatch(slideId: string, patch: Partial<ProposalSlide>) {
    if (!proposal) return;
    try {
      const updated = await patchSlide(proposal.id, slideId, patch as any);
      setSlides((prev) => prev.map((s) => (s.id === slideId ? { ...s, ...updated } : s)));
    } catch (e: any) {
      alert(e.message || "슬라이드 저장 실패");
    }
  }

  // ----- Sprint 2-4 handlers -----

  async function handleDragEnd(event: DragEndEvent) {
    if (!proposal) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = slides.findIndex((s) => s.id === active.id);
    const newIdx = slides.findIndex((s) => s.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;

    const prev = slides;
    const reordered = arrayMove(slides, oldIdx, newIdx);
    // Re-assign contiguous sort_orders for UI
    const withOrder = reordered.map((s, i) => ({ ...s, sort_order: (i + 1) * 10 }));
    setSlides(withOrder);
    try {
      await reorderSlides(
        proposal.id,
        withOrder.map((s) => ({ id: s.id, sort_order: s.sort_order })),
      );
    } catch (e: any) {
      setSlides(prev);
      alert(e.message || "순서 변경 실패");
    }
  }

  async function handleDuplicate(slideId: string) {
    if (!proposal) return;
    try {
      await duplicateSlide(proposal.id, slideId);
      await reload();
    } catch (e: any) {
      alert(e.message || "슬라이드 복제 실패");
    }
  }

  async function handleDelete(slideId: string) {
    if (!proposal) return;
    if (!confirm("이 슬라이드를 삭제하시겠어요? (되돌리려면 버전 스냅샷에서 복원하세요)")) return;
    try {
      await deleteSlide(proposal.id, slideId);
      if (activeSlideId === slideId) setActiveSlideId(null);
      await reload();
    } catch (e: any) {
      alert(e.message || "슬라이드 삭제 실패");
    }
  }

  async function handleInsertModule(moduleCode: string) {
    if (!proposal) return;
    try {
      await insertSlide(proposal.id, {
        module_code: moduleCode,
        position: moduleInsertPosition ?? undefined,
      });
      setShowModuleLib(false);
      setModuleInsertPosition(null);
      await reload();
    } catch (e: any) {
      alert(e.message || "슬라이드 추가 실패");
    }
  }

  // ----- Sprint 2-5 handlers — Claude API recommendation -----

  async function openRecommend() {
    if (!proposal) return;
    setShowRecommend(true);
    if (recommendation) return;
    setRecommendLoading(true);
    setRecommendError(null);
    try {
      const res = await recommendModules(proposal.id, {
        additional_notes: recommendNotes.trim() || undefined,
      });
      setRecommendation(res);
    } catch (e: any) {
      setRecommendError(e.message || "추천 요청 실패");
    } finally {
      setRecommendLoading(false);
    }
  }

  async function refreshRecommend() {
    if (!proposal) return;
    setRecommendLoading(true);
    setRecommendError(null);
    try {
      const res = await recommendModules(proposal.id, {
        additional_notes: recommendNotes.trim() || undefined,
      });
      setRecommendation(res);
    } catch (e: any) {
      setRecommendError(e.message || "추천 요청 실패");
    } finally {
      setRecommendLoading(false);
    }
  }

  async function handleApplyRecommendedAddition(code: string) {
    if (!proposal) return;
    const match = recommendation?.additions.find((a) => a.code === code);
    try {
      await insertSlide(proposal.id, {
        module_code: code,
        recommendation_event_id: recommendation?.event_id ?? undefined,
        recommendation_reason: match?.reason,
      });
      await reload();
    } catch (e: any) {
      alert(e.message || "슬라이드 추가 실패");
    }
  }

  async function handleApplyRecommendedRemoval(code: string) {
    if (!proposal) return;
    const target = slides.find((s) => s.code === code);
    if (!target) {
      alert("해당 슬라이드를 찾을 수 없습니다.");
      return;
    }
    if (!confirm(`[${code}] 슬라이드를 삭제하시겠어요?`)) return;
    try {
      await deleteSlide(proposal.id, target.id, {
        recommendation_event_id: recommendation?.event_id ?? undefined,
      });
      if (activeSlideId === target.id) setActiveSlideId(null);
      await reload();
    } catch (e: any) {
      alert(e.message || "슬라이드 삭제 실패");
    }
  }

  async function refreshVersions() {
    if (!proposal) return;
    setVersionsLoading(true);
    try {
      const rows = await listVersions(proposal.id);
      setVersions(rows);
    } catch (e: any) {
      alert(e.message || "버전 목록 로드 실패");
    } finally {
      setVersionsLoading(false);
    }
  }

  async function openVersionDrawer() {
    setShowVersions(true);
    await refreshVersions();
  }

  async function handleRestoreVersion(v: ProposalVersion) {
    if (!proposal) return;
    if (!confirm(`v${v.version_number}로 복원하시겠어요? 현재 상태는 자동 스냅샷이 저장됩니다.`)) return;
    try {
      await restoreVersion(proposal.id, v.id, { snapshot_before_restore: true });
      setShowVersions(false);
      await reload();
    } catch (e: any) {
      alert(e.message || "복원 실패");
    }
  }

  // ----- Body preview (read-only) -----

  function renderSlidePreview(s: ProposalSlide) {
    const body = (s.body || {}) as Record<string, any>;
    return (
      <div className="pe-slide-preview-inner">
        <div className="pe-slide-phase-badge" style={{ background: PHASE_COLORS[s.phase] }}>
          {PHASE_LABELS[s.phase]}
        </div>
        {s.neuro_dogma && (
          <div className="pe-dogma-badge">{DOGMA_LABELS[s.neuro_dogma]}</div>
        )}
        <h3>{s.title || s.name}</h3>
        {body.subtitle && <div className="pe-sub">{body.subtitle}</div>}
        {body.narrative && <p className="pe-body-text">{body.narrative}</p>}
        {body.twist && <p className="pe-body-text emphasis">{body.twist}</p>}
        {body.scenario && <p className="pe-body-text">{body.scenario}</p>}
        {Array.isArray(body.bullets) && (
          <ul className="pe-bullets">
            {body.bullets.map((b: string, i: number) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        )}
        {Array.isArray(body.pains) && (
          <ul className="pe-bullets">
            {body.pains.map((b: string, i: number) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        )}
        {Array.isArray(body.sections) && (
          <ol className="pe-bullets">
            {body.sections.map((b: string, i: number) => (
              <li key={i}>{b}</li>
            ))}
          </ol>
        )}
        {body.monthly_amount && (
          <div className="pe-highlight">
            월 이용료(세후): ₩{Number(body.monthly_amount).toLocaleString()}
          </div>
        )}
        {body.call_to_action && (
          <div className="pe-cta-box">{body.call_to_action}</div>
        )}
      </div>
    );
  }

  if (loading && !proposal) return <div className="muted">로드 중...</div>;
  if (error && !proposal) return <div className="error-banner">{error}</div>;
  if (!proposal) return null;

  return (
    <div className="proposal-editor">
      <div className="pe-topbar">
        <button className="btn-link" onClick={() => navigate("/proposals")}>
          ← 목록으로
        </button>
        <div className="pe-topbar-right">
          <span
            className="pe-status"
            style={{ background: STATUS_COLORS[proposal.status] }}
          >
            {STATUS_LABELS[proposal.status]}
          </span>
          {canEdit && (
            <>
              <button className="btn btn-ghost" disabled={assembling} onClick={() => handleAssemble(true)}>
                {assembling ? "조립 중..." : "슬라이드 재조립"}
              </button>
              <button className="btn btn-ghost" onClick={openRecommend}>
                AI 추천
              </button>
              <button className="btn btn-ghost" onClick={handleSnapshot}>
                버전 스냅샷
              </button>
              <button className="btn btn-ghost" onClick={openVersionDrawer}>
                버전 기록
              </button>
              <button className="btn btn-primary" disabled={rendering} onClick={handleRender}>
                {rendering ? "생성 중..." : "PPTX 내보내기"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="pe-header card">
        <div className="pe-form-grid">
          <label>
            <span>제목</span>
            <input
              defaultValue={proposal.title}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== proposal.title) {
                  handleHeaderSave({ title: e.target.value.trim() });
                }
              }}
              disabled={!canEdit}
            />
          </label>
          <label>
            <span>고객사</span>
            <input
              defaultValue={proposal.customer_company ?? ""}
              onBlur={(e) => handleHeaderSave({ customer_company: e.target.value })}
              disabled={!canEdit}
            />
          </label>
          <label>
            <span>타겟</span>
            <select
              value={proposal.target_persona}
              onChange={(e) => handleHeaderSave({ target_persona: e.target.value as TargetPersona })}
              disabled={!canEdit}
            >
              {(Object.keys(PERSONA_LABELS) as TargetPersona[]).map((k) => (
                <option key={k} value={k}>
                  {PERSONA_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>뉴로 레벨</span>
            <select
              value={proposal.neuro_level}
              onChange={(e) => handleHeaderSave({ neuro_level: e.target.value as NeuroLevel })}
              disabled={!canEdit}
            >
              {(Object.keys(NEURO_LEVEL_LABELS) as NeuroLevel[]).map((k) => (
                <option key={k} value={k}>
                  {NEURO_LEVEL_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>연결된 견적</span>
            <select
              value={proposal.quote_id ?? ""}
              onChange={(e) => handleHeaderSave({ quote_id: e.target.value || null } as any)}
              disabled={!canEdit}
            >
              <option value="">(없음)</option>
              {quotes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.quote_number || q.id.slice(0, 8)} · {q.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>배틀카드 (복수 선택)</span>
            <select
              multiple
              value={proposal.battle_card_ids}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, (o) => o.value);
                handleHeaderSave({ battle_card_ids: selected });
              }}
              disabled={!canEdit}
              size={Math.min(4, Math.max(2, battleCards.length))}
            >
              {battleCards.map((bc) => (
                <option key={bc.id} value={bc.id}>
                  {bc.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        {canEdit && (
          <div className="pe-publish-row">
            <span className="muted small">상태 변경:</span>
            {(["draft", "in_review", "approved", "sent", "won", "lost", "archived"] as ProposalStatus[]).map((s) => (
              <button
                key={s}
                className={`btn-pill ${proposal.status === s ? "active" : ""}`}
                onClick={() => handlePublish(s)}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        )}
      </div>

      {lastAssemble && (
        <div className="pe-assemble-summary">
          <b>조립 결과:</b> 총 {lastAssemble.slide_count}장 · 유지 {lastAssemble.preserved_count}장 ·
          Phase 분포 {Object.entries(lastAssemble.selection_stats.phase_distribution)
            .map(([k, v]) => `${k}:${v}`)
            .join(" / ")}
          {lastAssemble.warnings.length > 0 && (
            <ul className="pe-warnings">
              {lastAssemble.warnings.map((w, i) => (
                <li key={i}>⚠ {w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="pe-slides-layout">
        <div className="pe-slides-list">
          <div className="pe-slides-header">
            <span>슬라이드 ({slides.length}장)</span>
            {canEdit && (
              <button
                className="pe-icon-btn"
                title="모듈 라이브러리에서 추가"
                onClick={() => {
                  setModuleInsertPosition(null);
                  setShowModuleLib(true);
                  ensureModulesLoaded();
                }}
              >
                + 모듈 추가
              </button>
            )}
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={slides.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {slides.map((s, idx) => (
                <SortableSlideTile
                  key={s.id}
                  slide={s}
                  index={idx}
                  active={activeSlideId === s.id}
                  canEdit={canEdit}
                  onSelect={() => setActiveSlideId(s.id)}
                  onDuplicate={() => handleDuplicate(s.id)}
                  onDelete={() => handleDelete(s.id)}
                  onInsertAfter={() => {
                    setModuleInsertPosition(idx + 2);
                    setShowModuleLib(true);
                    ensureModulesLoaded();
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <div className="pe-slide-preview">
          {activeSlide ? (
            <>
              <div className="pe-preview-toolbar">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={activeSlide.is_enabled}
                    onChange={(e) =>
                      handleSlidePatch(activeSlide.id, { is_enabled: e.target.checked } as any)
                    }
                    disabled={!canEdit}
                  />
                  활성화
                </label>
                <input
                  className="pe-title-edit"
                  defaultValue={activeSlide.title ?? ""}
                  onBlur={(e) => {
                    if (canEdit && e.target.value !== (activeSlide.title ?? "")) {
                      handleSlidePatch(activeSlide.id, { title: e.target.value } as any);
                    }
                  }}
                  disabled={!canEdit}
                />
              </div>
              {renderSlidePreview(activeSlide)}
              {canEdit && (
                <>
                  <MarkdownBodyEditor
                    key={activeSlide.id}
                    slide={activeSlide}
                    onSave={(body) => handleSlidePatch(activeSlide.id, { body } as any)}
                  />
                  <details className="pe-raw-editor">
                    <summary>원본 body(JSON) 편집 (고급)</summary>
                    <BodyJsonEditor
                      slide={activeSlide}
                      onSave={(body) => handleSlidePatch(activeSlide.id, { body } as any)}
                    />
                  </details>
                </>
              )}
            </>
          ) : (
            <div className="muted" style={{ padding: 20 }}>
              왼쪽에서 슬라이드를 선택하세요.
            </div>
          )}
        </div>
      </div>

      {showModuleLib && (
        <ModuleLibraryModal
          modules={modules}
          insertPosition={moduleInsertPosition}
          onClose={() => {
            setShowModuleLib(false);
            setModuleInsertPosition(null);
          }}
          onSelect={handleInsertModule}
        />
      )}

      {showVersions && (
        <VersionDrawer
          versions={versions}
          loading={versionsLoading}
          onClose={() => setShowVersions(false)}
          onRestore={handleRestoreVersion}
          canRestore={canEdit}
        />
      )}

      {showRecommend && (
        <RecommendModal
          loading={recommendLoading}
          error={recommendError}
          result={recommendation}
          notes={recommendNotes}
          canApply={canEdit}
          currentSlideCodes={new Set(slides.map((s) => s.code))}
          onNotesChange={setRecommendNotes}
          onRefresh={refreshRecommend}
          onClose={() => setShowRecommend(false)}
          onApplyAddition={handleApplyRecommendedAddition}
          onApplyRemoval={handleApplyRecommendedRemoval}
        />
      )}

      {/* Sprint 3-3 UI shell — 좌측 하단 floating widget (성공 확률 + Win/Loss 라벨 진입) */}
      <div
        style={{
          position: "fixed",
          left: 24,
          bottom: 24,
          width: 240,
          zIndex: 850,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <SuccessProbabilityGauge
          slideCount={slides.length}
          slideCodes={slides.map((s) => s.code)}
        />
        <button
          className="btn btn-ghost small"
          style={{ background: "#fff", border: "1px solid #e5e7eb" }}
          onClick={() => setShowWinLossModal(true)}
        >
          {lastDealOutcome ? `결과 입력 완료 (${lastDealOutcome})` : "딜 결과 입력"}
        </button>
      </div>

      <WinLossLabelModal
        open={showWinLossModal}
        onClose={() => setShowWinLossModal(false)}
        onSubmit={(payload) => {
          setLastDealOutcome(payload.status);
          setShowWinLossModal(false);
        }}
      />

      <AssistantPanel
        surface="proposal_editor"
        surfaceRefId={id ?? null}
        contextLabel={proposal.title}
      />
    </div>
  );
}

// ------------------------------------------------------------------
// Sortable slide tile
// ------------------------------------------------------------------

interface SortableSlideTileProps {
  slide: ProposalSlide;
  index: number;
  active: boolean;
  canEdit: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onInsertAfter: () => void;
}

function SortableSlideTile({
  slide,
  index,
  active,
  canEdit,
  onSelect,
  onDuplicate,
  onDelete,
  onInsertAfter,
}: SortableSlideTileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: slide.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`pe-slide-tile ${active ? "active" : ""} ${isDragging ? "dragging" : ""}`}
      onClick={onSelect}
    >
      <div className="pe-slide-tile-head">
        {canEdit && (
          <button
            className="pe-drag-handle"
            title="드래그하여 순서 변경"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            ⋮⋮
          </button>
        )}
        <span className="pe-slide-no">{index + 1}</span>
        <span
          className="pe-slide-phase-dot"
          style={{ background: PHASE_COLORS[slide.phase] }}
        />
        <span className="pe-slide-code">{slide.code}</span>
        {slide.is_customized && <span className="pe-custom-badge">편집</span>}
        {!slide.is_enabled && <span className="pe-disabled-badge">비활성</span>}
        {slide.ai_recommendation_event_id && (
          <span
            className="pe-ai-badge"
            title={slide.ai_recommended_reason ?? "AI 추천을 통해 적용된 슬라이드"}
          >
            AI
          </span>
        )}
      </div>
      <div className="pe-slide-tile-title">{slide.title || slide.name}</div>
      {canEdit && (
        <div className="pe-slide-tile-actions">
          <button
            className="pe-tile-action"
            title="이 슬라이드 뒤에 모듈 추가"
            onClick={(e) => {
              e.stopPropagation();
              onInsertAfter();
            }}
          >
            + 뒤에 추가
          </button>
          <button
            className="pe-tile-action"
            title="복제"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
          >
            복제
          </button>
          <button
            className="pe-tile-action danger"
            title="삭제"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            삭제
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Module Library Modal
// ------------------------------------------------------------------

interface ModuleLibraryModalProps {
  modules: ProposalSlideModule[];
  insertPosition: number | null;
  onClose: () => void;
  onSelect: (moduleCode: string) => void;
}

function ModuleLibraryModal({
  modules,
  insertPosition,
  onClose,
  onSelect,
}: ModuleLibraryModalProps) {
  const [phaseFilter, setPhaseFilter] = useState<SlidePhase | "">("");
  const [dogmaFilter, setDogmaFilter] = useState("");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return modules.filter((m) => {
      if (phaseFilter && m.phase !== phaseFilter) return false;
      if (dogmaFilter && m.neuro_dogma !== dogmaFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${m.code} ${m.name} ${m.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [modules, phaseFilter, dogmaFilter, search]);

  return (
    <div className="pe-modal-backdrop" onClick={onClose}>
      <div className="pe-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pe-modal-head">
          <h3>모듈 라이브러리에서 슬라이드 추가</h3>
          <span className="muted small">
            {insertPosition ? `위치: ${insertPosition}번째에 삽입` : "맨 뒤에 추가"}
          </span>
          <button className="btn-link" onClick={onClose}>닫기</button>
        </div>
        <div className="pe-modal-filters">
          <input
            placeholder="코드/이름 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value as SlidePhase | "")}>
            <option value="">전체 Phase</option>
            {(Object.keys(PHASE_LABELS) as SlidePhase[]).map((p) => (
              <option key={p} value={p}>
                {PHASE_LABELS[p]}
              </option>
            ))}
          </select>
          <select value={dogmaFilter} onChange={(e) => setDogmaFilter(e.target.value)}>
            <option value="">전체 Dogma</option>
            {Object.entries(DOGMA_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="pe-modal-body">
          {filtered.length === 0 ? (
            <div className="muted" style={{ padding: 20 }}>
              조건에 맞는 모듈이 없습니다.
            </div>
          ) : (
            <ul className="pe-module-list">
              {filtered.map((m) => (
                <li key={m.id} className="pe-module-item">
                  <div className="pe-module-head">
                    <span
                      className="pe-slide-phase-dot"
                      style={{ background: PHASE_COLORS[m.phase] }}
                    />
                    <span className="pe-module-code">{m.code}</span>
                    <span className="pe-module-name">{m.name}</span>
                    {m.is_required && <span className="pe-required-badge">필수</span>}
                    {m.neuro_dogma && (
                      <span className="pe-dogma-badge">{DOGMA_LABELS[m.neuro_dogma]}</span>
                    )}
                  </div>
                  {m.description && <div className="pe-module-desc">{m.description}</div>}
                  <div className="pe-module-foot">
                    <span className="muted small">
                      최소 레벨: {NEURO_LEVEL_LABELS[m.min_neuro_level]}
                    </span>
                    <button
                      className="btn btn-primary small"
                      onClick={() => onSelect(m.code)}
                    >
                      이 모듈로 추가
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Version Drawer
// ------------------------------------------------------------------

interface VersionDrawerProps {
  versions: ProposalVersion[];
  loading: boolean;
  canRestore: boolean;
  onClose: () => void;
  onRestore: (v: ProposalVersion) => void;
}

function VersionDrawer({ versions, loading, canRestore, onClose, onRestore }: VersionDrawerProps) {
  return (
    <div className="pe-drawer-backdrop" onClick={onClose}>
      <div className="pe-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="pe-drawer-head">
          <h3>버전 기록</h3>
          <button className="btn-link" onClick={onClose}>닫기</button>
        </div>
        <div className="pe-drawer-body">
          {loading ? (
            <div className="muted" style={{ padding: 20 }}>로드 중...</div>
          ) : versions.length === 0 ? (
            <div className="muted" style={{ padding: 20 }}>
              아직 저장된 버전이 없습니다. 상단의 "버전 스냅샷" 버튼으로 현재 상태를 저장할 수 있습니다.
            </div>
          ) : (
            <ul className="pe-version-list">
              {versions.map((v) => {
                const snap = (v.snapshot ?? {}) as Record<string, unknown>;
                const slideCount = Array.isArray(snap.slides) ? (snap.slides as unknown[]).length : 0;
                const isAuto = Boolean((snap as any).auto);
                return (
                  <li key={v.id} className="pe-version-item">
                    <div className="pe-version-head">
                      <span className="pe-version-no">v{v.version_number}</span>
                      {isAuto && <span className="pe-auto-badge">자동</span>}
                      <span className="muted small">
                        {new Date(v.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="pe-version-summary">
                      {v.change_summary || "(요약 없음)"}
                    </div>
                    <div className="pe-version-meta muted small">
                      슬라이드 {slideCount}장
                    </div>
                    {canRestore && (
                      <div className="pe-version-actions">
                        <button
                          className="btn btn-ghost small"
                          onClick={() => onRestore(v)}
                        >
                          이 버전으로 복원
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Markdown body editor — edits body.narrative as markdown string
// ------------------------------------------------------------------

interface MarkdownBodyEditorProps {
  slide: ProposalSlide;
  onSave: (body: Record<string, unknown>) => void;
}

function MarkdownBodyEditor({ slide, onSave }: MarkdownBodyEditorProps) {
  const body = (slide.body || {}) as Record<string, any>;
  const initial =
    typeof body.narrative === "string"
      ? body.narrative
      : typeof body.scenario === "string"
      ? body.scenario
      : "";

  const [mode, setMode] = useState<"edit" | "preview" | "split">("split");
  const [text, setText] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const lastSlideId = useRef(slide.id);

  useEffect(() => {
    if (lastSlideId.current !== slide.id) {
      setText(initial);
      setDirty(false);
      lastSlideId.current = slide.id;
    }
  }, [slide.id, initial]);

  function save() {
    const patch: Record<string, unknown> = { ...body };
    if ("narrative" in body || !("scenario" in body)) {
      patch.narrative = text;
    } else {
      patch.scenario = text;
    }
    onSave(patch);
    setDirty(false);
  }

  return (
    <div className="pe-md-editor">
      <div className="pe-md-toolbar">
        <strong className="pe-md-title">본문 (Markdown)</strong>
        <div className="pe-md-mode-group">
          {(["edit", "split", "preview"] as const).map((m) => (
            <button
              key={m}
              className={`pe-md-mode ${mode === m ? "active" : ""}`}
              onClick={() => setMode(m)}
            >
              {m === "edit" ? "편집" : m === "preview" ? "미리보기" : "나란히"}
            </button>
          ))}
        </div>
        <button
          className="btn btn-primary small"
          disabled={!dirty}
          onClick={save}
        >
          저장
        </button>
      </div>
      <div className={`pe-md-panels mode-${mode}`}>
        {(mode === "edit" || mode === "split") && (
          <textarea
            className="pe-md-textarea"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setDirty(e.target.value !== initial);
            }}
            placeholder={'**Bold** 또는 - 불릿 사용 가능\n\n예:\n- 핵심 포인트 1\n- 핵심 포인트 2'}
            rows={10}
          />
        )}
        {(mode === "preview" || mode === "split") && (
          <div className="pe-md-preview-panel">
            {text.trim() === "" ? (
              <div className="muted small">미리보기에 표시할 내용이 없습니다.</div>
            ) : (
              renderMarkdown(text)
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// JSON body editor (unchanged from Sprint 2-3 / advanced mode)
// ------------------------------------------------------------------

function BodyJsonEditor({
  slide,
  onSave,
}: {
  slide: ProposalSlide;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(slide.body ?? {}, null, 2));
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setText(JSON.stringify(slide.body ?? {}, null, 2));
  }, [slide.id]);

  return (
    <div className="pe-json-editor">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
      />
      {err && <div className="error-inline">{err}</div>}
      <button
        className="btn btn-ghost small"
        onClick={() => {
          try {
            const parsed = JSON.parse(text);
            setErr(null);
            onSave(parsed);
          } catch (e: any) {
            setErr(e.message);
          }
        }}
      >
        JSON 저장
      </button>
    </div>
  );
}

// ------------------------------------------------------------------
// Sprint 2-5 — Claude API 추천 모달
// ------------------------------------------------------------------

interface RecommendModalProps {
  loading: boolean;
  error: string | null;
  result: RecommendationResult | null;
  notes: string;
  canApply: boolean;
  currentSlideCodes: Set<string>;
  onNotesChange: (v: string) => void;
  onRefresh: () => void;
  onClose: () => void;
  onApplyAddition: (code: string) => void;
  onApplyRemoval: (code: string) => void;
}

function RecommendModal({
  loading,
  error,
  result,
  notes,
  canApply,
  currentSlideCodes,
  onNotesChange,
  onRefresh,
  onClose,
  onApplyAddition,
  onApplyRemoval,
}: RecommendModalProps) {
  return (
    <div className="pe-modal-backdrop" onClick={onClose}>
      <div className="pe-modal pe-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="pe-modal-head">
          <div style={{ flex: 1 }}>
            <h3>AI 기반 제안서 추천</h3>
            <div className="muted small">
              고객 맥락·현재 슬라이드 구성·모듈 카탈로그를 분석해 추가·제거·강조 포인트를 제안합니다.
            </div>
          </div>
          <button className="btn btn-ghost small" onClick={onClose}>
            닫기
          </button>
        </div>

        <div className="pe-modal-filters">
          <label style={{ flex: 1 }}>
            <span className="muted small">추가 지시사항 (선택)</span>
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              rows={2}
              placeholder="예) CFO 설득 관점 강화, 경쟁사 대응 섹션 추가 등"
            />
          </label>
          <button
            className="btn btn-primary small"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? "분석 중…" : "다시 분석"}
          </button>
        </div>

        {error && <div className="error-inline">{error}</div>}

        {loading && !result && (
          <div className="pe-recommend-loading">
            <span className="spinner" /> Claude에 맥락을 전달하는 중입니다…
          </div>
        )}

        {result && (
          <div className="pe-recommend-body">
            {result.summary && (
              <section className="pe-recommend-summary">
                <h4>요약</h4>
                <p>{result.summary}</p>
                <div className="muted small" style={{ marginTop: 4 }}>
                  모델: {result.model}
                </div>
              </section>
            )}

            <section className="pe-recommend-section">
              <h4>추가 제안 ({result.additions.length})</h4>
              {result.additions.length === 0 ? (
                <div className="muted small">추가 제안이 없습니다.</div>
              ) : (
                <ul className="pe-recommend-list">
                  {result.additions.map((a) => {
                    const already = currentSlideCodes.has(a.code);
                    return (
                      <li key={`add-${a.code}`} className="pe-recommend-item">
                        <div className="pe-recommend-item-head">
                          <strong>{a.code}</strong>
                          {a.phase && <span className="muted small">· {a.phase}</span>}
                          {already && <span className="badge">이미 포함됨</span>}
                        </div>
                        <div className="pe-recommend-reason">{a.reason}</div>
                        {canApply && !already && (
                          <button
                            className="btn btn-ghost small"
                            onClick={() => onApplyAddition(a.code)}
                          >
                            이 모듈 삽입
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="pe-recommend-section">
              <h4>제거 제안 ({result.removals.length})</h4>
              {result.removals.length === 0 ? (
                <div className="muted small">제거 제안이 없습니다.</div>
              ) : (
                <ul className="pe-recommend-list">
                  {result.removals.map((r) => (
                    <li key={`rm-${r.code}`} className="pe-recommend-item">
                      <div className="pe-recommend-item-head">
                        <strong>{r.code}</strong>
                      </div>
                      <div className="pe-recommend-reason">{r.reason}</div>
                      {canApply && (
                        <button
                          className="btn btn-ghost small danger"
                          onClick={() => onApplyRemoval(r.code)}
                        >
                          이 슬라이드 삭제
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="pe-recommend-section">
              <h4>강조 전환 제안 ({result.emphasis.length})</h4>
              {result.emphasis.length === 0 ? (
                <div className="muted small">강조 전환 제안이 없습니다.</div>
              ) : (
                <ul className="pe-recommend-list">
                  {result.emphasis.map((e) => (
                    <li key={`em-${e.code}`} className="pe-recommend-item">
                      <div className="pe-recommend-item-head">
                        <strong>{e.code}</strong>
                      </div>
                      <div className="pe-recommend-reason">{e.suggestion}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProposalEditor;
