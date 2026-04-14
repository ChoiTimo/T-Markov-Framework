-- ============================================================
-- SmartWAN Platform — Phase 2 Sprint 2-1
-- Quote Calculator Schema: modules, pricing, quotes, versions
-- ============================================================

-- ============================================================
-- 1. modules — 제품/서비스 모듈 카탈로그
--    (견적 항목 + 제안서 모듈 공용)
-- ============================================================
create table public.modules (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid references public.organizations(id) on delete cascade,
  code            text not null,                 -- 'premium-sla', 'standard-cpe-domestic'
  name            text not null,                 -- '프리미엄 SLA 전용선'
  category        text not null,                 -- 'premium' | 'standard' | 'cpe' | 'addon'
  service_tier    text,                          -- 'premium' | 'standard' | 'combo'
  scope           text,                          -- 'domestic' | 'international' | 'global'
  description     text,
  unit            text default '회선',            -- '회선' | '대' | '식'
  base_price      numeric(14,2),                 -- 단일 단가 모듈용 (대역폭/지역 무관)
  currency        text default 'KRW',
  pricing_type    text not null default 'matrix', -- 'matrix' | 'flat' | 'custom'
  metadata        jsonb default '{}'::jsonb,
  is_active       boolean not null default true,
  sort_order      int default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique(organization_id, code)
);

comment on table public.modules is '견적/제안서에서 재사용 가능한 제품/서비스 카탈로그';

create index idx_modules_org on public.modules(organization_id);
create index idx_modules_active on public.modules(organization_id, is_active) where is_active = true;

create trigger trg_modules_updated
  before update on public.modules
  for each row execute function public.update_updated_at();

-- ============================================================
-- 2. pricing_matrices — 지역 × 대역폭 가격 매트릭스
--    (프리미엄 전용선 같은 매트릭스 단가 모듈용)
-- ============================================================
create table public.pricing_matrices (
  id              uuid primary key default uuid_generate_v4(),
  module_id       uuid not null references public.modules(id) on delete cascade,
  region_code     text not null,                 -- 'area-a', 'korea'
  region_name     text not null,                 -- '인도, 방글라데시, ...'
  bandwidth_mbps  int not null,                  -- 2, 4, 10, 100, 1000, ...
  monthly_price   numeric(14,2) not null,
  currency        text default 'KRW',
  metadata        jsonb default '{}'::jsonb,
  created_at      timestamptz not null default now(),

  unique(module_id, region_code, bandwidth_mbps)
);

comment on table public.pricing_matrices is '지역×대역폭 기반 가격 매트릭스';

create index idx_pm_module on public.pricing_matrices(module_id);
create index idx_pm_region on public.pricing_matrices(module_id, region_code);

