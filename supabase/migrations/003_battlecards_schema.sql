-- ============================================================
-- SmartWAN Platform — Phase 2 Sprint 2-2
-- Battle Card Schema: competitors + battle_cards + points + refs
-- ============================================================

-- ============================================================
-- 1. competitors — 경쟁사 마스터 테이블
-- ============================================================
create table public.competitors (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug            text not null,                 -- URL-safe identifier (cisco, fortinet, kt)
  name            text not null,                 -- 'Cisco SD-WAN', 'KT', 'Fortinet'
  logo_url        text,
  website         text,
  category        text,                          -- 'global-vendor' | 'domestic-telco' | 'cloud-native' | 'startup'
  threat_level    int not null default 3 check (threat_level between 1 and 5),
  summary         text,                          -- 한 줄 포지셔닝 요약
  target_segments text[] default '{}',           -- ['enterprise', 'smb', 'global']
  market_share    text,                          -- 자유 입력 ('국내 2위' 등)
  tags            text[] default '{}',           -- 검색/필터용 태그
  metadata        jsonb default '{}'::jsonb,
  is_active       boolean not null default true,
  sort_order      int default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique(organization_id, slug)
);

comment on table public.competitors is '경쟁사 마스터 — 조직별 관리';

create index idx_competitors_org on public.competitors(organization_id, is_active);
create index idx_competitors_category on public.competitors(organization_id, category);
create index idx_competitors_tags on public.competitors using gin(tags);

create trigger trg_competitors_updated
  before update on public.competitors
  for each row execute function public.update_updated_at();

-- ============================================================
-- 2. battle_cards — 경쟁사별 상세 스토리
-- ============================================================
create type public.battlecard_status as enum ('draft', 'published', 'archived');

create table public.battle_cards (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  competitor_id   uuid not null references public.competitors(id) on delete cascade,
  title           text not null,                 -- '2026 Cisco SD-WAN Battle Card'
  subtitle        text,
  overview        text,                          -- 경쟁 상황 요약 (rich text OK)
  key_insight     text,                          -- 한 줄 핵심 메시지 (제안서에도 사용)
  status          public.battlecard_status not null default 'draft',
  owner_user_id   uuid references auth.users(id) on delete set null,
  last_reviewed_at timestamptz,
  next_review_at   timestamptz,
  metadata        jsonb default '{}'::jsonb,
  created_by      uuid references auth.users(id) on delete set null,
  updated_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique(organization_id, competitor_id)         -- 경쟁사당 한 카드 (버전은 나중에)
);

comment on table public.battle_cards is '경쟁사별 배틀카드 (전략 스토리)';

create index idx_bc_org on public.battle_cards(organization_id, updated_at desc);
create index idx_bc_competitor on public.battle_cards(competitor_id);
create index idx_bc_status on public.battle_cards(organization_id, status);

create trigger trg_bc_updated
  before update on public.battle_cards
  for each row execute function public.update_updated_at();

-- ============================================================
-- 3. battle_points — 강점/약점/차별화/대응전략/Q&A 포인트
-- ============================================================
create type public.battle_point_type as enum (
  'strength', 'weakness', 'differentiator', 'counter', 'question', 'insight'
);

create table public.battle_points (
  id              uuid primary key default uuid_generate_v4(),
  battle_card_id  uuid not null references public.battle_cards(id) on delete cascade,
  type            public.battle_point_type not null,
  title           text not null,
  detail          text,                          -- 본문 (bullet 여러 개 가능, 마크다운)
  evidence_url    text,                          -- 출처 링크 (뉴스/분석 자료)
  priority        int not null default 3 check (priority between 1 and 5),
  sort_order      int default 0,
  ai_generated    boolean not null default false,
  ai_model        text,                          -- 'claude-sonnet-4.5' 등
  metadata        jsonb default '{}'::jsonb,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.battle_points is '배틀카드 세부 포인트 (타입별 분류, 드래그앤드롭 정렬)';

create index idx_bp_card_type on public.battle_points(battle_card_id, type, sort_order);

create trigger trg_bp_updated
  before update on public.battle_points
  for each row execute function public.update_updated_at();

-- ============================================================
-- 4. battle_references — 참조 자료 (뉴스/연구/사례)
-- ============================================================
create type public.battle_ref_type as enum ('news', 'case', 'research', 'video', 'other');

create table public.battle_references (
  id              uuid primary key default uuid_generate_v4(),
  battle_card_id  uuid not null references public.battle_cards(id) on delete cascade,
  source_type     public.battle_ref_type not null default 'other',
  title           text not null,
  url             text,
  summary         text,
  published_at    timestamptz,
  added_by        uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

comment on table public.battle_references is '배틀카드 외부 참조 링크';

create index idx_br_card on public.battle_references(battle_card_id, published_at desc nulls last);

-- ============================================================
-- 5. RLS Policies
-- ============================================================

-- competitors: 조직 멤버 read, admin+ write
alter table public.competitors enable row level security;

create policy "comp_select_members"
  on public.competitors for select
  using (
    organization_id in (
      select organization_id from public.org_members where user_id = auth.uid()
    )
  );

create policy "comp_write_admin"
  on public.competitors for all
  using (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'member')
    )
  );

-- battle_cards
alter table public.battle_cards enable row level security;

create policy "bc_select_members"
  on public.battle_cards for select
  using (
    organization_id in (
      select organization_id from public.org_members where user_id = auth.uid()
    )
  );

create policy "bc_write_members"
  on public.battle_cards for all
  using (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'member')
    )
  );

-- battle_points: 상위 카드 권한 계승
alter table public.battle_points enable row level security;

create policy "bp_all_via_card"
  on public.battle_points for all
  using (
    battle_card_id in (
      select id from public.battle_cards
      where organization_id in (
        select organization_id from public.org_members where user_id = auth.uid()
      )
    )
  );

-- battle_references
alter table public.battle_references enable row level security;

create policy "br_all_via_card"
  on public.battle_references for all
  using (
    battle_card_id in (
      select id from public.battle_cards
      where organization_id in (
        select organization_id from public.org_members where user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- 6. Helper: ensure competitor has a slug auto-generated
-- ============================================================
create or replace function public.ensure_competitor_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := regexp_replace(lower(new.name), '[^a-z0-9]+', '-', 'g');
    new.slug := trim(both '-' from new.slug);
  end if;
  return new;
end;
$$;

create trigger trg_competitor_slug
  before insert on public.competitors
  for each row execute function public.ensure_competitor_slug();

-- ============================================================
-- Done! Phase 2 Sprint 2-2 Schema Complete
-- ============================================================
