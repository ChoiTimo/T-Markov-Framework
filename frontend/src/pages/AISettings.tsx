/**
 * AISettings — AI 어시스턴트 운영 설정 (UI shell, mock).
 */
import { useState } from "react";
import "./_shell.css";

export default function AISettings() {
  const [routerEnabled, setRouterEnabled] = useState(true);
  const [rateLimit, setRateLimit] = useState(60);
  const [escalateLong, setEscalateLong] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState(
    "당신은 SKT B2B 네트워크·보안 솔루션의 세일즈 어시스턴트입니다.",
  );

  return (
    <div className="page-shell">
      <header className="page-shell-head">
        <div>
          <div className="page-shell-title">AI 어시스턴트 설정</div>
          <div className="page-shell-sub">모델 라우팅·호출 캡·시스템 프롬프트를 조직 단위로 관리합니다.</div>
        </div>
      </header>

      <div className="page-shell-banner">
        UI 미리보기 단계입니다. 저장 동작은 화면 상태만 갱신하며 실제 환경변수에는 반영되지 않습니다.
      </div>

      <div className="shell-grid-2">
        <section className="shell-card">
          <h3 style={{ marginTop: 0 }}>모델 라우터</h3>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            요청 종류에 따라 Haiku / Sonnet / Opus 를 자동으로 분기합니다.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
            <ToggleRow
              label="라우터 활성화"
              hint="비활성 시 모든 호출이 기본 모델 (Sonnet) 로 고정"
              checked={routerEnabled}
              onChange={setRouterEnabled}
            />
            <ToggleRow
              label="장문(>80K) Opus 에스컬레이션"
              hint="컨텍스트가 80K 토큰을 초과하면 Opus 로 자동 전환"
              checked={escalateLong}
              onChange={setEscalateLong}
            />
          </div>

          <div style={{ marginTop: 18, padding: 12, background: "#f9fafb", borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>현재 모델 매핑</div>
            <ModelRow label="요약 / 분류" model="Haiku 4.5" color="#16a34a" />
            <ModelRow label="기본 채팅 / 도구 호출" model="Sonnet 4.6" color="#4338ca" />
            <ModelRow label="장문 생성 / 고난이도 추론" model="Opus 4.6" color="#a16207" />
          </div>
        </section>

        <section className="shell-card">
          <h3 style={{ marginTop: 0 }}>호출 캡</h3>
          <p style={{ fontSize: 13, color: "#6b7280" }}>조직 단위 분당 최대 호출 수.</p>

          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13 }}>분당 최대 호출</span>
              <span style={{ fontWeight: 700, color: "#4338ca" }}>{rateLimit} req/min</span>
            </div>
            <input
              type="range"
              min={0}
              max={300}
              step={10}
              value={rateLimit}
              onChange={(e) => setRateLimit(Number(e.target.value))}
              style={{ width: "100%" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9ca3af" }}>
              <span>0 (무제한)</span>
              <span>300</span>
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>오늘 사용량 (mock)</div>
            <div style={{ background: "#f3f4f6", borderRadius: 6, height: 14, overflow: "hidden" }}>
              <div style={{ background: "linear-gradient(90deg,#4338ca,#6366f1)", height: "100%", width: "42%" }} />
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>1,254 / 3,000 호출 (분당 평균 21회)</div>
          </div>
        </section>
      </div>

      <section className="shell-card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>조직 시스템 프롬프트</h3>
        <p style={{ fontSize: 13, color: "#6b7280" }}>
          모든 어시스턴트 호출의 system 프롬프트에 추가됩니다. 짧고 일관된 어조 가이드를 권장합니다.
        </p>
        <textarea
          rows={5}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6, fontFamily: "inherit", fontSize: 13 }}
        />
        <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-ghost">기본값으로 되돌리기</button>
          <button className="btn btn-primary">저장 (mock)</button>
        </div>
      </section>
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }: {
  label: string; hint: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", gap: 12 }}>
      <div>
        <div style={{ fontWeight: 500, fontSize: 14 }}>{label}</div>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>{hint}</div>
      </div>
      <span
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: 40, height: 22, borderRadius: 999,
          background: checked ? "#4338ca" : "#d1d5db",
          position: "relative", transition: "background 0.15s",
          cursor: "pointer", flexShrink: 0,
        }}
      >
        <span style={{
          position: "absolute", top: 2, left: checked ? 20 : 2,
          width: 18, height: 18, borderRadius: "50%", background: "#fff",
          transition: "left 0.15s",
        }} />
      </span>
    </label>
  );
}

function ModelRow({ label, model, color }: { label: string; model: string; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #e5e7eb", fontSize: 13 }}>
      <span style={{ color: "#4b5563" }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{model}</span>
    </div>
  );
}
