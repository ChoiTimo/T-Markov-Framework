/**
 * 견적 편집 페이지 — Phase 2 Sprint 2-1
 *
 * 단일 페이지에서 견적 정보 + 라인아이템 + 합계 미리보기 + 저장/PDF 제공.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import {
  calcClientTotals,
  calcLineTotal,
  createQuote,
  downloadQuotePdf,
  formatKRW,
  getQuote,
  listContractRules,
  listModules,
  listPricing,
  listVersions,
  recalcQuote,
  saveVersion,
  updateQuote,
} from "@/services/quotes";
import type {
  ContractRule,
  Module,
  PricingMatrix,
  Quote,
  QuoteItem,
  QuoteStatus,
  QuoteVersionListItem,
} from "@/types/quote";
import "./Quotes.css";

const STATUS_OPTIONS: { value: QuoteStatus; label: string }[] = [
  { value: "draft", label: "초안" },
  { value: "pending_review", label: "검토 대기" },
  { value: "approved", label: "승인" },
  { value: "sent", label: "발송됨" },
  { value: "accepted", label: "수주" },
  { value: "rejected", label: "실주" },
  { value: "expired", label: "만료" },
  { value: "archived", label: "아카이브" },
];

const emptyItem = (): QuoteItem => ({
  item_name: "",
  category: null,
  region_code: null,
  region_name: null,
  bandwidth_mbps: null,
  quantity: 1,
  unit: "회선",
  unit_price: 0,
  is_hub: false,
  sort_order: 0,
});

function QuoteEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const { currentOrg, myRole } = useOrg();

  const canEdit = myRole === "owner" || myRole === "admin" || myRole === "member";

  // Form state
  const [title, setTitle] = useState("");
  const [customerCompany, setCustomerCompany] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [contractRuleId, setContractRuleId] = useState<string>("");
  const [status, setStatus] = useState<QuoteStatus>("draft");
  const [validUntil, setValidUntil] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [taxRate, setTaxRate] = useState<number>(0.1);
  const [items, setItems] = useState<QuoteItem[]>([emptyItem()]);

  // Supplementary
  const [quote, setQuote] = useState<Quote | null>(null);
  const [contractRules, setContractRules] = useState<ContractRule[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [pricingCache, setPricingCache] = useState<Record<string, PricingMatrix[]>>({});
  const [versions, setVersions] = useState<QuoteVersionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changeSummary, setChangeSummary] = useState<string>("");

  // --- Load bootstrap data ---
  useEffect(() => {
    if (!currentOrg) return;
    Promise.all([
      listContractRules(currentOrg.id).catch(() => []),
      listModules(currentOrg.id).catch(() => []),
    ]).then(([rules, mods]) => {
      setContractRules(rules);
      setModules(mods);
      // default to 2-year
      if (!contractRuleId && rules.length) {
        const base = rules.find((r) => r.display_hint === "base") || rules[0];
        setContractRuleId(base.id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg]);

  // --- Load existing quote ---
  useEffect(() => {
    if (isNew || !id) return;
    setLoading(true);
    getQuote(id)
      .then((q) => {
        setQuote(q);
        setTitle(q.title || "");
        setCustomerCompany(q.customer_company || "");
        setCustomerName(q.customer_name || "");
        setCustomerContact(q.customer_contact || "");
        setContractRuleId(q.contract_rule_id || "");
        setStatus(q.status);
        setValidUntil(q.valid_until || "");
        setNotes(q.notes || "");
        setTaxRate(Number(q.tax_rate || 0.1));
        setItems(
          q.items && q.items.length > 0
            ? q.items.map((it) => ({ ...it }))
            : [emptyItem()]
        );
      })
      .catch((e) => setError(e.message || "견적을 불러오지 못했습니다."))
      .finally(() => setLoading(false));

    listVersions(id)
      .then(setVersions)
      .catch(() => setVersions([]));
  }, [id, isNew]);

  // --- Current contract rule ---
  const activeRule = useMemo<ContractRule | null>(() => {
    return contractRules.find((r) => r.id === contractRuleId) || null;
  }, [contractRules, contractRuleId]);

  const multiplier = Number(activeRule?.multiplier ?? 1);
  const contractMonths = activeRule?.contract_months ?? 24;

  // --- Client-side preview totals ---
  const preview = useMemo(
    () => calcClientTotals(items, multiplier, taxRate),
    [items, multiplier, taxRate]
  );

  // --- Item handlers ---
  const updateItem = useCallback(
    (idx: number, patch: Partial<QuoteItem>) => {
      setItems((prev) =>
        prev.map((it, i) => (i === idx ? { ...it, ...patch } : it))
      );
    },
    []
  );

  const addItem = useCallback(() => {
    setItems((prev) => [...prev, { ...emptyItem(), sort_order: prev.length }]);
  }, []);

  const removeItem = useCallback((idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const applyModule = useCallback(
    async (idx: number, moduleId: string) => {
      const mod = modules.find((m) => m.id === moduleId);
      if (!mod) return;
      updateItem(idx, {
        module_id: moduleId,
        item_name: mod.name,
        category: mod.category,
        service_tier: mod.service_tier || null,
        unit: mod.unit || "회선",
        unit_price: mod.base_price ? Number(mod.base_price) : 0,
      });
      if (mod.pricing_type === "matrix" && !pricingCache[moduleId]) {
        try {
          const pm = await listPricing(moduleId);
          setPricingCache((prev) => ({ ...prev, [moduleId]: pm }));
        } catch {
          /* ignore */
        }
      }
    },
    [modules, pricingCache, updateItem]
  );

  const applyMatrixPrice = useCallback(
    (idx: number, regionCode: string, bandwidth: number) => {
      const it = items[idx];
      if (!it?.module_id) return;
      const matrix = pricingCache[it.module_id] || [];
      const match = matrix.find(
        (m) =>
          m.region_code === regionCode && Number(m.bandwidth_mbps) === bandwidth
      );
      const regionRow = matrix.find((m) => m.region_code === regionCode);
      updateItem(idx, {
        region_code: regionCode,
        region_name: regionRow?.region_name || regionCode,
        bandwidth_mbps: bandwidth,
        unit_price: match ? Number(match.monthly_price) : Number(it.unit_price || 0),
      });
    },
    [items, pricingCache, updateItem]
  );

  // --- Save ---
  async function handleSave() {
    if (!currentOrg) return;
    if (!title.trim()) {
      setError("견적 제목을 입력해주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        organization_id: currentOrg.id,
        title,
        customer_name: customerName || null,
        customer_contact: customerContact || null,
        customer_company: customerCompany || null,
        contract_months: contractMonths,
        contract_rule_id: contractRuleId || null,
        tax_rate: taxRate,
        valid_until: validUntil || null,
        notes: notes || null,
        items: items.filter((it) => (it.item_name || "").trim()),
      };

      if (isNew) {
        const created = await createQuote(payload);
        navigate(`/quotes/${created.id}`);
      } else if (id) {
        const updated = await updateQuote(id, {
          ...payload,
          status,
          change_summary: changeSummary || undefined,
        });
        setQuote(updated);
        setItems(
          updated.items && updated.items.length > 0
            ? updated.items.map((it) => ({ ...it }))
            : [emptyItem()]
        );
        setChangeSummary("");
        const v = await listVersions(id);
        setVersions(v);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleRecalc() {
    if (isNew || !id) return;
    try {
      const q = await recalcQuote(id);
      setQuote(q);
    } catch (e) {
      alert(e instanceof Error ? e.message : "재계산 실패");
    }
  }

  async function handleSaveVersion() {
    if (isNew || !id) return;
    try {
      await saveVersion(id, changeSummary || "manual snapshot");
      const v = await listVersions(id);
      setVersions(v);
      setChangeSummary("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "버전 저장 실패");
    }
  }

  async function handleDownloadPdf() {
    if (isNew || !id) return;
    try {
      await downloadQuotePdf(id, `${quote?.quote_number || "quote"}.pdf`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "PDF 다운로드 실패");
    }
  }

  if (!currentOrg) {
    return (
      <div className="quotes-page">
        <h2>견적 편집</h2>
        <p className="muted">먼저 조직을 선택하거나 생성해주세요.</p>
      </div>
    );
  }

  return (
    <div className="quotes-page">
      <header className="quotes-header">
        <div>
          <div className="breadcrumb">
            <button className="link-cell" onClick={() => navigate("/quotes")}>
              ← 견적 목록
            </button>
          </div>
          <h2>{isNew ? "새 견적 작성" : `견적 편집`}</h2>
          {quote && (
            <p className="muted">
              <code className="quote-number">{quote.quote_number}</code> · v
              {quote.current_version} · 최종 수정{" "}
              {new Date(quote.updated_at).toLocaleString("ko-KR")}
            </p>
          )}
        </div>
        <div className="row-actions">
          {!isNew && (
            <>
              <button className="btn btn-ghost" onClick={handleDownloadPdf}>
                📄 PDF 다운로드
              </button>
              <button className="btn btn-ghost" onClick={handleRecalc}>
                🔄 재계산
              </button>
            </>
          )}
          {canEdit && (
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || loading}
            >
              {saving ? "저장 중…" : isNew ? "생성" : "저장"}
            </button>
          )}
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && <div className="muted">불러오는 중…</div>}

      <div className="quote-edit-grid">
        <div className="col-main">
          {/* Quote Info */}
          <section className="card">
            <h3>견적 정보</h3>
            <div className="form-grid">
              <label>
                <span>견적 제목 *</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={!canEdit}
                  placeholder="예: 2026년 글로벌 거점 전용선 견적"
                />
              </label>
              <label>
                <span>상태</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as QuoteStatus)}
                  disabled={!canEdit || isNew}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>고객사</span>
                <input
                  type="text"
                  value={customerCompany}
                  onChange={(e) => setCustomerCompany(e.target.value)}
                  disabled={!canEdit}
                  placeholder="고객사명"
                />
              </label>
              <label>
                <span>담당자</span>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  disabled={!canEdit}
                  placeholder="담당자 이름"
                />
              </label>
              <label>
                <span>연락처</span>
                <input
                  type="text"
                  value={customerContact}
                  onChange={(e) => setCustomerContact(e.target.value)}
                  disabled={!canEdit}
                  placeholder="이메일 또는 전화"
                />
              </label>
              <label>
                <span>유효기한</span>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  disabled={!canEdit}
                />
              </label>
            </div>
          </section>

          {/* Contract + Tax */}
          <section className="card">
            <h3>약정 및 세율</h3>
            <div className="contract-options">
              {contractRules.map((rule) => (
                <label
                  key={rule.id}
                  className={`contract-pill ${
                    rule.id === contractRuleId ? "active" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="contract-rule"
                    value={rule.id}
                    checked={rule.id === contractRuleId}
                    onChange={() => setContractRuleId(rule.id)}
                    disabled={!canEdit}
                  />
                  <strong>{rule.label}</strong>
                  <small
                    className={
                      rule.display_hint === "discount"
                        ? "hint-discount"
                        : rule.display_hint === "surcharge"
                        ? "hint-surcharge"
                        : "hint-base"
                    }
                  >
                    배수 {Number(rule.multiplier).toFixed(2)}
                  </small>
                </label>
              ))}
            </div>
            <div className="form-grid compact">
              <label>
                <span>부가세율</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  disabled={!canEdit}
                />
              </label>
            </div>
          </section>

          {/* Line Items */}
          <section className="card">
            <div className="card-header-row">
              <h3>견적 항목</h3>
              {canEdit && (
                <button className="btn btn-ghost btn-sm" onClick={addItem}>
                  + 항목 추가
                </button>
              )}
            </div>

            {items.map((it, idx) => {
              const matrix = it.module_id ? pricingCache[it.module_id] || [] : [];
              const regions = Array.from(
                new Map(matrix.map((m) => [m.region_code, m.region_name])).entries()
              );
              const bandwidths = matrix
                .filter((m) => m.region_code === it.region_code)
                .map((m) => m.bandwidth_mbps)
                .sort((a, b) => a - b);

              return (
                <div key={idx} className="line-item">
                  <div className="line-item-head">
                    <span className="line-idx">#{idx + 1}</span>
                    <label className="hub-toggle">
                      <input
                        type="checkbox"
                        checked={!!it.is_hub}
                        onChange={(e) =>
                          updateItem(idx, { is_hub: e.target.checked })
                        }
                        disabled={!canEdit}
                      />
                      Hub 회선
                    </label>
                    {canEdit && items.length > 1 && (
                      <button
                        className="btn btn-ghost btn-sm danger ml-auto"
                        onClick={() => removeItem(idx)}
                      >
                        삭제
                      </button>
                    )}
                  </div>

                  <div className="line-item-grid">
                    <label className="col-span-2">
                      <span>모듈 선택</span>
                      <select
                        value={it.module_id || ""}
                        onChange={(e) => {
                          if (e.target.value) applyModule(idx, e.target.value);
                          else updateItem(idx, { module_id: null });
                        }}
                        disabled={!canEdit}
                      >
                        <option value="">직접 입력</option>
                        {modules.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} {m.category ? `(${m.category})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="col-span-3">
                      <span>항목명 *</span>
                      <input
                        type="text"
                        value={it.item_name}
                        onChange={(e) =>
                          updateItem(idx, { item_name: e.target.value })
                        }
                        disabled={!canEdit}
                        placeholder="항목 설명"
                      />
                    </label>

                    {regions.length > 0 ? (
                      <label>
                        <span>지역</span>
                        <select
                          value={it.region_code || ""}
                          onChange={(e) =>
                            applyMatrixPrice(
                              idx,
                              e.target.value,
                              it.bandwidth_mbps || bandwidths[0] || 0
                            )
                          }
                          disabled={!canEdit}
                        >
                          <option value="">선택</option>
                          {regions.map(([code, name]) => (
                            <option key={code} value={code}>
                              {name || code}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label>
                        <span>지역명</span>
                        <input
                          type="text"
                          value={it.region_name || ""}
                          onChange={(e) =>
                            updateItem(idx, { region_name: e.target.value })
                          }
                          disabled={!canEdit}
                        />
                      </label>
                    )}

                    {bandwidths.length > 0 ? (
                      <label>
                        <span>대역폭</span>
                        <select
                          value={it.bandwidth_mbps || ""}
                          onChange={(e) =>
                            applyMatrixPrice(
                              idx,
                              it.region_code || "",
                              Number(e.target.value)
                            )
                          }
                          disabled={!canEdit}
                        >
                          <option value="">선택</option>
                          {bandwidths.map((bw) => (
                            <option key={bw} value={bw}>
                              {bw} Mbps
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label>
                        <span>대역폭(Mbps)</span>
                        <input
                          type="number"
                          value={it.bandwidth_mbps || ""}
                          onChange={(e) =>
                            updateItem(idx, {
                              bandwidth_mbps: Number(e.target.value) || null,
                            })
                          }
                          disabled={!canEdit}
                        />
                      </label>
                    )}

                    <label>
                      <span>수량</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={it.quantity}
                        onChange={(e) =>
                          updateItem(idx, { quantity: Number(e.target.value) })
                        }
                        disabled={!canEdit}
                      />
                    </label>
                    <label>
                      <span>단가</span>
                      <input
                        type="number"
                        min="0"
                        value={it.unit_price}
                        onChange={(e) =>
                          updateItem(idx, { unit_price: Number(e.target.value) })
                        }
                        disabled={!canEdit}
                      />
                    </label>
                    <div className="line-item-sum">
                      <span className="muted">라인 합계</span>
                      <strong>
                        {formatKRW(
                          calcLineTotal(
                            Number(it.quantity || 0),
                            Number(it.unit_price || 0)
                          )
                        )}
                      </strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>

          {/* Notes */}
          <section className="card">
            <h3>참고 사항 / 변경 메모</h3>
            <label>
              <span>참고 사항 (PDF에 포함됩니다)</span>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!canEdit}
                placeholder="예: 초기 설치비 별도, 백업 회선 구성 시 추가 협의"
              />
            </label>
            {!isNew && (
              <label>
                <span>이번 변경 사항 (버전 메모)</span>
                <input
                  type="text"
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                  disabled={!canEdit}
                  placeholder="예: 홍콩 100Mbps → 200Mbps 상향"
                />
              </label>
            )}
          </section>
        </div>

        {/* Summary Sidebar */}
        <aside className="col-side">
          <section className="card summary-card">
            <h3>견적 요약</h3>
            <div className="sum-row">
              <span>소계</span>
              <strong>{formatKRW(preview.subtotal)}</strong>
            </div>
            <div className="sum-row">
              <span>
                약정 조정 ({activeRule?.label || "기준가"})
              </span>
              <strong className={preview.adjustment < 0 ? "text-green" : preview.adjustment > 0 ? "text-red" : ""}>
                {preview.adjustment === 0
                  ? "₩0"
                  : (preview.adjustment > 0 ? "+" : "") + formatKRW(preview.adjustment)}
              </strong>
            </div>
            <div className="sum-row">
              <span>부가세 ({Math.round(taxRate * 100)}%)</span>
              <strong>{formatKRW(preview.tax)}</strong>
            </div>
            <div className="sum-row grand">
              <span>월 이용료 합계 (세후)</span>
              <strong>{formatKRW(preview.total)}</strong>
            </div>
            {!isNew && canEdit && (
              <button
                className="btn btn-secondary full-w mt-3"
                onClick={handleSaveVersion}
              >
                📌 현재 상태를 버전으로 저장
              </button>
            )}
          </section>

          {!isNew && versions.length > 0 && (
            <section className="card">
              <h3>버전 이력</h3>
              <ul className="version-list">
                {versions.map((v) => (
                  <li key={v.id}>
                    <strong>v{v.version_number}</strong>
                    <small>
                      {new Date(v.created_at).toLocaleString("ko-KR")}
                    </small>
                    {v.change_summary && (
                      <p className="muted">{v.change_summary}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

export default QuoteEditor;
