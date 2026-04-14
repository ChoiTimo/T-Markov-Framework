/**
 * Battle Card API service — Phase 2 Sprint 2-2
 */
import { supabase } from "@/lib/supabase";
import type {
  BattleCard,
  BattlePoint,
  BattleReference,
  Competitor,
  PointType,
  RefType,
} from "@/types/battlecard";

const API_URL = import.meta.env.VITE_API_URL as string;

async function authHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    "Content-Type": "application/json",
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}${path}`, { ...options, headers: { ...headers, ...(options?.headers ?? {}) } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API Error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/* Competitors */
export async function listCompetitors(orgId: string, category?: string, q?: string): Promise<Competitor[]> {
  const p = new URLSearchParams({ org_id: orgId });
  if (category) p.set("category", category);
  if (q) p.set("q", q);
  return request(`/api/battlecards/competitors?${p}`);
}

export async function createCompetitor(payload: Partial<Competitor> & { organization_id: string; name: string }): Promise<Competitor> {
  return request(`/api/battlecards/competitors`, { method: "POST", body: JSON.stringify(payload) });
}

export async function updateCompetitor(id: string, patch: Partial<Competitor>): Promise<Competitor> {
  return request(`/api/battlecards/competitors/${id}`, { method: "PUT", body: JSON.stringify(patch) });
}

export async function deleteCompetitor(id: string): Promise<void> {
  await request(`/api/battlecards/competitors/${id}`, { method: "DELETE" });
}

/* Battle Cards */
export interface ListCardsParams {
  orgId: string;
  status?: string;
  category?: string;
  threat_min?: number;
  q?: string;
}

export async function listCards(params: ListCardsParams): Promise<BattleCard[]> {
  const p = new URLSearchParams({ org_id: params.orgId });
  if (params.status) p.set("status", params.status);
  if (params.category) p.set("category", params.category);
  if (params.threat_min) p.set("threat_min", String(params.threat_min));
  if (params.q) p.set("q", params.q);
  return request(`/api/battlecards?${p}`);
}

export async function getCard(id: string): Promise<BattleCard> {
  return request(`/api/battlecards/${id}`);
}

export interface CardCreatePayload {
  organization_id: string;
  competitor_id?: string;
  competitor?: Partial<Competitor> & { organization_id: string; name: string };
  title: string;
  subtitle?: string;
  overview?: string;
  key_insight?: string;
  initial_points?: Array<Partial<BattlePoint> & { type: PointType; title: string }>;
}

export async function createCard(payload: CardCreatePayload): Promise<BattleCard> {
  return request(`/api/battlecards`, { method: "POST", body: JSON.stringify(payload) });
}

export async function updateCard(id: string, patch: Partial<BattleCard>): Promise<BattleCard> {
  return request(`/api/battlecards/${id}`, { method: "PUT", body: JSON.stringify(patch) });
}

export async function deleteCard(id: string): Promise<void> {
  await request(`/api/battlecards/${id}`, { method: "DELETE" });
}

export async function publishCard(id: string): Promise<BattleCard> {
  return request(`/api/battlecards/${id}/publish`, { method: "POST" });
}

export async function archiveCard(id: string): Promise<BattleCard> {
  return request(`/api/battlecards/${id}/archive`, { method: "POST" });
}

/* Points */
export interface PointCreatePayload {
  type: PointType;
  title: string;
  detail?: string;
  evidence_url?: string;
  priority?: number;
  sort_order?: number;
}

export async function addPoint(cardId: string, payload: PointCreatePayload): Promise<BattlePoint> {
  return request(`/api/battlecards/${cardId}/points`, { method: "POST", body: JSON.stringify(payload) });
}

export async function patchPoint(cardId: string, pointId: string, patch: Partial<BattlePoint>): Promise<BattlePoint> {
  return request(`/api/battlecards/${cardId}/points/${pointId}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function deletePoint(cardId: string, pointId: string): Promise<void> {
  await request(`/api/battlecards/${cardId}/points/${pointId}`, { method: "DELETE" });
}

export async function reorderPoints(cardId: string, items: Array<{ id: string; sort_order: number }>): Promise<{ updated: number }> {
  return request(`/api/battlecards/${cardId}/points/reorder`, { method: "PUT", body: JSON.stringify(items) });
}

/* References */
export async function addReference(
  cardId: string,
  payload: { source_type?: RefType; title: string; url?: string; summary?: string; published_at?: string }
): Promise<BattleReference> {
  return request(`/api/battlecards/${cardId}/references`, { method: "POST", body: JSON.stringify(payload) });
}

export async function deleteReference(cardId: string, refId: string): Promise<void> {
  await request(`/api/battlecards/${cardId}/references/${refId}`, { method: "DELETE" });
}

/* AI (Phase 3 stub) */
export async function aiSuggest(cardId: string): Promise<{ status: string; message: string }> {
  return request(`/api/battlecards/${cardId}/ai-suggest`, { method: "POST" });
}
