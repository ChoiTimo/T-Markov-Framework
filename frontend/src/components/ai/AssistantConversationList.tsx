/**
 * AssistantConversationList — 대화 히스토리 사이드 + 메타 컨트롤 (Sprint 3-1.b UI shell).
 *
 * pin / archive / tag 토글이 추가되었습니다. 백엔드 호출은 services/ai.ts 의 기존 함수.
 */
import { useState } from "react";
import {
  archiveConversation,
  pinConversation,
  setConversationTags,
} from "@/services/ai";
import type { AssistantConversation } from "@/types/ai";

interface Props {
  items: AssistantConversation[];
  activeId: string | null;
  loading?: boolean;
  onSelect: (conversation: AssistantConversation) => void;
  onNew: () => void;
  /** 메타가 변경된 후 상위에서 목록을 다시 불러오게 트리거 */
  onMetaChange?: () => void;
}

export default function AssistantConversationList({
  items,
  activeId,
  loading,
  onSelect,
  onNew,
  onMetaChange,
}: Props) {
  const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePin = async (id: string, pinned: boolean) => {
    setBusyId(id);
    setError(null);
    try {
      await pinConversation(id, !pinned);
      onMetaChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pin 실패");
    } finally {
      setBusyId(null);
    }
  };

  const handleArchive = async (id: string, archived: boolean) => {
    setBusyId(id);
    setError(null);
    try {
      await archiveConversation(id, !archived);
      onMetaChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archive 실패");
    } finally {
      setBusyId(null);
    }
  };

  const startTagEdit = (c: AssistantConversation) => {
    setEditingTagsFor(c.id);
    setTagDraft(c.tags.join(", "));
  };

  const saveTags = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const tags = tagDraft
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await setConversationTags(id, tags);
      setEditingTagsFor(null);
      onMetaChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tag 저장 실패");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="ai-conv-list">
      <div className="ai-conv-head">
        <span>최근 대화</span>
        <button className="btn btn-ghost small" onClick={onNew}>
          새 대화
        </button>
      </div>
      {error && <div className="ai-panel-error">{error}</div>}
      {loading && <div className="muted small">불러오는 중…</div>}
      {!loading && items.length === 0 && (
        <div className="muted small">아직 대화가 없습니다.</div>
      )}
      <ul className="ai-conv-items">
        {items.map((c) => {
          const isEditing = editingTagsFor === c.id;
          const isBusy = busyId === c.id;
          return (
            <li key={c.id} className={`ai-conv-li ${c.id === activeId ? "active" : ""}`}>
              <button
                type="button"
                className={`ai-conv-item ${c.id === activeId ? "active" : ""}`}
                onClick={() => onSelect(c)}
              >
                <div className="ai-conv-title">
                  {c.pinned && <span className="ai-pin">📌</span>}
                  {c.archived_at && <span style={{ marginRight: 4 }}>🗄️</span>}
                  {c.title || `(${c.surface}) 무제 대화`}
                </div>
                <div className="ai-conv-meta">
                  {c.message_count}턴 · {new Date(c.updated_at).toLocaleDateString("ko-KR")}
                </div>
                {c.tags.length > 0 && (
                  <div className="ai-conv-tags">
                    {c.tags.map((t) => (
                      <span key={t} className="ai-conv-tag">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </button>

              <div className="ai-conv-actions">
                <button
                  type="button"
                  className="ai-conv-action"
                  disabled={isBusy}
                  title={c.pinned ? "고정 해제" : "고정"}
                  onClick={() => handlePin(c.id, c.pinned)}
                >
                  {c.pinned ? "📌" : "📍"}
                </button>
                <button
                  type="button"
                  className="ai-conv-action"
                  disabled={isBusy}
                  title="태그 편집"
                  onClick={() => (isEditing ? setEditingTagsFor(null) : startTagEdit(c))}
                >
                  🏷️
                </button>
                <button
                  type="button"
                  className="ai-conv-action"
                  disabled={isBusy}
                  title={c.archived_at ? "보관 해제" : "보관"}
                  onClick={() => handleArchive(c.id, !!c.archived_at)}
                >
                  🗄️
                </button>
              </div>

              {isEditing && (
                <div className="ai-conv-tag-edit">
                  <input
                    type="text"
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    placeholder="쉼표로 구분, 예: 공공, 마감임박"
                  />
                  <button
                    type="button"
                    className="btn btn-primary small"
                    disabled={isBusy}
                    onClick={() => saveTags(c.id)}
                  >
                    저장
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
