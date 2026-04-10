/**
 * OrgContext — 현재 선택된 조직 상태 관리.
 * 조직 목록 로드, 조직 전환, 현재 역할 제공.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { listOrganizations } from "@/services/api";
import type { OrgWithRole, OrgRole } from "@/types";

interface OrgState {
  organizations: OrgWithRole[];
  currentOrg: OrgWithRole | null;
  myRole: OrgRole | null;
  loading: boolean;
  error: string | null;
  switchOrg: (orgId: string) => void;
  refresh: () => Promise<void>;
}

const OrgContext = createContext<OrgState | undefined>(undefined);

const STORAGE_KEY = "smartwan_current_org";

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<OrgWithRole[]>([]);
  const [currentOrg, setCurrentOrg] = useState<OrgWithRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrgs = useCallback(async () => {
    if (!user) {
      setOrganizations([]);
      setCurrentOrg(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const orgs = await listOrganizations();
      setOrganizations(orgs);

      // 이전에 선택했던 org 복원 또는 첫 번째 org 선택
      const savedOrgId = localStorage.getItem(STORAGE_KEY);
      const saved = orgs.find((o) => o.id === savedOrgId);
      setCurrentOrg(saved ?? orgs[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조직 목록을 불러올 수 없습니다");
      // 에러 발생 시에도 빈 상태로 진행 (첫 로그인 시 조직이 없을 수 있음)
      setOrganizations([]);
      setCurrentOrg(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  const switchOrg = (orgId: string) => {
    const found = organizations.find((o) => o.id === orgId);
    if (found) {
      setCurrentOrg(found);
      localStorage.setItem(STORAGE_KEY, orgId);
    }
  };

  return (
    <OrgContext.Provider
      value={{
        organizations,
        currentOrg,
        myRole: currentOrg?.role ?? null,
        loading,
        error,
        switchOrg,
        refresh: loadOrgs,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used inside <OrgProvider>");
  return ctx;
}
