-- ============================================================
-- SmartWAN Platform — Phase 2 Sprint 2-3
-- Proposal Generator Schema
-- (tmarkov-app 흡수: module_selector + pptx_assembler + neuro_optimizer)
-- ============================================================

-- ============================================================
-- 1. proposal_templates — 제안서 템플릿 마스터
--    (T-Markov Standard, SASE-focused, Premium WAN 등)
-- ============================================================
create table public.proposal_templates (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid references public.organizations(id) on delete cascade,
  code            text not null,                   -- 'tmarkov-standard' | 'sase-focus' | 'premium-wan'
  name            text not null,                   -- 'T-Markov 표준 제안서'
  description     text,
  industry        text,                            -- 'semiconductor' | 'manufacturing' | 'finance' | 'public' | 'general'
  target_persona  text default 'c_level',          -- 'c_level' | 'practitioner' | 'overseas_partner' | 'public_sector'
  neuro_level     text default 'standard',         -- 'full' (18장) | 'standard' (15장) | 'minimal' (13장)
  default_cover_title text,
  default_theme   jsonb default '{}'::jsonb,       -- 색상, 폰트 등
  metadata        jsonb default '{}'::jsonb,
  is_active       boolean not null default true,
  sort_order      int default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique(organization_id, code)
);

comment on table public.proposal_templates is '제안서 템플릿 (업종×타겟×뉴로레벨 조합)';

create index idx_pt_org on public.proposal_templates(organization_id, is_active);
create index idx_pt_industry on public.proposal_templates(industry);

create trigger trg_pt_updated
  before update on public.proposal_templates
  for each row execute function public.update_updated_at();

-- ============================================================
-- 2. proposal_slide_modules — 슬라이드 모듈 카탈로그
--    (P1 Cover / P2 Narrative / P3 Problem / ... 등 각 슬라이드의 '부품')
--    뇌과학 5대 도그마(Prediction Error, Precision Anchoring,
--    Narrative Structure, Embodied Cognition, Active Inference) 매핑
-- ============================================================
create type public.slide_phase as enum (
  'frame',       -- 1단계: 프레임 설치 (Cover, Agenda, Context)
  'tension',     -- 2단계: 긴장 조성 (Problem, Competitive Threat)
  'surprise',    -- 3단계: Surprise + Solution (Prediction Error 활용)
  'evidence',    -- 4단계: 기술 증명 (Arch, Demo, Performance)
  'conviction'   -- 5단계: 확신 강화 (ROI, Roadmap, Next Step)
);

create type public.neuro_dogma as enum (
  'prediction_error',
  'precision_anchoring',
  'narrative_structure',
  'embodied_cognition',
  'active_inference'
);

create table public.proposal_slide_modules (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid references public.organizations(id) on delete cascade,
  code            text not null,                   -- 'P1_cover' | 'N1_narrative' | 'P5_surprise' | ...
  name            text not null,                   -- 'Cover Slide' | 'One-slide Narrative'
  phase           public.slide_phase not null,
  neuro_dogma     public.neuro_dogma,              -- null = 중립 슬라이드
  is_required     boolean not null default false,  -- 해당 레벨에서 필수 여부
  min_neuro_level text default 'minimal',          -- 'minimal' | 'standard' | 'full' 이상에서 포함
  description     text,
  body_hint       text,                            -- 슬라이드 구성 가이드 (Claude 힌트용)
  placeholder_schema jsonb default '{}'::jsonb,    -- {title, subtitle, bullets[], image_url, ...}
  default_body    jsonb default '{}'::jsonb,       -- 기본 텍스트 (커스터마이즈 없이도 사용 가능)
  source_deck     text,                            -- 'core' | 'neuro' (내부 관리용)
  source_slide_no int,                             -- 원본 덱 슬라이드 번호 (참조)
  sort_order      int default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique(organization_id, code)
);

comment on table public.proposal_slide_modules is '제안서 슬라이드 모듈 카탈로그 (Phase × Neuro-Dogma 매핑)';

create index idx_psm_org on public.proposal_slide_modules(organization_id, is_active);
create index idx_psm_phase on public.proposal_slide_modules(phase, sort_order);
create index idx_psm_dogma on public.proposal_slide_modules(neuro_dogma) where neuro_dogma is not null;

create trigger trg_psm_updated
  before update on public.proposal_slide_modules
  for each row execute function public.update_updated_at();

-- ============================================================
-- 3. proposal_template_modules — 템플릿 ↔ 모듈 매핑 (다대다)
-- ============================================================
create table public.proposal_template_modules (
  id              uuid primary key default uuid_generate_v4(),
  template_id     uuid not null references public.proposal_templates(id) on delete cascade,
  module_id       uuid not null references public.proposal_slide_modules(id) on delete cascade,
  sort_order      int not null default 0,
  is_required     boolean not null default true,
  override_title  text,
  created_at      timestamptz not null default now(),

  unique(template_id, module_id)
);

