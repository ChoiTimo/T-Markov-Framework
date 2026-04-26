/**
 * DealPipeline — 칸반 보드 (UI shell, mock).
 * 컬럼별 드래그앤드롭은 mock (state 이동만).
 */
import { useState, type DragEvent } from "react";
import "./_shell.css";
import "./DealPipeline.css";

type Stage = "lead" | "qualified" | "proposal" | "negotiation" | "closed";

interface Deal {
  id: string;
  title: string;
  customer: string;
  value: number;
  probability: number;
  stage: Stage;
  closeDate?: string;
}

const STAGE_LABELS: Record<Stage, string> = {
  lead: "Lead",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  closed: "Closed Won/Lost",
};

const INITIAL: Deal[] = [
  { id: "d-001", title: "스마트팩토리 SD-WAN 도입", customer: "삼성전자", value: 180_000_000, probability: 70, stage: "proposal" },
  { id: "d-002", title: "전국 지점 보안 통합", customer: "신한은행", value: 320_000_000, probability: 80, stage: "negotiation" },
  { id: "d-003", title: "공공 클라우드 NaaS PoC", customer: "한국전력공사", value: 90_000_000, probability: 30, stage: "qualified" },
  { id: "d-004", title: "이커머스 트래픽 ZTNA", customer: "쿠팡", value: 140_000_000, probability: 55, stage: "proposal" },
  { id: "d-005", title: "글로벌 R&D 망 통합", customer: "현대자동차", value: 410_000_000, probability: 65, stage: "negotiation" },
  { id: "d-006", title: "미디어 스트리밍 백본", customer: "LG U+", value: 220_000_000, probability: 25, stage: "lead" },
  { id: "d-007", title: "ICT 통합 운영", customer: "네이버클라우드", value: 280_000_000, probability: 60, stage: "qualified" },
  { id: "d-008", title: "본사 + 지점 SASE", customer: "롯데마트", value: 110_000_000, probability: 45, stage: "lead" },
  { id: "d-009", title: "공공 통합 보안", customer: "서울시청", value: 90_000_000, probability: 90, stage: "closed" },
];

function probClass(p: number): "high" | "mid" | "low" {
  if (p >= 70) return "high";
  if (p >= 40) return "mid";
  return "low";
}

function fmt(n: number): string {
  return (n / 1_000_000).toFixed(0) + "M";
}

export default function DealPipeline() {
  const [deals, setDeals] = useState<Deal[]>(INITIAL);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const stages: Stage[] = ["lead", "qualified", "proposal", "negotiation", "closed"];

  const onDragStart = (e: DragEvent<HTMLDivElement>, id: string) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onDrop = (stage: Stage) => {
    if (!draggingId) return;
    setDeals((prev) => prev.map((d) => (d.id === draggingId ? { ...d, stage } : d)));
    setDraggingId(null);
  };

  const totalValue = deals.reduce((acc, d) => acc + d.value, 0);
  const weighted = deals.reduce((acc, d) => acc + d.value * (d.probability / 100), 0);
  const wonValue = deals.filter((d) => d.stage === "closed").reduce((a, d) => a + d.value, 0);

  return (
    <div className="page-shell">
      <header className="page-shell-head">
        <div>
          <div className="page-shell-title">딜 파이프라인</div>
          <div className="page-shell-sub">진행 중 딜을 단계별로 추적하고 가중 예상치를 산출합니다.</div>
        </div>
        <button className="btn btn-primary">+ 신규 딜</button>
      </header>

      <div className="page-shell-banner">
        UI 미리보기 단계입니다. 카드를 다른 컬럼으로 드래그하면 단계가 변경됩니다 (mock, 새로고침 시 초기화).
      </div>

      <div className="dp-summary-bar">
        <div className="dp-summary-stat">
          <div className="dp-summary-label">파이프 총액</div>
          <div className="dp-summary-value">{fmt(totalValue)}원</div>
        </div>
        <div className="dp-summary-stat">
          <div className="dp-summary-label">가중 예상</div>
          <div className="dp-summary-value">{fmt(weighted)}원</div>
        </div>
        <div className="dp-summary-stat">
          <div className="dp-summary-label">Closed Won</div>
          <div className="dp-summary-value" style={{ color: "#16a34a" }}>{fmt(wonValue)}원</div>
        </div>
        <div className="dp-summary-stat">
          <div className="dp-summary-label">총 딜 수</div>
          <div className="dp-summary-value">{deals.length}건</div>
        </div>
      </div>

      <div className="dp-board">
        {stages.map((s) => {
          const items = deals.filter((d) => d.stage === s);
          return (
            <div
              key={s}
              className="dp-column"
              onDragOver={onDragOver}
              onDrop={() => onDrop(s)}
            >
              <div className="dp-column-head">
                <span>{STAGE_LABELS[s]}</span>
                <span className="dp-column-count">{items.length}</span>
              </div>
              {items.map((d) => (
                <div
                  key={d.id}
                  className="dp-card"
                  draggable
                  onDragStart={(e) => onDragStart(e, d.id)}
                >
                  <div className="dp-card-title">{d.title}</div>
                  <div className="dp-card-customer">{d.customer}</div>
                  <div className="dp-card-foot">
                    <span className="dp-card-value">{fmt(d.value)}원</span>
                    <span className={`dp-card-prob ${probClass(d.probability)}`}>{d.probability}%</span>
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <div style={{ color: "#9ca3af", fontSize: 12, textAlign: "center", padding: 24 }}>
                  비어 있음
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
