/**
 * Proposal API service — Phase 2 Sprint 2-3
 */
import { supabase } from "@/lib/supabase";
import type {
  AssembleResult,
  NeuroLevel,
  Proposal,
  ProposalSlide,
  ProposalSlideModule,
  ProposalStakeholder,
  ProposalStatus,
  ProposalTemplate,
  ProposalVersion,
  RecommendationResult,
  TargetPersona,
} from "@/types/proposal";

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

async function requestBinary(path: string, options?: RequestInit): Promise<Blob> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API Error ${res.status}`);
  }
  return res.blob();
}

/* Templates */

export async function listTemplates(orgId?: string): Promise<ProposalTemplate[]> {
  const p = new URLSearchParams();
  if (orgId) p.set("org_id", orgId);
  const qs = p.toString();
  return request(`/api/proposals/templates${qs ? `?${qs}` : ""}`);
}

export async function getTemplate(id: string): Promise<ProposalTemplate> {
  return request(`/api/proposals/templates/${id}`);
}

export async function createTemplate(payload: {
  organization_id?: string;
  code: string;
  name: string;
  description?: string;
  industry?: string;
  target_persona?: TargetPersona;
  neuro_level?: NeuroLevel;
  default_cover_title?: string;
  module_codes?: string[];
}): Promise<ProposalTemplate> {
  return request(`/api/proposals/templates`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/* Module catalog */

export async function listSlideModules(orgId?: string, phase?: string): Promise<ProposalSlideModule[]> {
  const p = new URLSearchParams();
  if (orgId) p.set("org_id", orgId);
  if (phase) p.set("phase", phase);
  const qs = p.toString();
  return request(`/api/proposals/modules${qs ? `?${qs}` : ""}`);
}

/* Proposals */

export interface ListProposalsParams {
  orgId: string;
  status?: ProposalStatus;
  q?: string;
}

export async function listProposals(params: ListProposalsParams): Promise<Proposal[]> {
  const p = new URLSearchParams({ org_id: params.orgId });
  if (params.status) p.set("status", params.status);
  if (params.q) p.set("q", params.q);
  return request(`/api/proposals?${p}`);
}

export async function getProposal(id: string): Promise<Proposal> {
  return request(`/api/proposals/${id}`);
}

export interface CreateProposalPayload {
  organization_id: string;
  template_id?: string;
  title: string;
  subtitle?: string;
  customer_name?: string;
  customer_company?: string;
  customer_segment?: string;
  customer_industry?: string;
  target_persona?: TargetPersona;
  neuro_level?: NeuroLevel;
  industry?: string;
  quote_id?: string;
  battle_card_ids?: string[];
  stakeholders?: ProposalStakeholder[];
  notes?: string;
  metadata?: Record<string, unknown>;
}

export async function createProposal(payload: CreateProposalPayload): Promise<Proposal> {
  return request(`/api/proposals`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface ProposalPatch {
  title?: string;
  subtitle?: string;
  customer_name?: string;
  customer_company?: string;
  customer_segment?: string;
  customer_industry?: string;
  target_persona?: TargetPersona;
  neuro_level?: NeuroLevel;
  industry?: string;
  quote_id?: string | null;
  battle_card_ids?: string[];
  stakeholders?: ProposalStakeholder[];
  status?: ProposalStatus;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export async function updateProposal(id: string, patch: ProposalPatch): Promise<Proposal> {
  return request(`/api/proposals/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteProposal(id: string): Promise<void> {
  await request(`/api/proposals/${id}`, { method: "DELETE" });
}

/* Slides */

export async function listSlides(proposalId: string): Promise<ProposalSlide[]> {
  return request(`/api/proposals/${proposalId}/slides`);
}

export interface SlidePatch {
  title?: string;
  subtitle?: string;
  body?: Record<string, unknown>;
  speaker_notes?: string;
  is_enabled?: boolean;
}

