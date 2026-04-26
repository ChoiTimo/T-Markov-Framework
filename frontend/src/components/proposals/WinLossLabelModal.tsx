/**
 * WinLossLabelModal — 제안서 결과(Win/Loss/Canceled) 라벨링 모달 (Sprint 3-3 UI shell).
 *
 * Submit 시점에 backend 호출은 stub. 화면 상태만 업데이트하고 토스트 안내.
 */
import { useState } from "react";

type DealStatus = "won" | "lost" | "canceled";
type ReasonCategory = "price" | "feature" | "timing" | "competitor" | "other";

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    status: DealStatus;
    reason_category: ReasonCategory;
    reason_note: string;
    contract_value: number | null;
    competitors: string[];
  }) => void;
}

const STATUS_OPTIONS: { value: DealStatus; label: string; color: string }[] = [
  { value: "won", label: "Won (성사)", color: "#16a34a" },
  { value: "lost", label: "Lost (실패)", color: "#dc2626" },
  { value: "canceled", label: "Canceled (보류)", color: "#6b7280" },
];

const REASON_OPTIONS: { value: ReasonCategory; label: string }[] = [
  { value: "price", label: "가격" },
  { value: "feature", label: "기능 적합성" },
  { value: "timing", label: "타이밍" },
  { value: "competitor", label: "경쟁사 우위" },
  { value: "other", label: "기타" },
];

export default function WinLossLabelModal({ open, onClose, onSubmit }: Props) {
  const [status, setStatus] = useState<DealStatus>("won");
  const [reason, setReason] = useState<ReasonCategory>("price");
  const [note, setNote] = useState("");
  const [contractValue, setContractValue] = useState<string>("");
  const [competitors, setCompetitors] = useState<string>("");

  if (!open) return null;

  const handleSubmit = () => {
    onSubmit({
      status,
      reason_category: reason,
      reason_note: note,
      contract_value: contractValue ? Number(contractValue) : null,
      competitors: competitors
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="딜 결과 라벨링"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.5)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          width: 480,
          maxWidth: "90%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>딜 결과 라벨링</h3>
          <button className="btn btn-ghost small" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
            결과
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.value}
                onClick={() => setStatus(s.value)}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  border: status === s.value ? `2px solid ${s.color}` : "1px solid #d1d5db",
                  borderRadius: 6,
                  background: status === s.value ? `${s.color}15` : "#fff",
                  color: status === s.value ? s.color : "#374151",
                  fontWeight: status === s.value ? 600 : 400,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
            이유 카테고리
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as ReasonCategory)}
            style={{ width: "100%", padding: 8, border: "1px solid #d1d5db", borderRadius: 6 }}
          >
            {REASON_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
            상세 메모
          </label>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="(선택) 결정의 핵심 맥락을 한두 문장으로 기록"
            style={{ width: "100%", padding: 8, border: "1px solid #d1d5db", borderRadius: 6, fontFamily: "inherit", fontSize: 13 }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
              계약 금액 (원)
            </label>
            <input
              type="number"
              value={contractValue}
              onChange={(e) => setContractValue(e.target.value)}
              placeholder="0"
              style={{ width: "100%", padding: 8, border: "1px solid #d1d5db", borderRadius: 6 }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
              관련 경쟁사 (쉼표 구분)
            </label>
            <input
              type="text"
              value={competitors}
              onChange={(e) => setCompetitors(e.target.value)}
              placeholder="Cisco, Fortinet"
              style={{ width: "100%", padding: 8, border: "1px solid #d1d5db", borderRadius: 6 }}
            />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={handleSubmit}>
            저장
          </button>
        </div>

        <div style={{ marginTop: 12, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>
          UI 미리보기 단계입니다. 백엔드 연결 후 deal_win_loss 테이블에 영구 저장됩니다.
        </div>
      </div>
    </div>
  );
}
