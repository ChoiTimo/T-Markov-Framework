/**
 * InsightsDashboard — 통합 인사이트 대시보드 (Phase 5-1 UI shell).
 *
 * 백엔드 연결 전 단계: mock 데이터 기반 화면 구성.
 * 4 위젯: 일 요약 / Win-Loss 퍼널 / 모듈별 Win rate / 도구 사용 통계.
 */
import { useState, useMemo } from "react";
import "./InsightsDashboard.css";

type Period = "7d" | "30d" | "90d";

const MOCK_DAILY_SUMMARY = {
  date: "2026-04-26",
  text:
    "지난 24시간 동안 12 건의 신규 제안서 활동이 있었으며, 가격 비교 관련 객관적 자료 요청이 두드러졌습니다. " +
    "특히 공공·금융 세그먼트에서 RTT/지연 데이터에 대한 질의가 늘었고, " +
    "어시스턴트는 객관 자료 기반 응답을 권장하는 형태로 응답하고 있습니다.",
  insights: [
    { kind: "positive", text: "공공 세그먼트 응답 만족도 +12%" },
    { kind: "warning", text: "프라이싱 비교 객관 자료 요청 ↑" },
    { kind: "neutral", text: "신규 제안서 12건 (전주比 +3)" },
  ],
};

const MOCK_KPIS = [
  { label: "주간 신규 제안서", value: "32", delta: "+9%", positive: true },
  { label: "Win Rate (라벨)", value: "58%", delta: "+4%", positive: true },
  { label: "AI 도구 호출", value: "412", delta: "+27%", positive: true },
  { label: "Confirm 승인률", value: "82%", delta: "-3%", positive: false },
];

const MOCK_FUNNEL = [
  { stage: "Pending", count: 24, color: "pending" as const, dark: false },
  { stage: "Won", count: 18, color: "won" as const, dark: false },
  { stage: "Lost", count: 9, color: "lost" as const, dark: false },
  { stage: "Canceled", count: 3, color: "canceled" as const, dark: true },
];

const MOCK_MODULE_RATES = [
  { code: "P5_surprise", rate: 78, deals: 14 },
  { code: "P3_proof_metric", rate: 72, deals: 18 },
  { code: "N2_neuro_anchor", rate: 67, deals: 12 },
  { code: "P2_tension_chart", rate: 64, deals: 21 },
  { code: "P1_cover", rate: 60, deals: 32 },
  { code: "N1_narrative", rate: 56, deals: 19 },
  { code: "P4_competitive_compare", rate: 51, deals: 9 },
];

const MOCK_TOOLS = [
  { name: "get_proposal", count: 187, applied: 187, mutates: false },
  { name: "get_quote", count: 96, applied: 96, mutates: false },
  { name: "get_battlecard", count: 64, applied: 64, mutates: false },
  { name: "draft_slide_append", count: 48, applied: 39, mutates: true },
  { name: "draft_battlecard_update", count: 12, applied: 8, mutates: true },
  { name: "draft_quote_lineitem", count: 5, applied: 4, mutates: true },
];

function rateClass(rate: number): "high" | "mid" | "low" {
  if (rate >= 80) return "high";
  if (rate >= 60) return "mid";
  return "low";
}

export default function InsightsDashboard() {
  const [period, setPeriod] = useState<Period>("30d");

  const funnelTotal = useMemo(
    () => MOCK_FUNNEL.reduce((acc, f) => acc + f.count, 0),
    [],
  );
  const funnelMax = Math.max(...MOCK_FUNNEL.map((f) => f.count));

  const moduleMaxDeals = Math.max(...MOCK_MODULE_RATES.map((m) => m.deals));

  return (
    <div className="id-page">
      <header className="id-header">
        <div>
          <div className="id-title">통합 인사이트</div>
          <div className="id-subtitle">
            영업 활동 · AI 도구 사용 · 모듈별 성과를 한눈에. 일 요약은 매일 새벽 02:00 KST 자동 업데이트 예정.
          </div>
        </div>
        <div className="id-period" role="tablist" aria-label="기간 선택">
          {(["7d", "30d", "90d"] as const).map((p) => (
            <button
              key={p}
              className={period === p ? "active" : ""}
              onClick={() => setPeriod(p)}
              role="tab"
              aria-selected={period === p}
            >
              {p === "7d" ? "7일" : p === "30d" ? "30일" : "90일"}
            </button>
          ))}
        </div>
      </header>

      <div className="id-banner">
        UI 미리보기 단계입니다. 자동 집계 파이프라인은 다음 단계에 활성화되며, 현재는 샘플 데이터로 구성되어 있습니다.
      </div>

      <section className="id-kpi-row">
        {MOCK_KPIS.map((k) => (
          <div key={k.label} className="id-kpi">
            <div className="id-kpi-label">{k.label}</div>
            <div className="id-kpi-value">{k.value}</div>
            <div className={`id-kpi-delta ${k.positive ? "positive" : "negative"}`}>
              {k.delta} 전기간比
            </div>
          </div>
        ))}
      </section>

      <section className="id-grid">
        <div className="id-card">
          <div className="id-card-title">오늘의 AI 인사이트</div>
          <div className="id-summary-text">{MOCK_DAILY_SUMMARY.text}</div>
          <div className="id-insight-chips">
            {MOCK_DAILY_SUMMARY.insights.map((i, idx) => (
              <span
                key={idx}
                className={
                  "id-chip " +
                  (i.kind === "warning"
                    ? "id-chip-warning"
                    : i.kind === "positive"
                      ? "id-chip-positive"
                      : "")
                }
              >
                {i.text}
              </span>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: "#9ca3af" }}>
            기준일: {MOCK_DAILY_SUMMARY.date}
          </div>
        </div>

        <div className="id-card">
          <div className="id-card-title">Win / Loss 퍼널 (총 {funnelTotal}건)</div>
          <div className="id-funnel">
            {MOCK_FUNNEL.map((f) => {
              const pct = funnelMax === 0 ? 0 : (f.count / funnelMax) * 100;
              return (
                <div key={f.stage} className="id-funnel-row">
                  <span className="id-funnel-label">{f.stage}</span>
                  <div className="id-funnel-bar">
                    <div
                      className={`id-funnel-fill ${f.color}`}
                      style={{ width: `${pct}%` }}
                    />
                    <span className={`id-funnel-count ${f.dark ? "dark" : ""}`}>
                      {f.count}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="id-grid">
        <div className="id-card">
          <div className="id-card-title">모듈별 Win rate (표본 3건 이상)</div>
          {MOCK_MODULE_RATES.map((m) => (
            <div key={m.code} className="id-bar-row">
              <span className="id-bar-label">{m.code}</span>
              <div className="id-bar-track">
                <div className="id-bar-fill" style={{ width: `${m.rate}%` }} />
              </div>
              <span className="id-bar-rate">{m.rate}%</span>
              <span className="id-bar-deals">
                {m.deals}/{moduleMaxDeals}건
              </span>
            </div>
          ))}
        </div>

        <div className="id-card">
          <div className="id-card-title">AI 도구 사용 통계</div>
          <div className="id-tool-list">
            {MOCK_TOOLS.map((t) => {
              const rate = t.count === 0 ? 0 : Math.round((t.applied / t.count) * 100);
              return (
                <div key={t.name} className="id-tool-item">
                  <span className="id-tool-name">
                    {t.name}
                    {t.mutates && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: "#92400e" }}>
                        write
                      </span>
                    )}
                  </span>
                  <span className="id-tool-count">{t.count}회</span>
                  <span className={`id-tool-rate ${rateClass(rate)}`}>{rate}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
