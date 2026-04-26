/**
 * ModuleWinRateBadge — 모듈 카드용 작은 Win rate 뱃지 (Sprint 3-3 UI shell).
 *
 * 현재는 모듈 코드 기반 결정적 mock rate. 실제 데이터는 proposal_win_rate_by_module 뷰에서.
 */
function mockRate(code: string): number {
  // 간단 해시 기반 결정적 값 (45-88% 범위)
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h << 5) - h + code.charCodeAt(i);
  return 45 + (Math.abs(h) % 44);
}

export default function ModuleWinRateBadge({ code }: { code: string }) {
  const r = mockRate(code);
  const color =
    r >= 75 ? "#16a34a" : r >= 60 ? "#0891b2" : r >= 45 ? "#d97706" : "#6b7280";
  return (
    <span
      title="누적 표본 기반 Win rate (mock)"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 6px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 600,
        background: `${color}15`,
        color,
        marginLeft: 4,
      }}
    >
      {r}%
    </span>
  );
}
