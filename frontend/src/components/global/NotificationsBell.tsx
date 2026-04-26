/**
 * NotificationsBell — Layout 헤더용 알림 종 + 드롭다운 패널 (UI shell, mock).
 */
import { useEffect, useRef, useState } from "react";

interface MockNotification {
  id: string;
  ts: string;
  kind: "competitive" | "deal" | "ai" | "summary";
  title: string;
  body: string;
  read: boolean;
}

const ICONS: Record<MockNotification["kind"], string> = {
  competitive: "⚔️",
  deal: "🎯",
  ai: "🤖",
  summary: "📊",
};

const INITIAL: MockNotification[] = [
  { id: "n-001", ts: "방금 전", kind: "competitive", title: "Palo Alto 한국 DC 오픈", body: "Critical 신호 1건이 큐에 추가되었습니다.", read: false },
  { id: "n-002", ts: "32분 전", kind: "deal", title: "삼성전자 — Won", body: "스마트팩토리 SD-WAN 도입 (180M)", read: false },
  { id: "n-003", ts: "1시간 전", kind: "ai", title: "AI 호출 캡 75% 사용", body: "분당 호출 캡 60 중 45회 사용 중입니다.", read: false },
  { id: "n-004", ts: "오늘 09:00", kind: "summary", title: "일일 인사이트", body: "어제 12건의 신규 활동이 있었고 도구 사용률이 +27% 증가했습니다.", read: true },
  { id: "n-005", ts: "어제", kind: "competitive", title: "Fortinet FortiOS 7.6 GA", body: "Workflow Studio 차별화 약화 가능성, 데모 흐름 보강 권장.", read: true },
];

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<MockNotification[]>(INITIAL);
  const ref = useRef<HTMLDivElement | null>(null);

  const unread = notifs.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const markAllRead = () => setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="알림"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          fontSize: 18, padding: 6, position: "relative",
          color: "#fff", opacity: 0.85,
        }}
      >
        🔔
        {unread > 0 && (
          <span
            style={{
              position: "absolute", top: 0, right: 0,
              background: "#dc2626", color: "#fff",
              borderRadius: 999, fontSize: 10, fontWeight: 700,
              padding: "1px 5px", minWidth: 18, textAlign: "center",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0,
            width: 360, maxHeight: 480, overflow: "auto",
            background: "#fff", border: "1px solid #e5e7eb",
            borderRadius: 10, boxShadow: "0 12px 40px rgba(15,23,42,0.18)",
            zIndex: 1100,
          }}
        >
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: 13 }}>알림 ({unread} 미읽음)</strong>
            <button
              onClick={markAllRead}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "#4338ca", fontSize: 12 }}
            >
              모두 읽음
            </button>
          </div>
          {notifs.map((n) => (
            <div
              key={n.id}
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid #f3f4f6",
                background: n.read ? "#fff" : "#eef2ff",
                cursor: "pointer",
              }}
              onClick={() => setNotifs((prev) => prev.map((p) => p.id === n.id ? { ...p, read: true } : p))}
            >
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ fontSize: 18 }}>{ICONS[n.kind]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{n.title}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{n.body}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{n.ts}</div>
                </div>
              </div>
            </div>
          ))}
          <div style={{ padding: "10px 14px", textAlign: "center" }}>
            <a href="/settings/notifications" style={{ color: "#4338ca", fontSize: 12, textDecoration: "none" }}>
              알림 설정 →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
