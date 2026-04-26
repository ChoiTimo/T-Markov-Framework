/**
 * CompetitiveFeed — 경쟁 인텔리전스 피드 (Sprint 3-2 UI shell)
 *
 * 현 단계는 mock 데이터 기반 화면 구성. 백엔드 연결은 다음 sprint.
 * 사용자가 [적용]을 누르면 토스트 안내만 표시 (실제 변경 없음).
 */
import { useMemo, useState } from "react";
import "./CompetitiveFeed.css";

type Severity = "low" | "medium" | "high" | "critical";
type ProcessState = "new" | "applied" | "rejected";

interface MockSignal {
  id: string;
  competitor: string;
  source: string;
  headline: string;
  summary: string;
  severity: Severity;
  publishedAt: string;
  patch: { field: string; before: string; after: string };
  state: ProcessState;
}

const MOCK_SIGNALS: MockSignal[] = [
  {
    id: "sig-001",
    competitor: "Cisco Meraki",
    source: "TechCrunch",
    headline: "Meraki, 클라우드 관리형 SD-WAN 가격 정책 12% 인하 발표",
    summary:
      "엔터프라이즈 라이선스 등급에서 평균 12% 인하. 중견 기업(MID) 세그먼트에 영향이 클 것으로 전망되며, 가격 비교가 의사결정 기준이 되는 RFP 에서 변별력이 약화될 가능성.",
    severity: "high",
    publishedAt: "2026-04-25T08:00:00Z",
    patch: {
      field: "objection_handling",
      before: "가격 우위는 라이선스 묶음 할인으로 대응",
      after: "TCO 3년 기준 비교 (전력·운영·SOC 통합 인력 절감 포함) 로 회수기간 단축 강조",
    },
    state: "new",
  },
  {
    id: "sig-002",
    competitor: "Fortinet",
    source: "ZDNet",
    headline: "FortiOS 7.6 GA — 보안 정책 자동화 Workflow Studio 추가",
    summary:
      "정책 라이프사이클 자동화 기능이 기본 라이선스에 포함. ZTNA 운영 자동화에 대한 차별화 포인트 약화 가능. 데모 흐름에서 운영 자동화 유스케이스를 보강할 필요.",
    severity: "medium",
    publishedAt: "2026-04-23T14:30:00Z",
    patch: {
      field: "key_advantages",
      before: "정책 자동화 워크플로 차별화 (당사 우위)",
      after: "정책 자동화 + 사용자 행동 컨텍스트 기반 동적 정책 (Behavioral Policy) 차별화",
    },
    state: "new",
  },
  {
    id: "sig-003",
    competitor: "Palo Alto Networks",
    source: "Press Release",
    headline: "Prisma SASE 한국 데이터센터 신규 오픈 (서울)",
    summary:
      "한국 내 처리 지연이 중요했던 공공·금융 고객에게 호소력 있는 변화. RTT 측정·체감 지연 데모를 강화하지 않으면 차별화 약화 우려.",
    severity: "critical",
    publishedAt: "2026-04-22T09:15:00Z",
    patch: {
      field: "battle_points",
      before: "한국 내 백본 우위 강조",
      after: "한국 백본 + 동남아 경유 글로벌 트래픽 처리 지점(POP) 표 상세화, RTT 비교 측정값 동봉",
    },
    state: "new",
  },
  {
    id: "sig-004",
    competitor: "Zscaler",
    source: "Korea IDG",
    headline: "Zscaler, AI Copilot for Operations 베타 공개",
    summary:
      "운영 화면에 LLM 기반 보조가 들어옴. 보안 운영 어시스턴트 측면 차별화가 약화될 수 있음. 데모 시나리오 업데이트 권장.",
    severity: "low",
    publishedAt: "2026-04-19T11:00:00Z",
    patch: {
      field: "summary",
      before: "당사 SD-WAN/SASE 운영 어시스턴트 차별화",
      after: "운영 어시스턴트 + 제안 단계 어시스턴트(셀러용) 두 축 차별화 강조",
    },
    state: "applied",
  },
  {
    id: "sig-005",
    competitor: "Cloudflare",
    source: "공식 블로그",
    headline: "Magic WAN 가격 단순화 — 월 $200 정액제 도입",
    summary:
      "소규모 본사·지점 구성에 매력적. 한국 시장에서는 채널 효율 측면에서 견적 산출 시간이 빠른 점이 장점. 견적 계산기 UX 개선이 후속 대응.",
    severity: "medium",
    publishedAt: "2026-04-18T07:00:00Z",
    patch: {
      field: "objection_handling",
      before: "정액제 단순함 호소 시 라이선스 비교 표 강조",
      after: "정액제 단순함 호소 시 견적 계산기 5분 산출 가능성 + 한국형 통신요금 옵션 묶음 강조",
    },
    state: "new",
  },
];

