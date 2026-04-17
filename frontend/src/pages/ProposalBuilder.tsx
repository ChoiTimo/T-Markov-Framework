/**
 * ProposalBuilder — 제안서 목록/생성 페이지 (Phase 2 Sprint 2-3)
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import {
  createProposal,
  deleteProposal,
  listProposals,
  listTemplates,
} from "@/services/proposals";
import type {
  NeuroLevel,
  Proposal,
  ProposalStatus,
  ProposalTemplate,
  TargetPersona,
} from "@/types/proposal";
import {
  NEURO_LEVEL_LABELS,
  PERSONA_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/types/proposal";
import "./Proposals.css";

const STATUS_OPTIONS: ProposalStatus[] = [
  "draft",
  "in_review",
  "approved",
  "sent",
  "won",
  "lost",
  "archived",
];

function ProposalBuilder() {
  const navigate = useNavigate();
  const { currentOrg, myRole } = useOrg();
  const [rows, setRows] = useState<Proposal[]>([]);
  const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(false);

  // New proposal form
  const [newTitle, setNewTitle] = useState("");
  const [newCustomer, setNewCustomer] = useState("");
  const [newPersona, setNewPersona] = useState<TargetPersona>("c_level");
  const [newNeuroLevel, setNewNeuroLevel] = useState<NeuroLevel>("standard");
  const [newTemplateId, setNewTemplateId] = useState<string>("");
  const [newIndustry, setNewIndustry] = useState<string>("general");
  const [creating, setCreating] = useState(false);

  const canEdit = myRole === "owner" || myRole === "admin" || myRole === "member";

  useEffect(() => {
    if (!currentOrg) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listProposals({
        orgId: currentOrg.id,
        status: (statusFilter || undefined) as ProposalStatus | undefined,
        q: q || undefined,
      }),
      listTemplates(currentOrg.id),
    ])
      .then(([proposals, tpl]) => {
        if (cancelled) return;
        setRows(proposals);
        setTemplates(tpl);
        setError(null);
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
  }, [currentOrg?.id, statusFilter, q]);

  const grouped = useMemo(() => {
    const out: Record<string, Proposal[]> = {};
    for (const p of rows) {
      const key = p.status || "draft";
      if (!out[key]) out[key] = [];
      out[key].push(p);
    }
    return out;
  }, [rows]);

  async function handleCreate() {
    if (!currentOrg || !newTitle.trim()) return;
    setCreating(true);
    try {
      const created = await createProposal({
        organization_id: currentOrg.id,
        template_id: newTemplateId || undefined,
        title: newTitle.trim(),
        customer_company: newCustomer.trim() || undefined,
        target_persona: newPersona,
        neuro_level: newNeuroLevel,
        industry: newIndustry || undefined,
      });
      navigate(`/proposals/${created.id}`);
    } catch (e: any) {
      alert(e.message || "생성 실패");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("이 제안서를 삭제하시겠습니까? 복구할 수 없습니다.")) return;
    try {
      await deleteProposal(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      alert(e.message || "삭제 실패");
    }
  }

  return (
    <div className="proposals-page">
      <div className="pb-header">
        <div>
          <h2>제안서 생성기</h2>
          <div className="muted">
            뇌과학 기반 슬라이드 자동 조립 · 견적/배틀카드 연동 · PPTX 내보내기
          </div>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowNew((v) => !v)}>
            {showNew ? "닫기" : "새 제안서"}
          </button>
        )}
      </div>

      {showNew && (
        <div className="card pb-new-form">
          <div className="pb-form-grid">
            <label>
              <span>제안서 제목 *</span>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="2026 ACME Next-Gen Network 제안서"
              />
            </label>
            <label>
              <span>고객사</span>
              <input
                value={newCustomer}
                onChange={(e) => setNewCustomer(e.target.value)}
                placeholder="ACME Corporation"
              />
            </label>
            <label>
              <span>템플릿</span>
              <select value={newTemplateId} onChange={(e) => setNewTemplateId(e.target.value)}>
                <option value="">(템플릿 없음)</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>타겟</span>
              <select value={newPersona} onChange={(e) => setNewPersona(e.target.value as TargetPersona)}>
                {(Object.keys(PERSONA_LABELS) as TargetPersona[]).map((k) => (
                  <option key={k} value={k}>
                    {PERSONA_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>뉴로 레벨</span>
              <select value={newNeuroLevel} onChange={(e) => setNewNeuroLevel(e.target.value as NeuroLevel)}>
                {(Object.keys(NEURO_LEVEL_LABELS) as NeuroLevel[]).map((k) => (
                  <option key={k} value={k}>
                    {NEURO_LEVEL_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>업종</span>
              <select value={newIndustry} onChange={(e) => setNewIndustry(e.target.value)}>
                <option value="general">범용</option>
                <option value="semiconductor">반도체</option>
                <option value="manufacturing">제조</option>
                <option value="finance">금융</option>
                <option value="public">공공</option>
              </select>
            </label>
          </div>
          <div className="pb-form-actions">
            <button className="btn btn-primary" disabled={creating || !newTitle.trim()} onClick={handleCreate}>
              {creating ? "생성 중..." : "제안서 생성 + 슬라이드 자동 조립"}
            </button>
          </div>
        </div>
      )}

      <div className="pb-toolbar">
        <input
          className="pb-search"
          placeholder="제목·고객사 검색..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">모든 상태</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="muted">로드 중...</div>}

      {!loading && rows.length === 0 && (
        <div className="empty-state">
          아직 생성된 제안서가 없습니다. 상단의 [새 제안서] 버튼으로 시작해 보세요.
        </div>
      )}

      {STATUS_OPTIONS.map((status) => {
        const list = grouped[status];
        if (!list || list.length === 0) return null;
        return (
          <div key={status} className="pb-status-group">
            <div className="pb-status-label">
              <span
                className="pb-status-dot"
                style={{ background: STATUS_COLORS[status] }}
              />
              {STATUS_LABELS[status]} ({list.length})
            </div>
            <div className="pb-grid">
              {list.map((p) => (
                <div
                  key={p.id}
                  className="pb-card"
                  onClick={() => navigate(`/proposals/${p.id}`)}
                >
                  <div className="pb-card-head">
                    <div className="pb-card-title">{p.title}</div>
                    <div className="pb-card-meta">
                      {p.proposal_number || "—"} · {PERSONA_LABELS[p.target_persona]} · {NEURO_LEVEL_LABELS[p.neuro_level]}
                    </div>
                  </div>
                  {p.customer_company && (
                    <div className="pb-card-customer">{p.customer_company}</div>
                  )}
                  <div className="pb-card-foot">
                    <span className="muted small">
                      {new Date(p.updated_at).toLocaleDateString()}
                    </span>
                    {canEdit && (
                      <button
                        className="btn-link danger small"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          handleDelete(p.id);
                        }}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ProposalBuilder;
