/**
 * AssistantPanel — Phase 3 Sprint 3-1 메인 도킹 패널.
 *
 * 사용법:
 *   <AssistantPanel surface="proposal_editor" surfaceRefId={proposalId} />
 *
 * 화면 우측 가장자리에 40px 트리거를 두고, 펼치면 360px 폭의 대화 패널이 슬라이드한다.
 * 패널 내부는 (헤더 / 대화 히스토리 토글 / 메시지 스레드 / 작성기) 구성.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOrg } from "@/contexts/OrgContext";
import {
  getConversationDetail,
  listConversations,
  sendChat,
} from "@/services/ai";
import type {
  AssistantConversation,
  AssistantMessage,
  AssistantSurface,
} from "@/types/ai";
import AssistantComposer from "./AssistantComposer";
import AssistantConversationList from "./AssistantConversationList";
import AssistantThread from "./AssistantThread";
import "./AssistantPanel.css";

interface Props {
  surface: AssistantSurface;
  surfaceRefId?: string | null;
  /** Surface label (제안서 제목 등) — 헤더에 표시 */
  contextLabel?: string;
  /** 추천 프롬프트 칩 */
  suggestions?: string[];
}

export default function AssistantPanel({
  surface,
  surfaceRefId = null,
  contextLabel,
  suggestions,
}: Props) {
  const { currentOrg } = useOrg();
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [convLoading, setConvLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orgId = currentOrg?.id ?? null;

  const defaultSuggestions = useMemo<string[]>(() => {
    if (suggestions && suggestions.length > 0) return suggestions;
    if (surface === "proposal_editor") {
      return [
        "이 고객에게 어떤 접근 전략이 좋을까?",
        "현재 슬라이드 구성에서 빠진 핵심 모듈은?",
        "경쟁사 비교 슬라이드를 강화한다면?",
      ];
    }
    if (surface === "quote") {
      return ["마진이 낮은 라인 아이템 짚어줘", "총액 절감 옵션 제안"];
    }
    if (surface === "battlecard") {
      return ["최신 경쟁사 동향 반영해줘", "약점 보완 포인트 제안"];
    }
    return ["오늘 우선순위 정리해줘"];
  }, [surface, suggestions]);

  // 패널 열릴 때 history 로드
  useEffect(() => {
    if (!open || !orgId) return;
    setConvLoading(true);
    listConversations({
      organizationId: orgId,
      surface,
      surfaceRefId: surfaceRefId ?? undefined,
    })
      .then(setConversations)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "대화 목록 로드 실패"),
      )
      .finally(() => setConvLoading(false));
  }, [open, orgId, surface, surfaceRefId]);

  const selectConversation = useCallback(
    async (conv: AssistantConversation) => {
      try {
        const detail = await getConversationDetail(conv.id);
        setConversationId(detail.id);
        setMessages(detail.messages);
        setShowHistory(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "대화 로드 실패");
      }
    },
    [],
  );

  const startNew = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setShowHistory(false);
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (!orgId) {
        setError("조직이 선택되어 있지 않습니다.");
        return;
      }
      setSending(true);
      setError(null);

      // optimistic user 메시지
      const optimistic: AssistantMessage = {
        id: `optimistic-${Date.now()}`,
        conversation_id: conversationId ?? "pending",
        role: "user",
        content: { text },
        model: null,
        input_tokens: 0,
        output_tokens: 0,
        parent_message_id: null,
        error_kind: null,
        error_detail: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);

      try {
        const res = await sendChat({
          organization_id: orgId,
          surface,
          surface_ref_id: surfaceRefId ?? null,
          conversation_id: conversationId ?? null,
          message: text,
        });
        setConversationId(res.conversation_id);
        // 응답 후 detail 재조회로 권위 있는 메시지 트리 갱신
        const detail = await getConversationDetail(res.conversation_id);
        setMessages(detail.messages);
      } catch (e) {
        setError(e instanceof Error ? e.message : "전송 실패");
      } finally {
        setSending(false);
      }
    },
    [orgId, conversationId, surface, surfaceRefId],
  );

  if (!orgId) return null; // 조직이 선택되지 않으면 패널 숨김

  return (
    <>
      {!open && (
        <button
          className="ai-edge-trigger"
          aria-label="AI 어시스턴트 열기"
          onClick={() => setOpen(true)}
          title="AI 어시스턴트"
        >
          AI
        </button>
      )}
      {open && (
        <aside className="ai-panel" aria-label="AI 어시스턴트 패널">
          <header className="ai-panel-head">
            <div>
              <strong>AI 어시스턴트</strong>
              {contextLabel && <div className="muted small">{contextLabel}</div>}
            </div>
            <div className="ai-panel-actions">
              <button
                type="button"
                className="btn btn-ghost small"
                onClick={() => setShowHistory((v) => !v)}
              >
                {showHistory ? "닫기" : "히스토리"}
              </button>
              <button
                type="button"
                className="btn btn-ghost small"
                onClick={() => setOpen(false)}
                aria-label="패널 닫기"
              >
                ✕
              </button>
            </div>
          </header>

          {showHistory ? (
            <AssistantConversationList
              items={conversations}
              activeId={conversationId}
              loading={convLoading}
              onSelect={selectConversation}
              onNew={startNew}
            />
          ) : (
            <AssistantThread messages={messages} loading={sending} />
          )}

          {error && <div className="ai-panel-error">{error}</div>}

          {!showHistory && (
            <AssistantComposer
              disabled={sending}
              suggestions={defaultSuggestions}
              onSend={send}
            />
          )}
        </aside>
      )}
    </>
  );
}