create index idx_ptm_template on public.proposal_template_modules(template_id, sort_order);

-- ============================================================
-- 4. proposals — 제안서 본체
-- ============================================================
create type public.proposal_status as enum (
  'draft', 'in_review', 'approved', 'sent', 'won', 'lost', 'archived'
);

create table public.proposals (
  id                uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  template_id       uuid references public.proposal_templates(id) on delete set null,
  proposal_number   text,                          -- 'P-2026-0001'
  title             text not null,
  subtitle          text,

  -- 고객/딜 정보
  customer_name     text,
  customer_company  text,
  customer_segment  text,                          -- 'enterprise' | 'midmarket' | 'public' | 'global'
  customer_industry text,
  stakeholders      jsonb default '[]'::jsonb,     -- [{name, role, interests[]}]

  -- 뇌과학/스타일 파라미터
  target_persona    text not null default 'c_level',
  neuro_level       text not null default 'standard',
  industry          text,

  -- 연결
  quote_id          uuid references public.quotes(id) on delete set null,
  battle_card_ids   uuid[] default '{}',           -- 여러 경쟁사 참조 가능

  -- 상태 관리
  status            public.proposal_status not null default 'draft',
  current_version   int not null default 1,

  -- 출력물 캐시
  last_pptx_url     text,                          -- Supabase Storage/presigned URL
  last_pptx_size    bigint,
  last_rendered_at  timestamptz,

  -- 기타
  notes             text,
  metadata          jsonb default '{}'::jsonb,

  created_by        uuid references auth.users(id) on delete set null,
  updated_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.proposals is '제안서 본체 (quote/battlecard 연결, 뇌과학 파라미터 포함)';

create index idx_proposals_org on public.proposals(organization_id, updated_at desc);
create index idx_proposals_status on public.proposals(organization_id, status);
create index idx_proposals_quote on public.proposals(quote_id) where quote_id is not null;
create unique index idx_proposals_number on public.proposals(organization_id, proposal_number) where proposal_number is not null;

create trigger trg_proposals_updated
  before update on public.proposals
  for each row execute function public.update_updated_at();

-- ============================================================
-- 5. proposal_slides — 제안서별 슬라이드 인스턴스
--    (모듈 선택 + 커스텀 텍스트/이미지 + 정렬)
-- ============================================================
create table public.proposal_slides (
  id              uuid primary key default uuid_generate_v4(),
  proposal_id     uuid not null references public.proposals(id) on delete cascade,
  module_id       uuid references public.proposal_slide_modules(id) on delete set null,

  -- 스냅샷 (모듈 변경에도 제안서는 당시 값 유지)
  code            text not null,
  name            text not null,
  phase           public.slide_phase not null,
  neuro_dogma     public.neuro_dogma,

  -- 콘텐츠
  title           text,
  subtitle        text,
  body            jsonb default '{}'::jsonb,       -- 템플릿 placeholder_schema를 따른 실제 값
  speaker_notes   text,
  image_urls      text[] default '{}',

  -- 소스 연결
  linked_quote_item_id    uuid references public.quote_items(id) on delete set null,
  linked_battle_point_id  uuid references public.battle_points(id) on delete set null,

  -- 정렬/상태
  sort_order      int not null default 0,
  is_enabled      boolean not null default true,
  is_customized   boolean not null default false,  -- 기본값 변경 여부
  ai_generated    boolean not null default false,
  ai_model        text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.proposal_slides is '제안서 내 슬라이드 인스턴스 (모듈 스냅샷 + 커스텀)';

create index idx_ps_proposal on public.proposal_slides(proposal_id, sort_order);
create index idx_ps_module on public.proposal_slides(module_id);

create trigger trg_ps_updated
  before update on public.proposal_slides
  for each row execute function public.update_updated_at();

-- ============================================================
-- 6. proposal_versions — 제안서 버전 스냅샷
-- ============================================================
create table public.proposal_versions (
  id              uuid primary key default uuid_generate_v4(),
  proposal_id     uuid not null references public.proposals(id) on delete cascade,
  version_number  int not null,
  snapshot        jsonb not null,                  -- 제안서 + 슬라이드 전체 스냅샷
  pptx_url        text,                            -- 이 버전 당시 렌더링된 PPTX URL
  change_summary  text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),

  unique(proposal_id, version_number)
);

comment on table public.proposal_versions is '제안서 변경 이력 (되돌리기/비교용)';

create index idx_pv_proposal on public.proposal_versions(proposal_id, version_number desc);

-- ============================================================
-- 7. RLS Policies
-- ============================================================

-- proposal_templates: 전역 + 조직 멤버 읽기, admin 쓰기
alter table public.proposal_templates enable row level security;

create policy "pt_select_members"
  on public.proposal_templates for select
  using (
    organization_id is null
    or organization_id in (
      select organization_id from public.org_members where user_id = auth.uid()
    )
  );

create policy "pt_write_admin"
  on public.proposal_templates for all
  using (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- proposal_slide_modules: 전역 + 조직 멤버 읽기, admin 쓰기
alter table public.proposal_slide_modules enable row level security;

create policy "psm_select_members"
  on public.proposal_slide_modules for select
  using (
    organization_id is null
    or organization_id in (
      select organization_id from public.org_members where user_id = auth.uid()
    )
  );

create policy "psm_write_admin"
  on public.proposal_slide_modules for all
  using (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- proposal_template_modules: 템플릿 권한 계승
alter table public.proposal_template_modules enable row level security;

create policy "ptm_all_via_template"
  on public.proposal_template_modules for all
  using (
    template_id in (
      select id from public.proposal_templates
      where organization_id is null
         or organization_id in (
           select organization_id from public.org_members where user_id = auth.uid()
         )
    )
  );

-- proposals: 조직 멤버 전체 접근, admin 이상 삭제
alter table public.proposals enable row level security;

create policy "proposals_select_members"
  on public.proposals for select
  using (
    organization_id in (
      select organization_id from public.org_members where user_id = auth.uid()
    )
  );

create policy "proposals_insert_members"
  on public.proposals for insert
  with check (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'member')
    )
  );

create policy "proposals_update_members"
  on public.proposals for update
  using (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'member')
    )
  );

