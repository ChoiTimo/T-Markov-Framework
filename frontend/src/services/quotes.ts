/**
 * 견적 API 서비스 — Phase 2 Sprint 2-1
 */
import { supabase } from "@/lib/supabase";
import type {
  ContractRule,
  Module,
  PricingMatrix,
  Quote,
  QuoteItem,
  QuoteVersionListItem,
} from "@/types/quote";

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

/* ── Quotes CRUD ──────────────────────────────── */

export async function listQuotes(orgId: string, status?: string): Promise<Quote[]> {
  const q = new URLSearchParams({ org_id: orgId });
  if (status) q.set("status", status);
  return request<Quote[]>(`/api/quotes?${q.toString()}`);
}

export async function getQuote(quoteId: string): Promise<Quote> {
  return request<Quote>(`/api/quotes/${quoteId}`);
}

export interface QuoteCreatePayload {
  organization_id: string;
  title: string;
  customer_name?: string | null;
  customer_contact?: string | null;
  customer_company?: string | null;
  service_type?: string | null;
  contract_months?: number;
  contract_rule_id?: string | null;
  tax_rate?: number;
  valid_until?: string | null;
  notes?: string | null;
  exceptions_note?: string | null;
  items?: QuoteItem[];
  metadata?: Record<string, unknown>;
}

export async function createQuote(payload: QuoteCreatePayload): Promise<Quote> {
  return request<Quote>(`/api/quotes`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface QuoteUpdatePayload extends Partial<QuoteCreatePayload> {
  status?: string;
  change_summary?: string;
}

export async function updateQuote(
  quoteId: string,
  payload: QuoteUpdatePayload
): Promise<Quote> {
  return request<Quote>(`/api/quotes/${quoteId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteQuote(quoteId: string): Promise<void> {
  await request<void>(`/api/quotes/${quoteId}`, { method: "DELETE" });
}

export async function duplicateQuote(quoteId: string): Promise<Quote> {
  return request<Quote>(`/api/quotes/${quoteId}/duplicate`, { method: "POST" });
}

export async function recalcQuote(quoteId: string): Promise<Quote> {
  return request<Quote>(`/api/quotes/${quoteId}/recalc`, { method: "POST" });
}

/* ── Versions ─────────────────────────────────── */

export async function listVersions(quoteId: string): Promise<QuoteVersionListItem[]> {
  return request<QuoteVersionListItem[]>(`/api/quotes/${quoteId}/versions`);
}

export async function saveVersion(
  quoteId: string,
  changeSummary?: string
): Promise<{ version_number: number }> {
  const q = new URLSearchParams();
  if (changeSummary) q.set("change_summary", changeSummary);
  return request(`/api/quotes/${quoteId}/versions?${q.toString()}`, {
    method: "POST",
  });
}

/* ── PDF ──────────────────────────────────────── */

export async function downloadQuotePdf(quoteId: string, filename?: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/api/quotes/${quoteId}/pdf`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `PDF Error ${res.status}`);
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `quote-${quoteId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

/* ── Catalog ──────────────────────────────────── */

export async function listModules(orgId: string, category?: string): Promise<Module[]> {
  const q = new URLSearchParams({ org_id: orgId });
  if (category) q.set("category", category);
  return request<Module[]>(`/api/quotes/catalog/modules?${q.toString()}`);
}

export async function listPricing(moduleId: string): Promise<PricingMatrix[]> {
  const q = new URLSearchParams({ module_id: moduleId });
  return request<PricingMatrix[]>(`/api/quotes/catalog/pricing?${q.toString()}`);
}

export async function listContractRules(orgId?: string): Promise<ContractRule[]> {
  const q = new URLSearchParams();
  if (orgId) q.set("org_id", orgId);
  return request<ContractRule[]>(`/api/quotes/catalog/contracts?${q.toString()}`);
}

/* ── Helpers (client-side preview calc) ───────── */

export function calcLineTotal(quantity: number, unitPrice: number): number {
  return Math.round(Number(quantity || 0) * Number(unitPrice || 0));
}

export function calcClientTotals(
  items: QuoteItem[],
  multiplier: number,
  taxRate: number
): {
  subtotal: number;
  adjustment: number;
  preTax: number;
  tax: number;
  total: number;
} {
  const subtotal = items.reduce(
    (sum, it) => sum + calcLineTotal(Number(it.quantity || 0), Number(it.unit_price || 0)),
    0
  );
  const adjustment = Math.round(subtotal * (Number(multiplier) - 1));
  const preTax = subtotal + adjustment;
  const tax = Math.round(preTax * Number(taxRate));
  return { subtotal, adjustment, preTax, tax, total: preTax + tax };
}

export function formatKRW(n: number | null | undefined): string {
  const v = Number(n || 0);
  return `₩${Math.round(v).toLocaleString("ko-KR")}`;
}
