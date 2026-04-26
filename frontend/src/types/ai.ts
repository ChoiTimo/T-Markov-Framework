/**
 * AI Assistant types — Phase 3 Sprint 3-1
 */

export type AssistantSurface =
  | "proposal_editor"
  | "quote"
  | "battlecard"
  | "dashboard"
  | "global";

export type AssistantTaskKind =
  | "chat"
  | "summarize"
  | "classify"
  | "plan"
  | "long_gen";

export type AssistantMessageRole = "user" | "assistant" | "tool" | "system";

export interface AssistantToolCall {
  tool_execution_id: string;
  tool_name: string;
  status: "pending" | "applied" | "rejected" | "failed";
  mutates_data: boolean;
  result: Record<string, unknown>;
}

export interface AssistantMessage {
  id: string;
  conversation_id: string;
  role: AssistantMessageRole;
  content: {
    text?: string;
    tool_calls?: AssistantToolCall[];
  };
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  parent_message_id: string | null;
  error_kind: string | null;
  error_detail: string | null;
  created_at: string;
}

export interface AssistantConversation {
  id: string;
  organization_id: string;
  user_id: string;
  surface: AssistantSurface;
  surface_ref_id: string | null;
  title: string | null;
  pinned: boolean;
  tags: string[];
  archived_at: string | null;
  message_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  created_at: string;
  updated_at: string;
}

export interface AssistantConversationDetail extends AssistantConversation {
  messages: AssistantMessage[];
  tool_executions: AssistantToolExecution[];
}

export interface AssistantToolExecution {
  id: string;
  conversation_id: string;
  organization_id: string;
  tool_name: string;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
  status: "pending" | "applied" | "rejected" | "failed";
  mutates_data: boolean;
  requested_by: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  rejection_reason: string | null;
  latency_ms: number | null;
  created_at: string;
}

export interface AssistantChatRequest {
  organization_id: string;
  surface: AssistantSurface;
  surface_ref_id?: string | null;
  conversation_id?: string | null;
  message: string;
  task_kind?: AssistantTaskKind;
}

export interface AssistantChatResponse {
  conversation_id: string;
  assistant_message_id: string;
  text: string;
  model: string;
  tool_calls: AssistantToolCall[];
  usage: { input_tokens: number; output_tokens: number };
}

export interface AssistantContext {
  surface: AssistantSurface;
  surfaceRefId: string | null;
  /** Free-text label that's displayed in the panel header */
  label?: string;
}
