/** Proposal 관련 타입 — Phase 2 Sprint 2-3 */

export type ProposalStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "sent"
  | "won"
  | "lost"
  | "archived";

export type TargetPersona =
  | "c_level"
  | "practitioner"
  | "overseas_partner"
  | "public_sector";

export type NeuroLevel = "minimal" | "standard" | "full";

export type SlidePhase =
  | "frame"
  | "tension"
  | "surprise"
  | "evidence"
  | "conviction";

export type NeuroDogma =
  | "prediction_error"
  | "precision_anchoring"
  | "narrative_structure"
  | "embodied_cognition"
  | "active_inference";

export interface ProposalTemplate {
  id: string;
  organization_id: string | null;
  code: string;
  name: string;
  description: string | null;
  industry: string | null;
  target_persona: TargetPersona;
  neuro_level: NeuroLevel;
  default_cover_title: string | null;
  default_theme: Record<string, unknown>;
  metadata: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  modules?: ProposalSlideModule[];
}

export interface ProposalSlideModule {
  id: string;
  organization_id: string | null;
  code: string;
  name: string;
  phase: SlidePhase;
  neuro_dogma: NeuroDogma | null;
  is_required: boolean;
  min_neuro_level: NeuroLevel;
  description: string | null;
  body_hint: string | null;
  placeholder_schema: Record<string, unknown>;
  default_body: Record<string, unknown>;
  source_deck: string | null;
  source_slide_no: number | null;
  sort_order: number;
  is_active: boolean;
}

export interface ProposalSlide {
  id: string;
  proposal_id: string;
  module_id: string | null;
  code: string;
  name: string;
  phase: SlidePhase;
  neuro_dogma: NeuroDogma | null;
  title: string | null;
  subtitle: string | null;
  body: Record<string, unknown>;
  speaker_notes: string | null;
  image_urls: string[];
  linked_quote_item_id: string | null;
  linked_battle_point_id: string | null;
  sort_order: number;
  is_enabled: boolean;
  is_customized: boolean;
  ai_generated: boolean;
  ai_model: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProposalStakeholder {
  name?: string;
  role?: string;
  interests?: string[];
}

export interface Proposal {
  id: string;
  organization_id: string;
  template_id: string | null;
  proposal_number: string | null;
  title: string;
  subtitle: string | null;
  customer_name: string | null;
  customer_company: string | null;
  customer_segment: string | null;
  customer_industry: string | null;
  stakeholders: ProposalStakeholder[];
  target_persona: TargetPersona;
  neuro_level: NeuroLevel;
  industry: string | null;
  quote_id: string | null;
  battle_card_ids: string[];
  status: ProposalStatus;
  current_version: number;
  last_pptx_url: string | null;
  last_pptx_size: number | null;
  last_rendered_at: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  slides?: ProposalSlide[];
  quote?: Record<string, unknown> | null;
  battle_cards?: Record<string, unknown>[];
}

export interface ProposalVersion {
  id: string;
  proposal_id: string;
  version_number: number;
  snapshot: Record<string, unknown>;
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AssembleResult {
  selection_stats: {
    total_selected: number;
    total_dropped: number;
    dogma_coverage: Record<string, number>;
    phase_distribution: Record<string, number>;
    neuro_level: string;
    target_persona: string;
    industry: string;
    industry_boost_dogma: string | null;
  };
  warnings: string[];
  slide_count: number;
  preserved_count: number;
}

/* Sprint 2-5: Claude API 추천 결과 */

export interface RecommendationAddition {
  code: string;
  phase: string;
  reason: string;
}

export interface RecommendationRemoval {
  code: string;
  reason: string;
}

export interface RecommendationEmphasis {
  code: string;
  suggestion: string;
}

export interface RecommendationResult {
  summary: string;
  model: string;
  additions: RecommendationAddition[];
  removals: RecommendationRemoval[];
  emphasis: RecommendationEmphasis[];
}

/* UI 상수 */

export const STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: "초안",
  in_review: "검토중",
  approved: "승인",
  sent: "발송",
  won: "수주",
  lost: "실주",
  archived: "아카이브",
};

export const STATUS_COLORS: Record<ProposalStatus, string> = {
  draft: "#6b7280",
  in_review: "#f59e0b",
  approved: "#0ea5e9",
  sent: "#8b5cf6",
  won: "#10b981",
  lost: "#ef4444",
  archived: "#9ca3af",
};

export const PERSONA_LABELS: Record<TargetPersona, string> = {
  c_level: "C레벨",
  practitioner: "실무자",
  overseas_partner: "해외 파트너",
  public_sector: "공공",
};

export const NEURO_LEVEL_LABELS: Record<NeuroLevel, string> = {
  minimal: "미니멀 (13장)",
  standard: "표준 (15장)",
  full: "풀 (18장)",
};

export const PHASE_LABELS: Record<SlidePhase, string> = {
  frame: "Phase 1 · 프레임",
  tension: "Phase 2 · 긴장",
  surprise: "Phase 3 · Surprise",
  evidence: "Phase 4 · 증명",
  conviction: "Phase 5 · 확신",
};

export const PHASE_COLORS: Record<SlidePhase, string> = {
  frame: "#204e8a",
  tension: "#b0501b",
  surprise: "#a01a58",
  evidence: "#1f6e4a",
  conviction: "#0f1f3d",
};

export const DOGMA_LABELS: Record<NeuroDogma, string> = {
  prediction_error: "예측 오류",
  precision_anchoring: "정밀 앵커링",
  narrative_structure: "내러티브",
  embodied_cognition: "체화 인지",
  active_inference: "능동 추론",
};
