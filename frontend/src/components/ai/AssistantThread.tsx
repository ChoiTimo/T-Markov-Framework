/**
 * AssistantThread — 대화 메시지 리스트 렌더러.
 * 스트리밍은 Sprint 3-1.b 에서 추가 예정. 현 스켈레톤은 한 번에 렌더.
 */
import { useEffect, useRef } from "react";
import AssistantDraftCard from "./AssistantDraftCard";
import AssistantToolCard from "./AssistantToolCard";
import type { AssistantMessage, AssistantToolCall } from "@/types/ai";

interface Props {
  messages: AssistantMessage[];
  loading: boolean;
}

export default function AssistantThread({ messages, loading }: Props) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading]);

  return (
    <div className="ai-thread">
      {messages.length === 0 && !loading && (
        <div className="ai-thread-empty">
          질문을 입력하면 현재 화면 컨텍스트를 활용해 답변합니다.
        </div>
      )}

      {messages.map((m) => {
        const text = m.content?.text ?? "";
        const calls: AssistantToolCall[] = m.content?.tool_calls ?? [];
        return (
          <div key={m.id} className={`ai-msg ai-msg-${m.role}`}>
            {text && <div className="ai-msg-text">{text}</div>}
            {calls.map((c) =>
              c.mutates_data ? (
                <AssistantDraftCard key={c.tool_execution_id} call={c} />
              ) : (
                <AssistantToolCard key={c.tool_execution_id} call={c} />
              ),
            )}
            {m.error_kind && (
              <div className="ai-msg-error">[{m.error_kind}] {m.error_detail}</div>
            )}
          </div>
        );
      })}

      {loading && <div className="ai-msg ai-msg-loading">생각 중…</div>}
      <div ref={endRef} />
    </div>
  );
}
