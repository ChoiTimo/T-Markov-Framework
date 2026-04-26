/**
 * NotificationsSettings — 알림 구독 설정 (UI shell, mock).
 */
import { useState } from "react";
import "./_shell.css";

interface SubKey {
  key: string;
  label: string;
  desc: string;
}

const SUBSCRIPTIONS: SubKey[] = [
  { key: "competitive_critical", label: "경쟁 신호 — 긴급", desc: "severity=critical 인 경쟁사 신호 즉시 알림" },
  { key: "competitive_high", label: "경쟁 신호 — 중요", desc: "severity=high 신호 일 1회 요약" },
  { key: "daily_summary", label: "일일 인사이트 요약", desc: "매일 09:00 KST 어제 활동 요약 메일" },
  { key: "deal_won", label: "딜 성사 알림", desc: "팀 내 누군가 딜을 Won 으로 라벨 시" },
  { key: "deal_lost", label: "딜 실패 알림", desc: "팀 내 누군가 딜을 Lost 로 라벨 시" },
  { key: "ai_rate_limit", label: "AI 호출 캡 도달", desc: "분당 호출 캡의 80% 이상 사용 시" },
  { key: "module_winrate_change", label: "모듈 Win rate 급변", desc: "특정 모듈의 Win rate 가 ±10% 이상 변동 시" },
];

const CHANNELS = [
  { key: "email", label: "이메일", icon: "✉️" },
  { key: "in_app", label: "앱 내 알림", icon: "🔔" },
  { key: "slack", label: "Slack DM", icon: "💬" },
] as const;

export default function NotificationsSettings() {
  const [state, setState] = useState<Record<string, Record<string, boolean>>>(() => {
    const init: Record<string, Record<string, boolean>> = {};
    SUBSCRIPTIONS.forEach((s) => {
      init[s.key] = { email: true, in_app: true, slack: false };
    });
    return init;
  });

  const toggle = (subKey: string, channel: string) => {
    setState((prev) => ({
      ...prev,
      [subKey]: { ...prev[subKey], [channel]: !prev[subKey][channel] },
    }));
  };

  return (
    <div className="page-shell">
      <header className="page-shell-head">
        <div>
          <div className="page-shell-title">알림 설정</div>
          <div className="page-shell-sub">이벤트별 채널 (이메일·앱·Slack) 알림을 켜고 끕니다.</div>
        </div>
      </header>

      <div className="page-shell-banner">UI 미리보기 단계입니다. 저장은 화면 상태만 갱신합니다.</div>

      <section className="shell-card">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "8px", borderBottom: "2px solid #e5e7eb", fontSize: 13 }}>이벤트</th>
              {CHANNELS.map((c) => (
                <th key={c.key} style={{ width: 80, padding: "8px", borderBottom: "2px solid #e5e7eb", textAlign: "center", fontSize: 13 }}>
                  {c.icon} {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SUBSCRIPTIONS.map((s) => (
              <tr key={s.key}>
                <td style={{ padding: "10px 8px", borderBottom: "1px solid #f3f4f6" }}>
                  <div style={{ fontWeight: 500 }}>{s.label}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>{s.desc}</div>
                </td>
                {CHANNELS.map((c) => (
                  <td key={c.key} style={{ textAlign: "center", padding: "10px 8px", borderBottom: "1px solid #f3f4f6" }}>
                    <input
                      type="checkbox"
                      checked={state[s.key][c.key]}
                      onChange={() => toggle(s.key, c.key)}
                      aria-label={`${s.label} - ${c.label}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button className="btn btn-ghost">기본값 복원</button>
        <button className="btn btn-primary">저장 (mock)</button>
      </div>
    </div>
  );
}
