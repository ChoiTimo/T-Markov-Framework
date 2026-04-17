/**
 * ProposalEditor — 제안서 상세/편집 페이지 (Phase 2 Sprint 2-3)
 * 슬라이드 인스턴스 목록 편집, assemble/render, quote/battlecard 연결
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import { listCards } from "@/services/battlecards";
import { listQuotes } from "@/services/quotes";
import {
  assembleProposal,
  downloadBlob,
  getProposal,
  patchSlide,
  publishProposal,
  renderProposalPptx,
  snapshotVersion,
  updateProposal,
} from "@/services/proposals";
import type {
  AssembleResult,
  NeuroLevel,
  Proposal,
  ProposalSlide,
  ProposalStatus,
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
import "./Proposals.css";

function ProposalEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentOrg, myRole } = useOrg();

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [slides, setSlides] = useState<ProposalSlide[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [battleCards, setBattleCards] = useState<BattleCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assembling, setAssembling] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [lastAssemble, setLastAssemble] = useState<AssembleResult | null>(null);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);

  const canEdit = myRole === "owner" || myRole === "admin" || myRole === "member";

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
      reload();
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
              <button className="btn btn-ghost" onClick={handleSnapshot}>
                버전 스냅샷
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
            <span>배틀카드 (쉼표 구분)</span>
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
            슬라이드 ({slides.length}장)
          </div>
          {slides.map((s, idx) => (
            <div
              key={s.id}
              className={`pe-slide-tile ${activeSlideId === s.id ? "active" : ""}`}
              onClick={() => setActiveSlideId(s.id)}
            >
              <div className="pe-slide-tile-head">
                <span className="pe-slide-no">{idx + 1}</span>
                <span
                  className="pe-slide-phase-dot"
                  style={{ background: PHASE_COLORS[s.phase] }}
                />
                <span className="pe-slide-code">{s.code}</span>
                {s.is_customized && <span className="pe-custom-badge">편집</span>}
                {!s.is_enabled && <span className="pe-disabled-badge">비활성</span>}
              </div>
              <div className="pe-slide-tile-title">{s.title || s.name}</div>
            </div>
          ))}
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
                <details className="pe-raw-editor">
                  <summary>원본 body(JSON) 편집 (고급)</summary>
                  <BodyJsonEditor
                    slide={activeSlide}
                    onSave={(body) => handleSlidePatch(activeSlide.id, { body } as any)}
                  />
                </details>
              )}
            </>
          ) : (
            <div className="muted" style={{ padding: 20 }}>
              왼쪽에서 슬라이드를 선택하세요.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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

export default ProposalEditor;