export async function patchSlide(
  proposalId: string,
  slideId: string,
  patch: SlidePatch,
): Promise<ProposalSlide> {
  return request(`/api/proposals/${proposalId}/slides/${slideId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function reorderSlides(
  proposalId: string,
  items: { id: string; sort_order: number }[],
): Promise<{ ok: boolean; count: number }> {
  return request(`/api/proposals/${proposalId}/slides/reorder`, {
    method: "PUT",
    body: JSON.stringify(items),
  });
}

/* Sprint 2-4: slide insert / duplicate / delete */

export interface SlideInsertPayload {
  module_code?: string;
  raw?: Record<string, unknown>;
  position?: number;
  title?: string;
  subtitle?: string;
  body?: Record<string, unknown>;
}

export async function insertSlide(
  proposalId: string,
  payload: SlideInsertPayload,
): Promise<ProposalSlide> {
  return request(`/api/proposals/${proposalId}/slides`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function duplicateSlide(
  proposalId: string,
  slideId: string,
): Promise<ProposalSlide> {
  return request(`/api/proposals/${proposalId}/slides/${slideId}/duplicate`, {
    method: "POST",
  });
}

export async function deleteSlide(
  proposalId: string,
  slideId: string,
): Promise<void> {
  await request(`/api/proposals/${proposalId}/slides/${slideId}`, {
    method: "DELETE",
  });
}

/* Assemble / Render */

export interface AssembleRequest {
  force_include_codes?: string[];
  force_exclude_codes?: string[];
  preserve_customizations?: boolean;
}

export async function assembleProposal(
  proposalId: string,
  options: AssembleRequest = {},
): Promise<{ result: AssembleResult; slides: ProposalSlide[] }> {
  return request(`/api/proposals/${proposalId}/assemble`, {
    method: "POST",
    body: JSON.stringify({
      force_include_codes: options.force_include_codes ?? [],
      force_exclude_codes: options.force_exclude_codes ?? [],
      preserve_customizations: options.preserve_customizations ?? true,
    }),
  });
}

export async function renderProposalPptx(proposalId: string): Promise<Blob> {
  return requestBinary(`/api/proposals/${proposalId}/render`, {
    method: "POST",
  });
}

export async function publishProposal(
  proposalId: string,
  newStatus: ProposalStatus = "in_review",
): Promise<Proposal> {
  const p = new URLSearchParams({ new_status: newStatus });
  return request(`/api/proposals/${proposalId}/publish?${p}`, { method: "POST" });
}

/* Versions */

export async function listVersions(proposalId: string): Promise<ProposalVersion[]> {
  return request(`/api/proposals/${proposalId}/versions`);
}

export async function snapshotVersion(
  proposalId: string,
  changeSummary?: string,
): Promise<ProposalVersion> {
  const p = new URLSearchParams();
  if (changeSummary) p.set("change_summary", changeSummary);
  const qs = p.toString();
  return request(`/api/proposals/${proposalId}/versions${qs ? `?${qs}` : ""}`, {
    method: "POST",
  });
}

/* Sprint 2-4: version restore */

export interface VersionRestoreResponse {
  ok: boolean;
  restored_from_version: number;
  slide_count: number;
  slides: ProposalSlide[];
}

export async function restoreVersion(
  proposalId: string,
  versionId: string,
  options: { snapshot_before_restore?: boolean; change_summary?: string } = {},
): Promise<VersionRestoreResponse> {
  return request(`/api/proposals/${proposalId}/versions/${versionId}/restore`, {
    method: "POST",
    body: JSON.stringify({
      snapshot_before_restore: options.snapshot_before_restore ?? true,
      change_summary: options.change_summary,
    }),
  });
}

/* Sprint 2-5: Claude API module recommendation */

export async function recommendModules(
  proposalId: string,
  options: { additional_notes?: string } = {},
): Promise<RecommendationResult> {
  return request(`/api/proposals/${proposalId}/recommend`, {
    method: "POST",
    body: JSON.stringify({ additional_notes: options.additional_notes ?? null }),
  });
}

/* Helper: download blob as file */

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
