-- ============================================================
-- SmartWAN Platform — Phase 1 Sprint 1-1
-- Initial Schema: Organizations, Profiles, RBAC, Audit Logs
-- ============================================================

-- 0. Extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. organizations — 멀티테넌트 조직 단위
-- ============================================================
create table public.organizations (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  slug        text not null unique,          -- URL-safe identifier
  logo_url    text,
  settings    jsonb default '{}'::jsonb,      -- org-level feature flags / configs
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.organizations is '조직(부서/회사) 단위 멀티테넌트 루트 엔티티';

-- ============================================================
-- 2. profiles — auth.users 확장 (1:1)
-- ============================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  phone       text,
  department  text,                           -- 소속 부서 (자유 입력)
  job_title   text,                           -- 직함
  settings    jsonb default '{}'::jsonb,      -- user-level preferences
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Supabase Auth 사용자 프로필 확장 테이블';

-- ============================================================
-- 3. org_members — 조직 멤버십 + RBAC 역할
-- ============================================================
create type public.org_role as enum ('owner', 'admin', 'member', 'viewer');

create table public.org_members (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            public.org_role not null default 'member',
  invited_by      uuid references auth.users(id) on delete set null,
  joined_at       timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique(organization_id, user_id)
);

comment on table public.org_members is '조직-사용자 멤버십 (RBAC 역할 포함)';

create index idx_org_members_org on public.org_members(organization_id);
create index idx_org_members_user on public.org_members(user_id);

-- ============================================================
-- 4. audit_logs — 감사 로그
-- ============================================================
create table public.audit_logs (
  id              uuid primary key default uuid_generate_v4(),
  organization_id uuid references public.organizations(id) on delete set null,
  user_id         uuid references auth.users(id) on delete set null,
  action          text not null,               -- e.g. 'quote.create', 'deal.update'
  resource_type   text,                        -- e.g. 'quote', 'deal', 'battlecard'
  resource_id     uuid,
  metadata        jsonb default '{}'::jsonb,   -- action-specific payload
  ip_address      inet,
  created_at      timestamptz not null default now()
);

comment on table public.audit_logs is '사용자 활동 감사 로그';

create index idx_audit_org on public.audit_logs(organization_id, created_at desc);
create index idx_audit_user on public.audit_logs(user_id, created_at desc);

-- ============================================================
-- 5. Auto-create profile on signup (trigger)
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 6. Auto-update updated_at (trigger)
-- ============================================================
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_organizations_updated
  before update on public.organizations
  for each row execute function public.update_updated_at();

create trigger trg_profiles_updated
  before update on public.profiles
  for each row execute function public.update_updated_at();

create trigger trg_org_members_updated
  before update on public.org_members
  for each row execute function public.update_updated_at();

-- ============================================================
-- 7. Row Level Security (RLS)
-- ============================================================

-- 7a. organizations
alter table public.organizations enable row level security;

create policy "org_select_members"
  on public.organizations for select
  using (
    id in (
      select organization_id from public.org_members
      where user_id = auth.uid()
    )
  );

create policy "org_insert_authenticated"
  on public.organizations for insert
  with check (auth.role() = 'authenticated');

create policy "org_update_admin"
  on public.organizations for update
  using (
    id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "org_delete_owner"
  on public.organizations for delete
  using (
    id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role = 'owner'
    )
  );

-- 7b. profiles
alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_select_org_mates"
  on public.profiles for select
  using (
    id in (
      select om2.user_id from public.org_members om1
      join public.org_members om2 on om1.organization_id = om2.organization_id
      where om1.user_id = auth.uid()
    )
  );

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid());

-- 7c. org_members
alter table public.org_members enable row level security;

create policy "org_members_select"
  on public.org_members for select
  using (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid()
    )
  );

create policy "org_members_insert_admin"
  on public.org_members for insert
  with check (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "org_members_update_admin"
  on public.org_members for update
  using (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "org_members_delete_admin"
  on public.org_members for delete
  using (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- 7d. audit_logs — 읽기: admin 이상, 쓰기: service_role only (API에서 처리)
alter table public.audit_logs enable row level security;

create policy "audit_select_admin"
  on public.audit_logs for select
  using (
    organization_id in (
      select organization_id from public.org_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- audit_logs INSERT는 service_role key로만 수행 (RLS bypass)
-- 일반 사용자는 직접 insert 불가

-- ============================================================
-- 8. Helper function: 현재 사용자의 특정 조직 역할 조회
-- ============================================================
create or replace function public.get_my_role(org_id uuid)
returns public.org_role
language sql
security definer
stable
as $$
  select role from public.org_members
  where organization_id = org_id and user_id = auth.uid()
  limit 1;
$$;

-- ============================================================
-- Done! Phase 1 Sprint 1-1 Schema Complete
-- ============================================================
