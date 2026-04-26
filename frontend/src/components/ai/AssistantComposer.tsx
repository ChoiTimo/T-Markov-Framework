/**
 * AssistantComposer — 입력창 + 제안 프롬프트 칩.
 */
import { useState, type FormEvent, type KeyboardEvent } from "react";

interface Props {
  disabled?: boolean;
  suggestions?: string[];
  onSend: (text: string) => Promise<void> | void;
}

export default function AssistantComposer({
  disabled,
  suggestions = [],
  onSend,
}: Props) {
  const [text, setText] = useState("");

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    setText("");
    await onSend(trimmed);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <form className="ai-composer" onSubmit={onSubmit}>
      {suggestions.length > 0 && (
        <div className="ai-suggestions">
          {suggestions.map((s) => (
            <button
              type="button"
              key={s}
              className="ai-chip"
              disabled={disabled}
              onClick={() => setText(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="ai-composer-row">
        <textarea
          className="ai-composer-input"
          placeholder="질문을 입력하세요. Enter 전송, Shift+Enter 줄바꿈."
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
        />
        <button
          type="submit"
          className="btn btn-primary small"
          disabled={disabled || !text.trim()}
        >
          전송
        </button>
      </div>
    </form>
  );
}
