/** Battle Card 관련 타입 — Phase 2 Sprint 2-2 */

export type PointType =
  | "strength"
  | "weakness"
  | "differentiator"
  | "counter"
  | "question"
  | "insight";

export type BattleCardStatus = "draft" | "published" | "archived";
export type RefType = "news" | "case" | "research" | "video" | "other";

export interface Competitor {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  website: string | null;
  category: string | null;
  threat_level: number; // 1-5
  summary: string | null;
  target_segments: string[];
  market_share: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BattlePoint {
  id: string;
  battle_card_id: string;
  type: PointType;
  title: string;
  detail: string | null;
  evidence_url: string | null;
  priority: number;
  sort_order: number;
  ai_generated: boolean;
  ai_model: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BattleReference {
  id: string;
  battle_card_id: string;
  source_type: RefType;
  title: string;
  url: string | null;
  summary: string | null;
  published_at: string | null;
  created_at: string;
}

export interface BattleCard {
  id: string;
  organization_id: string;
  competitor_id: string;
  title: string;
  subtitle: string | null;
  overview: string | null;
  key_insight: string | null;
  status: BattleCardStatus;
  owner_user_id: string | null;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  competitor?: Competitor | null;
  points?: BattlePoint[];
  references?: BattleReference[];
}

export const POINT_TYPE_LABELS: Record<PointType, string> = {
  strength: "강점",
  weakness: "약점",
  differentiator: "차별화",
  counter: "대응전략",
  question: "Q&A",
  insight: "인사이트",
};

export const POINT_TYPE_COLORS: Record<PointType, string> = {
  strength: "#dc2626", // 경쟁사 강점 = 위협 → 빨강
  weakness: "#059669", // 경쟁사 약점 = 기회 → 초록
  differentiator: "#ff6b00", // 우리 차별화 → 브랜드 주황
  counter: "#1d4ed8", // 대응 전략 → 파랑
  question: "#7c3aed", // Q&A → 보라
  insight: "#525252", // 인사이트 → 회색
};

export const POINT_TYPE_ORDER: PointType[] = [
  "differentiator",
  "weakness",
  "strength",
  "counter",
  "question",
  "insight",
];

export const STATUS_LABELS: Record<BattleCardStatus, string> = {
  draft: "초안",
  published: "공개",
  archived: "아카이브",
};
