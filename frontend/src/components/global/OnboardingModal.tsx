/**
 * OnboardingModal — 첫 로그인 환영 가이드 (UI shell, mock).
 *
 * sessionStorage 사용 안 함 (artifact 환경 제약). 화면 상태만으로 닫기.
 */
import { useState } from "react";

interface Step {
  emoji: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    emoji: "👋",
    title: "SmartWAN 플랫폼에 오신 것을 환영합니다",
    body: "B2B 네트워크·보안 솔루션 영업의 처음과 끝을 한 곳에서. 제안서 생성·견적·경쟁사 대응을 AI 와 함께 진행합니다.",
  },
  {
    emoji: "🤖",
    title: "AI 어시스턴트가 항상 우측에",
    body: "각 화면 우측 가장자리의 'AI' 트리거를 눌러 보세요. 현재 보고 있는 제안서·견적·배틀카드의 컨텍스트를 자동으로 반영해 답합니다.",
  },
  {
    emoji: "📊",
    title: "통합 인사이트로 한눈에",
    body: "사이드바의 '통합 인사이트' 에서 일일 요약·Win/Loss 퍼널·모듈별 Win rate 를 확인하세요.",
  },
  {
    emoji: "⌘K",
    title: "어디서든 빠르게",
    body: "Cmd+K (Windows: Ctrl+K) 로 명령 팔레트를 열어 어느 페이지로든 즉시 이동할 수 있습니다.",
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function OnboardingModal({ open, onClose }: Props) {
  const [idx, setIdx] = useState(0);
  if (!open) return null;
  const step = STEPS[idx];
  const last = idx === STEPS.length - 1;

  return (
    <div
      role="dialog" aria-modal="true"
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)",
        zIndex: 1300, display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div style={{
        background: "#fff", borderRadius: 14, width: 480, maxWidth: "90%",
        padding: 36, textAlign: "center", boxShadow: "0 30px 80px rgba(0,0,0,0.4)",
      }}>
        <div style={{ fontSize: 64, marginBottom: 12 }}>{step.emoji}</div>
        <h2 style={{ margin: "0 0 12px", fontSize: 22, color: "#111827" }}>{step.title}</h2>
        <p style={{ color: "#4b5563", lineHeight: 1.7, fontSize: 14, marginBottom: 24 }}>{step.body}</p>

        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 20 }}>
          {STEPS.map((_, i) => (
            <span key={i} style={{
              width: 8, height: 8, borderRadius: "50%",
              background: i === idx ? "#4338ca" : "#d1d5db",
            }} />
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button className="btn btn-ghost" onClick={onClose}>건너뛰기</button>
          {idx > 0 && (
            <button className="btn btn-ghost" onClick={() => setIdx(idx - 1)}>이전</button>
          )}
          <button
            className="btn btn-primary"
            onClick={() => last ? onClose() : setIdx(idx + 1)}
          >
            {last ? "시작하기" : "다음"}
          </button>
        </div>
      </div>
    </div>
  );
}
