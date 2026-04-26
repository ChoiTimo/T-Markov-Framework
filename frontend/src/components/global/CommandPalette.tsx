/**
 * CommandPalette — Cmd+K (Ctrl+K) 글로벌 명령 팔레트 (UI shell, mock).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

interface Command {
  id: string;
  label: string;
  hint: string;
  action: () => void;
  keywords: string;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      if ((isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const commands = useMemo<Command[]>(
    () => [
      { id: "go-dashboard", label: "Dashboard", hint: "메인 홈", action: () => navigate("/"), keywords: "home dashboard 홈 대시보드" },
      { id: "go-customers", label: "고객 관리", hint: "Customers", action: () => navigate("/customers"), keywords: "customers 고객" },
      { id: "go-deals", label: "딜 파이프라인", hint: "Deal Pipeline", action: () => navigate("/deals"), keywords: "deals 딜 파이프라인 kanban" },
      { id: "go-quotes", label: "견적 계산기", hint: "Quotes", action: () => navigate("/quotes"), keywords: "quotes 견적" },
      { id: "go-battlecards", label: "배틀카드", hint: "Battle Cards", action: () => navigate("/battlecards"), keywords: "battle cards 배틀카드 경쟁" },
      { id: "go-proposals", label: "제안서 생성", hint: "Proposals", action: () => navigate("/proposals"), keywords: "proposals 제안서" },
      { id: "go-modules", label: "모듈 카탈로그", hint: "Modules", action: () => navigate("/modules"), keywords: "modules 모듈 카탈로그" },
      { id: "go-insights", label: "통합 인사이트", hint: "Insights", action: () => navigate("/insights"), keywords: "insights 인사이트 대시보드" },
      { id: "go-competitive", label: "경쟁 피드", hint: "Competitive", action: () => navigate("/reports/competitive"), keywords: "competitive 경쟁 피드" },
      { id: "go-reports", label: "리포트 인덱스", hint: "Reports", action: () => navigate("/reports"), keywords: "reports 리포트" },
      { id: "go-ai-settings", label: "AI 어시스턴트 설정", hint: "Settings", action: () => navigate("/settings/ai"), keywords: "ai settings 모델 라우터 설정" },
      { id: "go-notif-settings", label: "알림 설정", hint: "Notifications", action: () => navigate("/settings/notifications"), keywords: "notifications 알림" },
      { id: "new-quote", label: "신규 견적 작성", hint: "Quote +", action: () => navigate("/quotes/new"), keywords: "new quote 신규 견적" },
      { id: "new-customer", label: "신규 고객 (UI mock)", hint: "Customer +", action: () => navigate("/customers"), keywords: "new customer 신규 고객" },
    ],
    [navigate],
  );

  const filtered = useMemo(() => {
    if (!q.trim()) return commands;
    const t = q.toLowerCase();
    return commands.filter((c) => (c.label + c.hint + c.keywords).toLowerCase().includes(t));
  }, [q, commands]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => setOpen(false)}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
        zIndex: 1200, display: "flex", justifyContent: "center", paddingTop: "12vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 12, width: 560, maxWidth: "90%",
          maxHeight: "70vh", overflow: "hidden", display: "flex", flexDirection: "column",
          boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
        }}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="명령어 또는 페이지 검색…"
          style={{
            border: "none", outline: "none", padding: "16px 20px",
            fontSize: 15, borderBottom: "1px solid #e5e7eb",
          }}
        />
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
              일치하는 명령이 없습니다.
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => { c.action(); setOpen(false); }}
                style={{
                  width: "100%", textAlign: "left", border: "none",
                  background: "transparent", padding: "12px 20px", cursor: "pointer",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  borderBottom: "1px solid #f3f4f6",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ fontSize: 14, color: "#111827", fontWeight: 500 }}>{c.label}</span>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>{c.hint}</span>
              </button>
            ))
          )}
        </div>
        <div style={{
          padding: "8px 16px", borderTop: "1px solid #e5e7eb",
          fontSize: 11, color: "#9ca3af", display: "flex", justifyContent: "space-between",
        }}>
          <span>Cmd/Ctrl + K 로 토글</span>
          <span>Esc 로 닫기</span>
        </div>
      </div>
    </div>
  );
}
