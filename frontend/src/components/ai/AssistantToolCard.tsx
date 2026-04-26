/**
 * AssistantToolCard — read-tool 결과 표시.
 * 쓰기 도구는 AssistantDraftCard 를 사용한다.
 */
import type { AssistantToolCall } from "@/types/ai";

interface Props {
  call: AssistantToolCall;
}

function summarize(call: AssistantToolCall): string {
  if (call.status === "failed") return "도구 실행 실패";
  if (call.tool_name === "get_proposal") {
    const p = call.result as { proposal?: { title?: string }; slide_count?: number };
    return `제안서 \"${p.proposal?.title ?? "(제목 없음)"}\" — 슬라이드 ${p.slide_count ?? "?"}개`;
  }
  if (call.tool_name === "get_quote") {
    const r = call.result as { line_items?: unknown[] };
    return `견적 라인 아이템 ${r.line_items?.length ?? "?"}건 조회`;
  }
  if (call.tool_name === "get_battlecard") {
    const r = call.result as { battlecard?: { competitor_name?: string } };
    return `배틀카드: ${r.battlecard?.competitor_name ?? "(이름 없음)"}`;
  }
  return `도구 \"${call.tool_name}\" 실행 완료`;
}

export default function AssistantToolCard({ call }: Props) {
  return (
    <div className="ai-tool-card">
      <div className="ai-tool-head">
        <span className="ai-tool-name">{call.tool_name}</span>
        <span className={`ai-tool-status ai-status-${call.status}`}>{call.status}</span>
      </div>
      <div className="ai-tool-summary">{summarize(call)}</div>
    </div>
  );
}
