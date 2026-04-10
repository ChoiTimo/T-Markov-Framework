/**
 * API 서비스 — Backend REST API 호출 래퍼.
 * Supabase Auth JWT를 Authorization 헤더에 자동 포함.
 */
import { supabase } from "@/lib/supabase";
import type {
  Organization,
  Profile,
  OrgMember,
  AuditLog,
  OrgRole,
} from "@/types";

const API_URL = import.meta.env.VITE_API_URL as string;

async function getAuthHeaders(): Promise<HeadersInit> {
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

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API Error ${res.status}`);
  }
  return res.json();
}

/* ── Auth / Profile ─────────────────────────── */

export async function getMyProfile(): Promise<Profile> {
  return request<Profile>("/api/auth/me");
}

export async function updateMyProfile(
  data: Partial<Pick<Profile, "full_name" | "phone" | "department" | "job_title">>
): Promise<Profile> {
  return request<Profile>("/api/auth/me", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/* ── Organizations ──────────────────────────── */

export async function listOrganizations(): Promise<
  (Organization & { role: OrgRole })[]
> {
  return request("/api/orgs");
}

export async function createOrganization(data: {
  name: string;
  slug: string;
}): Promise<Organization> {
  return request<Organization>("/api/orgs", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getOrganization(
  orgId: string
): Promise<Organization> {
  return request<Organization>(`/api/orgs/${orgId}`);
}

export async function updateOrganization(
  orgId: string,
  data: Partial<Pick<Organization, "name" | "logo_url" | "settings">>
): Promise<Organization> {
  return request<Organization>(`/api/orgs/${orgId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/* ── Members ────────────────────────────────── */

export async function listMembers(orgId: string): Promise<OrgMember[]> {
  return request<OrgMember[]>(`/api/orgs/${orgId}/members`);
}

export async function inviteMember(
  orgId: string,
  email: string,
  role: OrgRole = "member"
): Promise<OrgMember> {
  return request<OrgMember>(`/api/orgs/${orgId}/members`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}

export async function updateMemberRole(
  orgId: string,
  userId: string,
  role: OrgRole
): Promise<OrgMember> {
  return request<OrgMember>(`/api/orgs/${orgId}/members/${userId}`, {
    method: "PUT",
    body: JSON.stringify({ role }),
  });
}

export async function removeMember(
  orgId: string,
  userId: string
): Promise<void> {
  await request(`/api/orgs/${orgId}/members/${userId}`, {
    method: "DELETE",
  });
}

/* ── Audit Logs ─────────────────────────────── */

export async function listAuditLogs(
  orgId: string,
  params?: { limit?: number; offset?: number }
): Promise<AuditLog[]> {
  const q = new URLSearchParams();
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  const qs = q.toString() ? `?${q.toString()}` : "";
  return request<AuditLog[]>(`/api/orgs/${orgId}/audit-logs${qs}`);
}
