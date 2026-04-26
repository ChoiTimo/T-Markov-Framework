/**
 * SuccessProbabilityGauge — 제안서 우측에 도킹되는 성공 확률 게이지 (Sprint 3-3 UI shell).
 *
 * 현 단계는 모듈 코드 + 슬라이드 수 기반의 휴리스틱 mock 계산.
 * 실제 베이지안 추정은 win_loss_model.py 가 활성화된 후 backend 연결.
 */
interface Props {
  slideCount: number;
  slideCodes: string[];
}

const HIGH_VALUE_MODULES = new Set([
  "P5_surprise",
  "P3_proof_metric",
  "N2_neuro_anchor",
  "P4_competitive_compare",
]);

function estimateProbability(slideCount: number, slideCodes: string[]): number {
  // 매우 단순한 휴리스틱: 슬라이드 수 가중 + 고가치 모듈 포함률
  if (slideCount === 0) return 0;
  const base = Math.min(slideCount, 12) * 4; // 최대 48
  const hits = slideCodes.filter((c) => HIGH_VALUE_MODULES.has(c)).length;
  const bonus = Math.min(hits * 8, 32); // 최대 32
  const noise = (slideCount % 7) * 1.2; // 보기에 자연스러운 정수 분산
  return Math.min(95, Math.max(15, Math.round(base + bonus + noise)));
}

function band(prob: number): { label: string; color: string } {
  if (prob >= 70) return { label: "Strong", color: "#16a34a" };
  if (prob >= 50) return { label: "Moderate", color: "#0891b2" };
  if (prob >= 30) return { label: "Weak", color: "#d97706" };
  return { label: "Very Weak", color: "#dc2626" };
}

export default function SuccessProbabilityGauge({ slideCount, slideCodes }: Props) {
  const prob = estimateProbability(slideCount, slideCodes);
  const b = band(prob);

  // 반원 게이지: 180도 회전, 0% → 좌측, 100% → 우측
  const r = 56;
  const cx = 70;
  const cy = 70;
  const startAngle = Math.PI;
  const endAngle = startAngle - (prob / 100) * Math.PI;
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = prob > 50 ? 1 : 0;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: 14,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 8,
        }}
      >
        예상 성공 확률 (mock)
      </div>
      <svg width={140} height={84} viewBox="0 0 140 84">
        {/* 배경 트랙 */}
        <path
          d={`M ${cx + r * Math.cos(Math.PI)} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={10}
          strokeLinecap="round"
        />
        {/* 채워진 호 (probability > 0 일 때만) */}
        {prob > 0 && (
          <path
            d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`}
            fill="none"
            stroke={b.color}
            strokeWidth={10}
            strokeLinecap="round"
          />
        )}
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fontSize={22}
          fontWeight={700}
          fill="#111827"
        >
          {prob}%
        </text>
      </svg>
      <div style={{ fontSize: 12, color: b.color, fontWeight: 600 }}>{b.label}</div>
      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
        모듈 {slideCount} 개 · 휴리스틱 추정. 라벨된 딜 누적 후 베이지안 모델로 전환.
      </div>
    </div>
  );
}