const SEVERITY_LABELS: Record<Severity, string> = {
  low: "관찰",
  medium: "주의",
  high: "중요",
  critical: "긴급",
};

const STATE_FILTERS: { key: "all" | ProcessState; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "new", label: "신규" },
  { key: "applied", label: "적용됨" },
  { key: "rejected", label: "거절" },
];

export default function CompetitiveFeed() {
  const [signals, setSignals] = useState<MockSignal[]>(MOCK_SIGNALS);
  const [stateFilter, setStateFilter] = useState<"all" | ProcessState>("all");
  const [severityFilter, setSeverityFilter] = useState<"all" | Severity>("all");

  const filtered = useMemo(() => {
    return signals.filter((s) => {
      if (stateFilter !== "all" && s.state !== stateFilter) return false;
      if (severityFilter !== "all" && s.severity !== severityFilter) return false;
      return true;
    });
  }, [signals, stateFilter, severityFilter]);

  const updateState = (id: string, state: ProcessState) => {
    setSignals((prev) => prev.map((s) => (s.id === id ? { ...s, state } : s)));
  };

  return (
    <div className="cf-page">
      <header className="cf-header">
        <div>
          <div className="cf-title">경쟁 인텔리전스 피드</div>
          <div className="cf-subtitle">
            경쟁사 동향을 자동 수집하여 배틀카드 갱신 제안을 큐에 적재합니다.
          </div>
        </div>
      </header>

      <div className="cf-banner">
        UI 미리보기 단계입니다. 자동 수집 파이프라인은 다음 단계에 활성화되며, 현재 화면은
        샘플 데이터로 구성되어 있습니다. 적용·거절 동작은 화면 상태만 갱신합니다.
      </div>

      <div className="cf-filter-row">
        {STATE_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`cf-filter-btn ${stateFilter === f.key ? "active" : ""}`}
            onClick={() => setStateFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        <span style={{ borderLeft: "1px solid #e5e7eb", height: 24, margin: "0 4px" }} />
        {(["all", "low", "medium", "high", "critical"] as const).map((sv) => (
          <button
            key={sv}
            className={`cf-filter-btn ${severityFilter === sv ? "active" : ""}`}
            onClick={() => setSeverityFilter(sv)}
          >
            {sv === "all" ? "심각도 전체" : SEVERITY_LABELS[sv]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="cf-empty">조건에 맞는 신호가 없습니다.</div>
      ) : (
        <div className="cf-grid">
          {filtered.map((s) => (
            <article key={s.id} className="cf-signal-card">
              <div className="cf-signal-head">
                <div>
                  <div className="cf-competitor">{s.competitor}</div>
                  <div className="cf-source">{s.source} · {new Date(s.publishedAt).toLocaleDateString("ko-KR")}</div>
                </div>
                <span className={`cf-severity cf-severity-${s.severity}`}>
                  {SEVERITY_LABELS[s.severity]}
                </span>
              </div>

              <div className="cf-headline">{s.headline}</div>
              <div className="cf-summary">{s.summary}</div>

              <div className="cf-patch-block">
                <div className="cf-patch-label">제안된 배틀카드 변경 — {s.patch.field}</div>
                <div className="cf-patch-field">변경 전</div>
                <div className="cf-patch-value">{s.patch.before}</div>
                <div className="cf-patch-field" style={{ marginTop: 6 }}>변경 후</div>
                <div className="cf-patch-value"><strong>{s.patch.after}</strong></div>
              </div>

              <div className="cf-meta">
                <span>상태: {s.state === "new" ? "신규" : s.state === "applied" ? "적용됨" : "거절됨"}</span>
              </div>

              {s.state === "new" && (
                <div className="cf-actions">
                  <button className="btn btn-primary small" onClick={() => updateState(s.id, "applied")}>
                    적용
                  </button>
                  <button className="btn btn-ghost small" onClick={() => updateState(s.id, "rejected")}>
                    거절
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
