/**
 * AI Assistant API service — Phase 3 Sprint 3-1
 */
import { supabase } from "@/lib/supabase";
import type {
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantConversation,
  AssistantConversationDetail,
  AssistantSurface,
} from "@/types/ai";

const API_URL = import.meta.env.VITE_API_URL as string;

async function authHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    ...(session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {}),
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API Error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function sendChat(
  body: AssistantChatRequest,
): Promise<AssistantChatResponse> {
  return request<AssistantChatResponse>("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listConversations(params: {
  organizationId: string;
  surface?: AssistantSurface;
  surfaceRefId?: string;
  includeArchived?: boolean;
}): Promise<AssistantConversation[]> {
  const q = new URLSearchParams({ organization_id: params.organizationId });
  if (params.surface) q.set("surface", params.surface);
  if (params.surfaceRefId) q.set("surface_ref_id", params.surfaceRefId);
  if (params.includeArchived) q.set("include_archived", "true");
  return request<AssistantConversation[]>(`/api/ai/conversations?${q}`);
}

export async function getConversationDetail(
  conversationId: string,
): Promise<AssistantConversationDetail> {
  return request<AssistantConversationDetail>(
    `/api/ai/conversations/${conversationId}`,
  );
}

export async function pinConversation(
  conversationId: string,
  pinned: boolean,
): Promise<void> {
  await request(`/api/ai/conversations/${conversationId}/pin`, {
    method: "POST",
    body: JSON.stringify({ pinned }),
  });
}

export async function setConversationTags(
  conversationId: string,
  tags: string[],
): Promise<void> {
  await request(`/api/ai/conversations/${conversationId}/tags`, {
    method: "POST",
    body: JSON.stringify({ tags }),
  });
}

export async function archiveConversation(
  conversationId: string,
  archived: boolean,
): Promise<void> {
  await request(`/api/ai/conversations/${conversationId}/archive`, {
    method: "POST",
    body: JSON.stringify({ archived }),
  });
}

export async function confirmTool(
  toolExecutionId: string,
  options?: { rejected?: boolean; rejectionReason?: string },
): Promise<{ status: string; result?: Record<string, unknown> }> {
  return request(`/api/ai/confirm/${toolExecutionId}`, {
    method: "POST",
    body: JSON.stringify({
      rejected: options?.rejected ?? false,
      rejection_reason: options?.rejectionReason,
    }),
  });
}
