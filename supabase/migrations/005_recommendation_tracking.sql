-- ============================================================
-- SmartWAN Platform — Phase 2 Sprint 2-6
-- AI Recommendation Tracking & Reporting
-- ============================================================
-- 1. proposal_recommendation_events : Claude 추천 호출 로그
-- 2. proposal_slides 에 ai_recommendation_event_id FK 추가
-- 3. 리포트 집계용 인덱스 + RLS
-- ============================================================

-- ------------------------------------------------------------
-- 1. proposal_recommendation_events
-- ------------------------------------------------------------
create table public.proposal_recommendation_events (
  id                  uuid primary key default uuid_generate_v4(),
  proposal_id         uuid not null references public.proposals(id) on delete cascade,
  organization_id     uuid not null references public.organizations(id) on delete cascade,

  -- 호출 메타
  model               text,                            -- 'claude-sonnet-4-...'
  additional_notes    text,                            -- 사용자가 추가한 지시사항
  summary             text,                            -- Claude 요약문

  -- 제안 내용 (JSON 배열)
  additions           jsonb not null default '[]'::jsonb,  -- [{code, phase, reason}]
  removals            jsonb not null default '[]'::jsonb,  -- [{code, reason}]
  emphasis            jsonb not null default '[]'::jsonb,  -- [{code, suggestion}]

  -- 개수 캐시 (집계 성능용)
  additions_count     int  not null default 0,
  removals_count      int  not null default 0,
  emphasis_count      int  not null default 0,

  -- 적용 결과 (사용자가 실제로 액션한 코드들)
  applied_additions   jsonb not null default '[]'::jsonb,  -- ['P8_arch', 'P11_roi', ...]
  applied_removals    jsonb not null default '[]'::jsonb,  -- ['N1_narrative', ...]

  -- 원본
  raw_response        jsonb not null default '{}'::jsonb,

  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.proposal_recommendation_events is
  'Claude API 제안서 추천 호출 로그 (Sprint 2-6 트래킹/리포팅)';

create index idx_pre_proposal
  on public.proposal_recommendation_events(proposal_id, created_at desc);

create index idx_pre_org_created
  on public.proposal_recommendation_events(organization_id, created_at desc);

create trigger trg_pre_updated
  before update on public.proposal_recommendation_events
  for each row execute function public.update_updated_at();

-- ------------------------------------------------------------
-- 2. proposal_slides : 추천에서 기원한 슬라이드 마킹
-- ------------------------------------------------------------
alter table public.proposal_slides
  add column ai_recommendation_event_id uuid
    references public.proposal_recommendation_events(id) on delete set null,
  add column ai_recommended_reason text;

create index idx_ps_recommendation_event
  on public.proposal_slides(ai_recommendation_event_id)
  where ai_recommendation_event_id is not null;

-- ------------------------------------------------------------
-- 3. RLS
-- ------------------------------------------------------------
alter table public.proposal_recommendation_events enable row level security;

create policy "pre_select_members"
  on public.proposal_recommendation_events for select
  using (
    organization_id in (
      select organization_id from public.org_members where user_id = auth.uid()
    )
  );

create policy "pre_insert_members"
  on public.proposal_recommendation_events for insert
  with check (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'member')
    )
  );

create policy "pre_update_members"
  on public.proposal_recommendation_events for update
  using (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'member')
    )
  );

create policy "pre_delete_admin"
  on public.proposal_recommendation_events for delete
  using (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- ------------------------------------------------------------
-- 4. 리포트용 집계 뷰 (읽기 편의)
-- ------------------------------------------------------------
create or replace view public.proposal_recommendation_stats as
select
  e.organization_id,
  date_trunc('day', e.created_at)::date   as day,
  count(*)                                 as call_count,
  coalesce(sum(e.additions_count), 0)      as total_additions,
  coalesce(sum(e.removals_count), 0)       as total_removals,
  coalesce(sum(e.emphasis_count), 0)       as total_emphasis,
  coalesce(sum(jsonb_array_length(e.applied_additions)), 0) as applied_additions,
  coalesce(sum(jsonb_array_length(e.applied_removals)), 0)  as applied_removals
from public.proposal_recommendation_events e
group by e.organization_id, day;

comment on view public.proposal_recommendation_stats is
  '일별 추천 호출 집계 (리포트 페이지 소스)';

-- 주의: view 는 기본 호출자 권한을 상속. RLS 는 기저 테이블에서 걸림.
