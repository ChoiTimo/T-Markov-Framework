-- ============================================================
-- SmartWAN Platform — Phase 3 Master Migration
-- AI Assistant Panel · Competitive Intelligence · Win/Loss Learning
-- ============================================================
-- 1. ai_conversations          : 대화 세션 (surface · pinned · tags)
-- 2. ai_messages               : 메시지 영속 (role · content jsonb · token_usage)
-- 3. ai_tool_executions        : 도구 호출 감사 (read/write · Confirm 루프)
-- 4. ai_daily_summaries        : 일 단위 요약/인사이트 (스케줄러 산출)
-- 5. deal_win_loss             : 제안서 Win/Loss 라벨 (3-3 학습 소스)
-- 6. competitive_intel_signals : 경쟁사 뉴스 신호 (3-2 피드)
--   + 집계 뷰 3종 (ai_conversation_stats / ai_tool_usage_stats /
--                 proposal_win_rate_by_module)
-- ============================================================

-- ------------------------------------------------------------
-- 1. ai_conversations
-- ------------------------------------------------------------
create table public.ai_conversations (
  id                  uuid primary key default uuid_generate_v4(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,

  -- 어떤 화면에서 열린 대화인가
  surface             text not null
                         check (surface in
                           ('proposal_editor','quote','battlecard','dashboard','global')),
  surface_ref_id      uuid,                                 -- proposal_id / quote_id / competitor_id

  title               text,                                 -- 사용자가 지정하거나 자동 생성
  pinned              boolean not null default false,       -- 조직 지식화용
  tags                text[]  not null default '{}',        -- 자유 태그
  archived_at         timestamptz,

  -- 토큰/턴 누적 캐시
  message_count       int  not null default 0,
  total_input_tokens  int  not null default 0,
  total_output_tokens int  not null default 0,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.ai_conversations is
  'Phase 3 AI 어시스턴트 대화 세션 (무제한 영속 + pinned/tags 지식화)';

create index idx_aic_org_surface
  on public.ai_conversations(organization_id, surface, updated_at desc);

create index idx_aic_user_recent
  on public.ai_conversations(user_id, updated_at desc);

create index idx_aic_surface_ref
  on public.ai_conversations(surface, surface_ref_id)
  where surface_ref_id is not null;

create index idx_aic_pinned
  on public.ai_conversations(organization_id, pinned)
  where pinned = true;

create trigger trg_aic_updated
  before update on public.ai_conversations
  for each row execute function public.update_updated_at();

-- ------------------------------------------------------------
-- 2. ai_messages
-- ------------------------------------------------------------
create table public.ai_messages (
  id                  uuid primary key default uuid_generate_v4(),
  conversation_id     uuid not null references public.ai_conversations(id) on delete cascade,

  role                text not null check (role in ('user','assistant','tool','system')),
  content             jsonb not null default '{}'::jsonb,   -- { text, tool_calls, tool_results }
  parent_message_id   uuid references public.ai_messages(id) on delete set null,

  -- 모델 · 토큰
  model               text,
  input_tokens        int  default 0,
  output_tokens       int  default 0,

  -- 에러 메타
  error_kind          text,                                 -- null = 정상
  error_detail        text,

  created_at          timestamptz not null default now()
);

comment on table public.ai_messages is
  'AI 어시스턴트 메시지 (멀티턴 영속, parent_message_id 로 분기 지원)';

create index idx_aim_conversation
  on public.ai_messages(conversation_id, created_at);

create index idx_aim_role
  on public.ai_messages(conversation_id, role);

-- ------------------------------------------------------------
-- 3. ai_tool_executions — 도구 호출 감사 + Confirm 루프
-- ------------------------------------------------------------
create table public.ai_tool_executions (
  id                  uuid primary key default uuid_generate_v4(),
  conversation_id     uuid not null references public.ai_conversations(id) on delete cascade,
  message_id          uuid references public.ai_messages(id) on delete set null,
  organization_id     uuid not null references public.organizations(id) on delete cascade,

  tool_name           text not null,                        -- get_proposal / draft_slide_append / ...
  args                jsonb not null default '{}'::jsonb,
  result              jsonb not null default '{}'::jsonb,

  status              text not null default 'pending'
                         check (status in ('pending','applied','rejected','failed')),
  mutates_data        boolean not null default false,       -- true 면 Confirm 강제

  -- Confirm 루프
  requested_by        uuid references auth.users(id) on delete set null,
  confirmed_by        uuid references auth.users(id) on delete set null,
  confirmed_at        timestamptz,
  rejection_reason    text,

  latency_ms          int,
  created_at          timestamptz not null default now()
);

comment on table public.ai_tool_executions is
  '도구 호출 감사 — mutates_data 는 Confirm 없이는 DB 변경 불가 (CHECK + 서버 가드)';

-- 쓰기 도구 + applied 상태는 반드시 사용자 Confirm 을 거쳐야 한다
alter table public.ai_tool_executions add constraint ck_ate_write_needs_confirm
  check (
    not mutates_data
    or status in ('pending','rejected','failed')
    or (status = 'applied' and confirmed_by is not null and confirmed_at is not null)
  );

create index idx_ate_conversation
  on public.ai_tool_executions(conversation_id, created_at);

create index idx_ate_org_tool
  on public.ai_tool_executions(organization_id, tool_name, created_at desc);

create index idx_ate_pending_writes
  on public.ai_tool_executions(organization_id, status, mutates_data)
  where mutates_data = true and status = 'pending';

-- ------------------------------------------------------------
-- 4. ai_daily_summaries
-- ------------------------------------------------------------
create table public.ai_daily_summaries (
  id                  uuid primary key default uuid_generate_v4(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  summary_date        date not null,
  scope               text not null default 'org'
                         check (scope in ('org','user','surface')),
  scope_ref_id        uuid,                                 -- user_id 또는 surface_ref_id

  summary             text not null,
  insights            jsonb not null default '[]'::jsonb,   -- [{kind, message, weight}]
  model               text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (organization_id, summary_date, scope, scope_ref_id)
);

comment on table public.ai_daily_summaries is
  '일 단위 AI 요약/인사이트 (매일 02:00 KST 스케줄러 산출)';

create index idx_ads_org_date
  on public.ai_daily_summaries(organization_id, summary_date desc);

create trigger trg_ads_updated
  before update on public.ai_daily_summaries
  for each row execute function public.update_updated_at();

-- ------------------------------------------------------------
-- 5. deal_win_loss — 3-3 학습 소스
-- ------------------------------------------------------------
create table public.deal_win_loss (
  id                  uuid primary key default uuid_generate_v4(),
  proposal_id         uuid not null references public.proposals(id) on delete cascade,
  organization_id     uuid not null references public.organizations(id) on delete cascade,

  status              text not null
                         check (status in ('won','lost','canceled','pending')),
  reason_category     text,                                 -- 'price','feature','timing','competitor','other'
  reason_note         text,
  contract_value      numeric(14,2),
  currency            text default 'KRW',
  closed_at           timestamptz,

  competitors         jsonb not null default '[]'::jsonb,   -- [{competitor_id, note}]

  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (proposal_id)                                      -- 제안서당 1행
);

comment on table public.deal_win_loss is
  '제안서 Win/Loss 라벨 (Sprint 3-3 추천 정확도 학습 소스)';

create index idx_dwl_org_status
  on public.deal_win_loss(organization_id, status, closed_at desc);

create trigger trg_dwl_updated
  before update on public.deal_win_loss
  for each row execute function public.update_updated_at();

-- ------------------------------------------------------------
-- 6. competitive_intel_signals — 3-2 뉴스 신호
-- ------------------------------------------------------------
create table public.competitive_intel_signals (
  id                  uuid primary key default uuid_generate_v4(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  competitor_id       uuid,                                 -- battlecards.competitor_id (optional)

  source_url          text not null,
  source_name         text,
  headline            text not null,
  summary             text,
  published_at        timestamptz,

  severity            text not null default 'low'
                         check (severity in ('low','medium','high','critical')),
  battlecard_patch    jsonb,                                -- 제안되는 배틀카드 변경 (drafts)
  processed_at        timestamptz,                          -- AI 후처리 시각
  applied_at          timestamptz,                          -- 실제 배틀카드 반영 시각

  created_at          timestamptz not null default now()
);

comment on table public.competitive_intel_signals is
  '경쟁사 뉴스 신호 + 배틀카드 패치 제안 (Sprint 3-2 피드)';

create index idx_cis_org_competitor
  on public.competitive_intel_signals(organization_id, competitor_id, published_at desc);

create index idx_cis_unprocessed
  on public.competitive_intel_signals(organization_id, processed_at)
  where processed_at is null;

-- ============================================================
-- RLS — 모든 신규 테이블에 동일한 4종 정책 적용
-- ============================================================
alter table public.ai_conversations          enable row level security;
alter table public.ai_messages               enable row level security;
alter table public.ai_tool_executions        enable row level security;
alter table public.ai_daily_summaries        enable row level security;
alter table public.deal_win_loss             enable row level security;
alter table public.competitive_intel_signals enable row level security;

-- ---- ai_conversations --------------------------------------------------
create policy "aic_select_members" on public.ai_conversations for select
  using (organization_id in (select organization_id from public.org_members where user_id = auth.uid()));

create policy "aic_insert_members" on public.ai_conversations for insert
  with check (organization_id in (
    select organization_id from public.org_members
    where user_id = auth.uid() and role in ('owner','admin','member')));

create policy "aic_update_members" on public.ai_conversations for update
  using (organization_id in (
    select organization_id from public.org_members
    where user_id = auth.uid() and role in ('owner','admin','member')));

create policy "aic_delete_admin" on public.ai_conversations for delete
  using (organization_id in (
    select organization_id from public.org_members
    where user_id = auth.uid() and role in ('owner','admin')));

-- ---- ai_messages ------------------------------------------------------
-- messages 는 conversation_id 의 org 를 따름
create policy "aim_select_members" on public.ai_messages for select
  using (conversation_id in (
    select id from public.ai_conversations
    where organization_id in (select organization_id from public.org_members where user_id = auth.uid())));

create policy "aim_insert_members" on public.ai_messages for insert
  with check (conversation_id in (
    select id from public.ai_conversations
    where organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner','admin','member'))));

create policy "aim_update_members" on public.ai_messages for update
  using (conversation_id in (
    select id from public.ai_conversations
    where organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner','admin','member'))));

create policy "aim_delete_admin" on public.ai_messages for delete
  using (conversation_id in (
    select id from public.ai_conversations
    where organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner','admin'))));

-- ---- ai_tool_executions ----------------------------------------------
create policy "ate_select_members" on public.ai_tool_executions for select
  using (organization_id in (select organization_id from public.org_members where user_id = auth.uid()));

create policy "ate_insert_members" on public.ai_tool_executions for insert
  with check (organization_id in (
    select organization_id from public.org_members
    where user_id = auth.uid() and role in ('owner','admin','member')));

create policy "ate_update_members" on public.ai_tool_executions for update
  using (organization_id in (
    select organization_id from public.org_members
    where user_id = auth.uid() and role in ('owner','admin','member')));

create policy "ate_delete_admin" on public.ai_tool_executions for delete
  using (organization_id in (
    select organization_id from public.org_members
    where user_id = auth.uid() and role in ('owner','admin')));

-- ---- ai_daily_summaries ----------------------------------------------
create policy "ads_select_members" on public.ai_daily_summaries for select
  using (organization_id in (select organization_id from public.org_members where user_id = auth.uid()));

create policy "ads_insert_members" on public.ai_daily_summaries for insert
  with check (organization_id in (
    select organization_id from public.org_members
    where user_id = auth.uid() and role in ('owner','admin','member')));

create policy "ads_update_members" on public.ai_daily_summaries for update
  using (organization_id in (
    select organization_id from public.org_members
    where user_id = auth.uid() and role in ('owner','admin','member')));

create policy "ads_delete_admin" on public.ai_daily_summaries for delete
  using (organization_id in (
    select organization_id from public.org_members
    where user_id = auth.uid() and role in ('owner','admin')));

-- ---- deal_win_loss ----------------------------------------------------
create policy "dwl_select_members" on public.deal_win_loss for select
  using (organization_id in (select organization_id from public.org_members where user_id = auth.uid()));

create policy "dwl_insert_members" on public.deal_win_loss for insert
  with check (organization_id in (
    select organization_id from public.org_members
    where user_id = auth.uid() and role in ('owner','admin','member')));

create policy "dwl_update_members" on public.deal_win_loss for update
  using (organization_id in (
    select organization_id from public.org_members
    where user_id = auth.uid() and role in ('owner','admin','member')));

create policy "dwl_delete_admin" on public.deal_win_loss for delete
  using (organization_id in (
    select organization_id from public.org_members
    where user_id = auth.uid() and role in ('owner','admin')));

-- ---- competitive_intel_signals ---------------------------------------
create policy "cis_select_members" on public.competitive_intel_signals for select
  using (organization_id in (select organization_id from public.org_members where user_id = auth.uid()));

create policy "cis_insert_members" on public.competitive_intel_signals for insert
  with check (organization_id in (
    select organization_id from public.org_members
    where user_id = auth.uid() and role in ('owner','admin','member')));

create policy "cis_update_members" on public.competitive_intel_signals for update
  using (organization_id in (
    select organization_id from public.org_members
    where user_id = auth.uid() and role in ('owner','admin','member')));

create policy "cis_delete_admin" on public.competitive_intel_signals for delete
  using (organization_id in (
    select organization_id from public.org_members
    where user_id = auth.uid() and role in ('owner','admin')));

-- ============================================================
-- 집계 뷰 3종
-- ============================================================

-- 6-1. 조직 · 일자 · surface 별 대화 트래픽 (리포트용)
create or replace view public.ai_conversation_stats as
select
  c.organization_id,
  date_trunc('day', c.created_at)::date        as day,
  c.surface,
  count(*)                                      as conversation_count,
  coalesce(sum(c.message_count), 0)             as total_messages,
  coalesce(sum(c.total_input_tokens), 0)        as total_input_tokens,
  coalesce(sum(c.total_output_tokens), 0)       as total_output_tokens
from public.ai_conversations c
group by c.organization_id, day, c.surface;

comment on view public.ai_conversation_stats is
  '일별 surface 별 대화/토큰 사용량 집계';

-- 6-2. 도구 호출 통계 (Confirm 승인율 포함)
create or replace view public.ai_tool_usage_stats as
select
  t.organization_id,
  t.tool_name,
  t.mutates_data,
  count(*)                                      as call_count,
  count(*) filter (where t.status = 'applied')  as applied_count,
  count(*) filter (where t.status = 'rejected') as rejected_count,
  count(*) filter (where t.status = 'failed')   as failed_count,
  round(
    (count(*) filter (where t.status = 'applied')::numeric
     / nullif(count(*), 0)) * 100, 2
  )                                             as applied_rate_pct,
  round(avg(t.latency_ms))                      as avg_latency_ms
from public.ai_tool_executions t
group by t.organization_id, t.tool_name, t.mutates_data;

comment on view public.ai_tool_usage_stats is
  '도구별 호출/승인/실패 집계 (쓰기 도구는 Confirm 승인율 핵심 지표)';

-- 6-3. 모듈별 Win rate (Sprint 3-3 추천 엔진이 참조)
create or replace view public.proposal_win_rate_by_module as
with slide_modules as (
  select
    p.id              as proposal_id,
    p.organization_id,
    s.code            as module_code        -- proposal_slides 의 컬럼명은 code (모듈 코드 스냅샷)
  from public.proposals p
  join public.proposal_slides s on s.proposal_id = p.id
  where s.code is not null
),
labeled as (
  select
    sm.organization_id,
    sm.module_code,
    d.status
  from slide_modules sm
  join public.deal_win_loss d on d.proposal_id = sm.proposal_id
)
select
  l.organization_id,
  l.module_code,
  count(*)                                       as total_deals,
  count(*) filter (where l.status = 'won')       as won_count,
  count(*) filter (where l.status = 'lost')      as lost_count,
  round(
    (count(*) filter (where l.status = 'won')::numeric
     / nullif(count(*) filter (where l.status in ('won','lost')), 0)) * 100, 2
  )                                              as win_rate_pct
from labeled l
group by l.organization_id, l.module_code
having count(*) >= 3;   -- 표본 3건 이상만 (과적합 방지)

comment on view public.proposal_win_rate_by_module is
  '모듈 코드별 Win rate (3건 이상 표본, 3-3 추천 엔진 signal 소스)';

-- ============================================================
-- 완료
-- ============================================================
-- 검증 쿼리:
--   select count(*) from public.ai_conversations;            -- 0
--   select count(*) from public.ai_messages;                 -- 0
--   select count(*) from public.ai_tool_executions;          -- 0
--   select count(*) from public.ai_daily_summaries;          -- 0
--   select count(*) from public.deal_win_loss;               -- 0
--   select count(*) from public.competitive_intel_signals;   -- 0
--   select tablename, count(*) from pg_policies
--    where tablename in ('ai_conversations','ai_messages','ai_tool_executions',
--                        'ai_daily_summaries','deal_win_loss','competitive_intel_signals')
--    group by tablename;   -- 각 4