-- ============================================================
-- 3. pricing_rules — 약정/할인 규칙
-- ============================================================
create table public.pricing_rules (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid references public.organizations(id) on delete cascade,
  rule_type       text not null,                 -- 'contract_term' | 'volume' | 'custom'
  label           text not null,                 -- '2년 약정 (기준가)'
  contract_months int,                           -- 0, 12, 24, 36
  multiplier      numeric(6,4) not null,         -- 1.2000 (+20%), 0.9500 (-5%)
  display_hint    text,                          -- 'surcharge' | 'base' | 'discount'
  sort_order      int default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

comment on table public.pricing_rules is '약정 기간 할증/할인 등 가격 조정 규칙';

create index idx_pricing_rules_org on public.pricing_rules(organization_id, is_active);

-- ============================================================
-- 4. quotes — 견적 본체
-- ============================================================
create type public.quote_status as enum (
  'draft', 'pending_review', 'approved', 'sent', 'accepted', 'rejected', 'expired', 'archived'
);

create table public.quotes (
  id                uuid primary key default uuid_generate_v4(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  quote_number      text,                          -- 'Q-2026-0001' (자동 발번)
  title             text not null,
  customer_name     text,
  customer_contact  text,                          -- 담당자 이메일/전화
  customer_company  text,
  service_type      text,                          -- 'premium' | 'standard' | 'combo'
  contract_months   int default 24,
  contract_rule_id  uuid references public.pricing_rules(id) on delete set null,
  status            public.quote_status not null default 'draft',
  currency          text default 'KRW',

  -- 계산 결과 캐시
  subtotal          numeric(14,2) not null default 0,
  adjustment_amount numeric(14,2) not null default 0,  -- 약정 할증/할인액
  tax_rate          numeric(5,4) default 0.1000,       -- 10% VAT
  tax_amount        numeric(14,2) not null default 0,
  total_amount      numeric(14,2) not null default 0,
  monthly_amount    numeric(14,2) not null default 0,  -- 월 이용료 (세후)

  valid_until       date,
  notes             text,
  exceptions_note   text,                              -- 예외사항 안내
  metadata          jsonb default '{}'::jsonb,

  created_by        uuid references auth.users(id) on delete set null,
  updated_by        uuid references auth.users(id) on delete set null,
  current_version   int not null default 1,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.quotes is '견적서 본체 (조직 단위 멀티테넌트)';

create index idx_quotes_org on public.quotes(organization_id, updated_at desc);
create index idx_quotes_status on public.quotes(organization_id, status);
create unique index idx_quotes_number on public.quotes(organization_id, quote_number) where quote_number is not null;

create trigger trg_quotes_updated
  before update on public.quotes
  for each row execute function public.update_updated_at();

-- ============================================================
-- 5. quote_items — 견적 라인아이템
-- ============================================================
create table public.quote_items (
  id                uuid primary key default uuid_generate_v4(),
  quote_id          uuid not null references public.quotes(id) on delete cascade,
  module_id         uuid references public.modules(id) on delete set null,

  -- 스냅샷 (모듈 변경에도 견적은 당시 값 유지)
  item_name         text not null,
  item_description  text,
  category          text,
  service_tier      text,

  region_code       text,
  region_name       text,
  bandwidth_mbps    int,

  quantity          numeric(10,2) not null default 1,
  unit              text default '회선',
  unit_price        numeric(14,2) not null default 0,
  line_total        numeric(14,2) not null default 0,

  is_hub            boolean not null default false,     -- 허브-스포크 구분
  sort_order        int default 0,
  metadata          jsonb default '{}'::jsonb,

  created_at        timestamptz not null default now()
);

comment on table public.quote_items is '견적 내 개별 항목 (당시 값 스냅샷)';

create index idx_quote_items_quote on public.quote_items(quote_id, sort_order);

-- ============================================================
-- 6. quote_versions — 견적 버전 스냅샷
-- ============================================================
create table public.quote_versions (
  id              uuid primary key default uuid_generate_v4(),
  quote_id        uuid not null references public.quotes(id) on delete cascade,
  version_number  int not null,
  snapshot        jsonb not null,                 -- 견적 + 라인아이템 전체 스냅샷
  change_summary  text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),

  unique(quote_id, version_number)
);

comment on table public.quote_versions is '견적 변경 이력 (되돌리기/비교용 스냅샷)';

create index idx_quote_versions_quote on public.quote_versions(quote_id, version_number desc);

-- ============================================================
-- 7. RLS Policies
-- ============================================================

-- modules: 조직 멤버는 읽기, admin 이상만 쓰기
alter table public.modules enable row level security;

create policy "modules_select_members"
  on public.modules for select
  using (
    organization_id is null  -- 전역 카탈로그는 전체 읽기
    or organization_id in (
      select organization_id from public.org_members where user_id = auth.uid()
    )
  );

create policy "modules_write_admin"
  on public.modules for all
  using (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- pricing_matrices: 읽기는 modules 권한 계승, 쓰기는 admin
alter table public.pricing_matrices enable row level security;

create policy "pm_select_via_module"
  on public.pricing_matrices for select
  using (
    module_id in (
      select id from public.modules
      where organization_id is null
         or organization_id in (
           select organization_id from public.org_members where user_id = auth.uid()
         )
    )
  );

create policy "pm_write_admin"
  on public.pricing_matrices for all
  using (
    module_id in (
      select m.id from public.modules m
      join public.org_members om on om.organization_id = m.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin')
    )
  );

-- pricing_rules: 조직 멤버 읽기, admin 쓰기
alter table public.pricing_rules enable row level security;

create policy "pr_select_members"
  on public.pricing_rules for select
  using (
    organization_id is null
    or organization_id in (
      select organization_id from public.org_members where user_id = auth.uid()
    )
  );

create policy "pr_write_admin"
  on public.pricing_rules for all
  using (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- quotes: 조직 멤버 전체 접근 (viewer는 읽기만)
alter table public.quotes enable row level security;

create policy "quotes_select_members"
  on public.quotes for select
  using (
    organization_id in (
      select organization_id from public.org_members where user_id = auth.uid()
    )
  );

create policy "quotes_insert_members"
  on public.quotes for insert
  with check (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'member')
    )
  );

create policy "quotes_update_members"
  on public.quotes for update
  using (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'member')
    )
  );

create policy "quotes_delete_admin"
  on public.quotes for delete
  using (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- quote_items: 견적 접근권한 계승
alter table public.quote_items enable row level security;

create policy "qi_all_via_quote"
  on public.quote_items for all
  using (
    quote_id in (
      select id from public.quotes
      where organization_id in (
        select organization_id from public.org_members where user_id = auth.uid()
      )
    )
  );

-- quote_versions: 견적 접근권한 계승 (읽기 전용)
alter table public.quote_versions enable row level security;

create policy "qv_select_via_quote"
  on public.quote_versions for select
  using (
    quote_id in (
      select id from public.quotes
      where organization_id in (
        select organization_id from public.org_members where user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- 8. Auto-generate quote_number (trigger)
-- ============================================================
create or replace function public.generate_quote_number()
returns trigger
language plpgsql
as $$
declare
  year_prefix text;
  next_seq int;
  new_number text;
begin
  if new.quote_number is not null and new.quote_number != '' then
    return new;
  end if;

  year_prefix := 'Q-' || to_char(now(), 'YYYY') || '-';

  select coalesce(max(substring(quote_number from length(year_prefix) + 1)::int), 0) + 1
    into next_seq
    from public.quotes
    where organization_id = new.organization_id
      and quote_number like year_prefix || '%';

  new_number := year_prefix || lpad(next_seq::text, 4, '0');
  new.quote_number := new_number;
  return new;
end;
$$;

create trigger trg_quotes_generate_number
  before insert on public.quotes
  for each row execute function public.generate_quote_number();

-- ============================================================
-- 9. Seed: default contract pricing rules (전역, 조직별 오버라이드 가능)
-- ============================================================
insert into public.pricing_rules (organization_id, rule_type, label, contract_months, multiplier, display_hint, sort_order)
values
  (null, 'contract_term', '무약정 (+20%)',      0,  1.2000, 'surcharge', 1),
  (null, 'contract_term', '1년 약정 (+10%)',    12, 1.1000, 'surcharge', 2),
  (null, 'contract_term', '2년 약정 (기준가)',   24, 1.0000, 'base',      3),
  (null, 'contract_term', '3년 약정 (-5%)',     36, 0.9500, 'discount',  4)
on conflict do nothing;

-- ============================================================
-- Done! Phase 2 Sprint 2-1 Schema Complete
-- ============================================================