create policy "proposals_delete_admin"
  on public.proposals for delete
  using (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- proposal_slides: 제안서 권한 계승
alter table public.proposal_slides enable row level security;

create policy "ps_all_via_proposal"
  on public.proposal_slides for all
  using (
    proposal_id in (
      select id from public.proposals
      where organization_id in (
        select organization_id from public.org_members where user_id = auth.uid()
      )
    )
  );

-- proposal_versions: 제안서 권한 계승 (읽기 전용)
alter table public.proposal_versions enable row level security;

create policy "pv_select_via_proposal"
  on public.proposal_versions for select
  using (
    proposal_id in (
      select id from public.proposals
      where organization_id in (
        select organization_id from public.org_members where user_id = auth.uid()
      )
    )
  );

create policy "pv_insert_via_proposal"
  on public.proposal_versions for insert
  with check (
    proposal_id in (
      select id from public.proposals
      where organization_id in (
        select organization_id from public.org_members
        where user_id = auth.uid() and role in ('owner', 'admin', 'member')
      )
    )
  );

-- ============================================================
-- 8. Auto-generate proposal_number (trigger)
-- ============================================================
create or replace function public.generate_proposal_number()
returns trigger
language plpgsql
as $$
declare
  year_prefix text;
  next_seq int;
  new_number text;
begin
  if new.proposal_number is not null and new.proposal_number != '' then
    return new;
  end if;

  year_prefix := 'P-' || to_char(now(), 'YYYY') || '-';

  select coalesce(max(substring(proposal_number from length(year_prefix) + 1)::int), 0) + 1
    into next_seq
    from public.proposals
    where organization_id = new.organization_id
      and proposal_number like year_prefix || '%';

  new_number := year_prefix || lpad(next_seq::text, 4, '0');
  new.proposal_number := new_number;
  return new;
end;
$$;

create trigger trg_proposals_generate_number
  before insert on public.proposals
  for each row execute function public.generate_proposal_number();

-- ============================================================
-- 9. Seed: 전역 슬라이드 모듈 카탈로그 (T-Markov Core 18장 + Neuro 6장)
--    organization_id = null → 모든 조직이 공유
-- ============================================================

-- Phase 1: 프레임 설치
insert into public.proposal_slide_modules
  (organization_id, code, name, phase, neuro_dogma, is_required, min_neuro_level, description, source_deck, source_slide_no, sort_order)
values
  (null, 'P1_cover',        'Cover Slide',              'frame',   null,                    true,  'minimal',  '표지 - 고객사/제안 제목',                 'core', 1,  10),
  (null, 'N1_narrative',    'One-slide Narrative',      'frame',   'narrative_structure',   true,  'minimal',  '한 줄 내러티브 - 전체 스토리 요약',       'neuro', 13, 15),
  (null, 'P2_agenda',       'Agenda',                   'frame',   null,                    false, 'standard', '목차 - 섹션 개요',                         'core', 2,  20),
  (null, 'P3_context',      'Market Context',           'frame',   'precision_anchoring',   false, 'standard', '시장 배경 - 메가트렌드/규제',             'core', 3,  30)
on conflict do nothing;

-- Phase 2: 긴장 조성
insert into public.proposal_slide_modules
  (organization_id, code, name, phase, neuro_dogma, is_required, min_neuro_level, description, source_deck, source_slide_no, sort_order)
values
  (null, 'P4_problem',         'Customer Problem',        'tension', 'precision_anchoring', true,  'minimal',  '고객의 현재 이슈 - 정량적 근거 포함',       'core',  4,  40),
  (null, 'N2_embodied',        'Embodied Scenario',       'tension', 'embodied_cognition',  false, 'standard', '현장 관점 시나리오 - 실무자 공감대 형성',   'neuro', 14, 45),
  (null, 'P5_competitive',     'Competitive Threat',      'tension', 'prediction_anchoring',false, 'standard', '경쟁사/대체 솔루션 위협 분석',             'core',  5,  50),
  (null, 'N3_question_risk',   'Risk Question',           'tension', 'active_inference',    false, 'full',     '질문 슬라이드 - 리스크 환기',               'neuro', 15, 55)
on conflict do nothing;

-- Phase 3: Surprise + Solution
insert into public.proposal_slide_modules
  (organization_id, code, name, phase, neuro_dogma, is_required, min_neuro_level, description, source_deck, source_slide_no, sort_order)
values
  (null, 'N4_surprise',      'Surprise Slide',           'surprise', 'prediction_error',    true,  'minimal',  '예측 오류 유발 - 기존 가정 깨기',           'neuro', 16, 60),
  (null, 'P6_solution',      'Solution Overview',        'surprise', 'narrative_structure', true,  'minimal',  '솔루션 한 페이지 요약',                     'core',  6,  65),
  (null, 'P7_value_story',   'Value Story',              'surprise', 'narrative_structure', false, 'standard', '고객 관점 가치 스토리',                     'core',  7,  70)
on conflict do nothing;

-- Phase 4: 기술 증명
insert into public.proposal_slide_modules
  (organization_id, code, name, phase, neuro_dogma, is_required, min_neuro_level, description, source_deck, source_slide_no, sort_order)
values
  (null, 'P8_architecture',   'Reference Architecture',   'evidence', 'precision_anchoring', true,  'minimal',  '참조 아키텍처 - 구성도',                   'core',  8,  75),
  (null, 'P9_capability',     'Capability Matrix',        'evidence', 'precision_anchoring', false, 'standard', '기능 비교 매트릭스',                        'core',  9,  80),
  (null, 'P10_performance',   'Performance Evidence',     'evidence', 'precision_anchoring', false, 'standard', '성능 지표 - 벤치마크/PoC 결과',            'core',  10, 85),
  (null, 'N5_question_proof', 'Proof Question',           'evidence', 'active_inference',    false, 'full',     '질문 슬라이드 - 증거 재검토',               'neuro', 17, 90)
on conflict do nothing;

-- Phase 5: 확신 강화
insert into public.proposal_slide_modules
  (organization_id, code, name, phase, neuro_dogma, is_required, min_neuro_level, description, source_deck, source_slide_no, sort_order)
values
  (null, 'P11_roi',           'ROI & TCO',               'conviction', 'precision_anchoring', true,  'minimal',  'ROI/TCO - 견적 연동',                      'core',  11, 95),
  (null, 'P12_roadmap',       'Deployment Roadmap',      'conviction', 'narrative_structure', false, 'standard', '단계별 도입 로드맵',                        'core',  12, 100),
  (null, 'N6_call_to_action', 'Call to Action',          'conviction', 'active_inference',    true,  'minimal',  'Next Step - 의사결정 촉진',                 'neuro', 18, 105)
on conflict do nothing;

-- ============================================================
-- 10. Seed: 기본 템플릿 (T-Markov Standard / Minimal / Full)
-- ============================================================
insert into public.proposal_templates
  (organization_id, code, name, description, industry, target_persona, neuro_level, sort_order)
values
  (null, 'tmarkov-standard', 'T-Markov 표준 제안서 (15장)',
   'C레벨 대상 표준 레벨 - Phase 1~5 균형 + 핵심 뉴로 슬라이드',
   'general', 'c_level', 'standard', 10),
  (null, 'tmarkov-minimal',  'T-Markov 미니멀 제안서 (13장)',
   '실무자용 축약 - 필수 뉴로 슬라이드만 포함',
   'general', 'practitioner', 'minimal', 20),
  (null, 'tmarkov-full',     'T-Markov 풀 제안서 (18장)',
   '공공/주요 고객용 - 모든 뉴로 슬라이드 포함',
   'general', 'c_level', 'full', 30)
on conflict do nothing;

-- ============================================================
-- Done! Phase 2 Sprint 2-3 Proposal Schema Complete
-- ============================================================
