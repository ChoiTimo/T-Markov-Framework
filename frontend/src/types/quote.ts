/**
 * 견적 관련 타입 정의 — Phase 2 Sprint 2-1
 */

export type QuoteStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "sent"
  | "accepted"
  | "rejected"
  | "expired"
  | "archived";

export type ServiceType = "premium" | "standard" | "combo";

export interface QuoteItem {
  id?: string;
  quote_id?: string;
  module_id?: string | null;
  item_name: string;
  item_description?: string | null;
  category?: string | null;
  service_tier?: string | null;
  region_code?: string | null;
  region_name?: string | null;
  bandwidth_mbps?: number | null;
  quantity: number;
  unit?: string;
  unit_price: number;
  line_total?: number;
  is_hub?: boolean;
  sort_order?: number;
  metadata?: Record<string, unknown>;
}

export interface Quote {
  id: string;
  organization_id: string;
  quote_number: string | null;
  title: string;
  customer_name: string | null;
  customer_contact: string | null;
  customer_company: string | null;
  service_type: ServiceType | null;
  contract_months: number;
  contract_rule_id: string | null;
  status: QuoteStatus;
  currency: string;
  subtotal: number;
  adjustment_amount: number;
  tax_rate: number;
  tax_amount: number;
  total_amount: number;
  monthly_amount: number;
  valid_until: string | null;
  notes: string | null;
  exceptions_note: string | null;
  metadata: Record<string, unknown>;
  current_version: number;
  created_at: string;
  updated_at: string;
  items?: QuoteItem[];
  contract_rule?: ContractRule | null;
}

export interface ContractRule {
  id: string;
  organization_id: string | null;
  rule_type: string;
  label: string;
  contract_months: number | null;
  multiplier: number;
  display_hint: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface Module {
  id: string;
  organization_id: string | null;
  code: string;
  name: string;
  category: string;
  service_tier: string | null;
  scope: string | null;
  description: string | null;
  unit: string;
  base_price: number | null;
  currency: string;
  pricing_type: "matrix" | "flat" | "custom";
  metadata: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
}

export interface PricingMatrix {
  id: string;
  module_id: string;
  region_code: string;
  region_name: string;
  bandwidth_mbps: number;
  monthly_price: number;
  currency: string;
}

export interface QuoteVersionListItem {
  id: string;
  version_number: number;
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
}
