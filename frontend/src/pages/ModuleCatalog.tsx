/**
 * ModuleCatalog — 18개 슬라이드 모듈 카탈로그 (UI shell, mock).
 * 각 모듈 카드에 ModuleWinRateBadge.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ModuleWinRateBadge from "@/components/proposals/ModuleWinRateBadge";
import "./_shell.css";

interface MockModule {
  code: string;
  name: string;
  phase: "1_frame" | "2_tension" | "3_proof" | "4_compare" | "5_close";
  dogma: "prediction_error" | "precision_anchoring" | "narrative" | "embodied" | "active_inference" | null;
  description: string;
  usageCount: number;
}

const MOCK_MODULES: MockModule[] = [
  { code: "P1_cover", name: "표지 슬라이드", phase: "1_frame", dogma: "narrative", description: "고객명·산업·일자를 강조해 첫 시선을 잡고 프레임을 설정", usageCount: 32 },
  { code: "P1_agenda", name: "어젠다", phase: "1_frame", dogma: null, description: "5단계 흐름 미리보기로 인지 부하 감소", usageCount: 28 },
  { code: "P2_tension_chart", name: "현황 인식 차트", phase: "2_tension", dogma: "prediction_error", description: "현재 고객 상태 vs 산업 평균 비교, 격차로 긴장 유발", usageCount: 21 },
  { code: "P2_pain_story", name: "Pain Story", phase: "2_tension", dogma: "narrative", description: "유사 고객 사례로 자기 사례 투영을 유도", usageCount: 15 },
  { code: "P3_proof_metric", name: "정량 증명", phase: "3_proof", dogma: "precision_anchoring", description: "제3자 측정치·인증·벤치마크로 신뢰도 강화", usageCount: 18 },
  { code: "P3_demo_screenshot", name: "데모 스크린샷", phase: "3_proof", dogma: "embodied", description: "실 운영 화면 보여주며 체화 인지 자극", usageCount: 22 },
  { code: "P4_competitive_compare", name: "경쟁 비교 매트릭스", phase: "4_compare", dogma: "precision_anchoring", description: "주요 경쟁사 대비 핵심 차별점 표 형식", usageCount: 9 },
  { code: "P4_tco_3yr", name: "TCO 3년 분석", phase: "4_compare", dogma: "precision_anchoring", description: "라이선스+운영+SOC 인력 합산 회수기간 강조", usageCount: 13 },
  { code: "P5_surprise", name: "Surprise Slide", phase: "5_close", dogma: "prediction_error", description: "예상치 못한 가치 (예: 무상 컨설팅, 보안 진단) 노출", usageCount: 14 },
  { code: "P5_call_to_action", name: "Call to Action", phase: "5_close", dogma: "active_inference", description: "구체적 다음 액션 제안 — 회의 일정·PoC 범위", usageCount: 27 },
  { code: "P5_roadmap", name: "단계별 로드맵", phase: "5_close", dogma: "active_inference", description: "분기 단위 도입 단계로 의사결정 부담 분산", usageCount: 19 },
  { code: "N1_narrative", name: "내러티브 한 줄 요약", phase: "1_frame", dogma: "narrative", description: "전체 제안의 핵심 메시지를 한 문장으로 표현", usageCount: 19 },
  { code: "N2_neuro_anchor", name: "Neuro Anchor", phase: "3_proof", dogma: "precision_anchoring", description: "기억에 잠근 단일 수치 — 80% / 3 사이클 등", usageCount: 12 },
  { code: "N3_active_choice", name: "능동 선택 유도", phase: "5_close", dogma: "active_inference", description: "A/B 옵션을 제시하여 선택 행위 자체를 유발", usageCount: 8 },
  { code: "N4_embodied_demo", name: "체화 시연", phase: "3_proof", dogma: "embodied", description: "직접 시연 가능한 체크리스트·간단 도구 동봉", usageCount: 11 },
  { code: "N5_predict_break", name: "예측 깨기 강조", phase: "2_tension", dogma: "prediction_error", description: "고객의 기존 가정을 명시적으로 반박", usageCount: 7 },
  { code: "S1_cover_partner", name: "파트너 공동 표지", phase: "1_frame", dogma: null, description: "공동 사업자 협력 시 사용", usageCount: 5 },
  { code: "S2_pricing", name: "가격표", phase: "5_close", dogma: null, description: "표준 라인 아이템 기반 가격표", usageCount: 24 },
];

const PHASE_LABELS: Record<MockModule["phase"], string> = {
  "1_frame": "1. 프레임",
  "2_tension": "2. 긴장",
  "3_proof": "3. 증명",
  "4_compare": "4. 비교",
  "5_close": "5. 마무리",
};

const PHASE_COLORS: Record<MockModule["phase"], string> = {
  "1_frame": "shell-pill-blue",
  "2_tension": "shell-pill-amber",
  "3_proof": "shell-pill-green",
  "4_compare": "shell-pill-purple",
  "5_close": "shell-pill-rose",
};

export default function ModuleCatalog() {
  const [phase, setPhase] = useState<"all" | MockModule["phase"]>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(
    () => MOCK_MODULES.filter((m) => {
      if (phase !== "all" && m.phase !== phase) return false;
      if (q && !(m.code + m.name + m.description).toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    }),
    [phase, q],
  );

  return (
    <div className="page-shell">
      <header className="page-shell-head">
        <div>
          <div className="page-shell-title">모듈 카탈로그</div>
          <div className="page-shell-sub">
            제안서 슬라이드 모듈 18종 — 5단계 설득 플로우와 5대 도그마로 분류.
          </div>
        </div>
      </header>

      <div className="page-shell-banner">
        UI 미리보기 단계입니다. 누적 표본 기반 Win rate 는 모의 데이터입니다.
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          className="shell-search"
          placeholder="코드·이름·설명 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {(["all", "1_frame", "2_tension", "3_proof", "4_compare", "5_close"] as const).map((p) => (
          <button
            key={p}
            className={`btn ${phase === p ? "btn-primary" : "btn-ghost"} small`}
            onClick={() => setPhase(p)}
          >
            {p === "all" ? "전체 단계" : PHASE_LABELS[p]}
          </button>
        ))}
      </div>

      <div className="shell-grid-3">
        {filtered.map((m) => (
          <Link key={m.code} to={`/modules/${m.code}`} style={{ textDecoration: "none", color: "inherit" }}>
            <article className="shell-card" style={{ cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontFamily: "monospace", fontSize: 12, color: "#6b7280" }}>{m.code}</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#111827", marginTop: 2 }}>
                    {m.name}
                    <ModuleWinRateBadge code={m.code} />
                  </div>
                </div>
                <span className={`shell-pill ${PHASE_COLORS[m.phase]}`}>{PHASE_LABELS[m.phase]}</span>
              </div>
              <div style={{ fontSize: 13, color: "#4b5563", marginTop: 10, lineHeight: 1.5 }}>
                {m.description}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 12, display: "flex", justifyContent: "space-between" }}>
                <span>{m.dogma ? `Dogma: ${m.dogma}` : "중립"}</span>
                <span>사용 {m.usageCount}회</span>
              </div>
            </article>
          </Link>
        ))}
      </div>
    </div>
  );
}
