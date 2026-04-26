/**
 * AssistantDraftCard — 쓰기 도구 드래프트 + Confirm 루프.
 *
 * 사용자가 "적용"을 누르면 confirmTool() 이 호출되고 실제 DB 변경이 일어난다.
 * "거절"은 status='rejected' 로 마감.
 */
import { useState } from "react";
import { confirmTool } from "@/services/ai";
import type { AssistantToolCall } from "@/types/ai";

interface Props {
  call: AssistantToolCall;
  onResolved?: (result: { status: string; result?: Record<string, unknown> }) => void;
}

function describePreview(call: AssistantToolCall): string {
  const preview = (call.result as { preview?: Record<string, unknown> }).preview;
  if (!preview) return "(미리보기 없음)";
  if (call.tool_name === "draft_slide_append") {
    return `슬라이드 추가 — 모듈 ${String(preview.module_code)} : ${String(preview.reason ?? "")}`;
  }
  if (call.tool_name === "draft_battlecard_update") {
    return `배틀카드 ${String(preview.field)} → "${String(preview.new_value)}"`;
  }
  if (call.tool_name === "draft_quote_lineitem") {
    return `${String(preview.sku)} × ${String(preview.qty)} @ ${String(preview.unit_price)} = ${String(
      preview.line_total,
    )}`;
  }
  return JSON.stringify(preview);
}

export default function AssistantDraftCard({ call, onResolved }: Props) {
  const [busy, setBusy] = useState(false);
  const [resolved, setResolved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = async (rejected: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const r = await confirmTool(call.tool_execution_id, { rejected });
      setResolved(r.status);
      onResolved?.(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confirm 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ai-draft-card">
      <div className="ai-draft-head">
        <span className="ai-draft-tag">변경 제안</span>
        <span className="ai-draft-name">{call.tool_name}</span>
      </div>
      <div className="ai-draft-preview">{describePreview(call)}</div>
      {error && <div className="ai-draft-error">{error}</div>}
      {resolved ? (
        <div className={`ai-draft-resolved ai-status-${resolved}`}>
          {resolved === "applied"
            ? "적용 완료"
            : resolved === "rejected"
              ? "거절됨"
              : `결과: ${resolved}`}
        </div>
      ) : (
        <div className="ai-draft-actions">
          <button
            className="btn btn-primary small"
            disabled={busy}
            onClick={() => apply(false)}
          >
            적용
          </button>
          <button
            className="btn btn-ghost small"
            disabled={busy}
            onClick={() => apply(true)}
          >
            거절
          </button>
        </div>
      )}
    </div>
  );
}
