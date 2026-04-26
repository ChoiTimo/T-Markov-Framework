/**
 * AssistantConversationList — 대화 히스토리 사이드 (간단 버전).
 * pin / archive / tag 컨트롤은 추후 추가.
 */
import type { AssistantConversation } from "@/types/ai";

interface Props {
  items: AssistantConversation[];
  activeId: string | null;
  loading?: boolean;
  onSelect: (conversation: AssistantConversation) => void;
  onNew: () => void;
}

export default function AssistantConversationList({
  items,
  activeId,
  loading,
  onSelect,
  onNew,
}: Props) {
  return (
    <div className="ai-conv-list">
      <div className="ai-conv-head">
        <span>최근 대화</span>
        <button className="btn btn-ghost small" onClick={onNew}>
          새 대화
        </button>
      </div>
      {loading && <div className="muted small">불러오는 중…</div>}
      {!loading && items.length === 0 && (
        <div className="muted small">아직 대화가 없습니다.</div>
      )}
      <ul className="ai-conv-items">
        {items.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className={`ai-conv-item ${c.id === activeId ? "active" : ""}`}
              onClick={() => onSelect(c)}
            >
              <div className="ai-conv-title">
                {c.pinned && <span className="ai-pin">📌</span>}
                {c.title || `(${c.surface}) 무제 대화`}
              </div>
              <div className="ai-conv-meta">
                {c.message_count}턴 · {new Date(c.updated_at).toLocaleDateString("ko-KR")}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
