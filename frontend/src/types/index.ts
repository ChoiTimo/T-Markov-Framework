/**
 * SmartWAN Platform — 공통 타입 정의
 */

export type OrgRole = "owner" | "admin" | "member" | "viewer";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  department: string | null;
  job_title: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  user_id: string;
  organization_id: string;
  role: OrgRole;
  joined_at: string;
  updated_at: string;
  profile?: Profile;
}

export interface AuditLog {
  id: string;
  organization_id: string;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
  profile?: Pick<Profile, "email" | "full_name" | "avatar_url">;
}

export interface OrgWithRole extends Organization {
  role: OrgRole;
}
