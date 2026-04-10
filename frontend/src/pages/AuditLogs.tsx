/**
 * AuditLogs — 감사 로그 뷰어 (Admin 전용).
 */
import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { listAuditLogs } from "@/services/api";
import type { AuditLog } from "@/types";
import "./Admin.css";

function AuditLogs() {
  const { currentOrg, myRole } = useOrg();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = myRole === "owner" || myRole === "admin";

  const loadLogs = useCallback(async () => {
    if (!currentOrg) return;
    try {
      setLoading(true);
      const data = await listAuditLogs(currentOrg.id, { limit: 50 });
      setLogs(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "감사 로그 로딩 실패");
    } finally {
      setLoading(false);
    }
  }, [currentOrg]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  if (!isAdmin) {
    return (
      <div className="admin-page">
        <h2>감사 로그</h2>
        <p className="empty-state">관리자 이상만 감사 로그를 열람할 수 있습니다.</p>
      </div>
    );
  }

  if (!currentOrg) {
    return (
      <div className="admin-page">
        <h2>감사 로그</h2>
        <p className="empty-state">소속된 조직이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h2>감사 로그</h2>
          <p className="page-subtitle">{currentOrg.name}의 활동 기록</p>
        </div>
        <button className="btn btn-secondary" onClick={loadLogs}>
          새로고침
        </button>
      </div>

      <div className="card">
        {loading ? (
          <p className="loading">로딩 중...</p>
        ) : error ? (
          <p className="error-text">{error}</p>
        ) : logs.length === 0 ? (
          <p className="empty-state">아직 기록된 활동이 없습니다.</p>
        ) : (
          <div className="audit-list">
            {logs.map((log) => (
              <div key={log.id} className="audit-item">
                <div className="audit-action">
                  <span className="audit-action-text">{log.action}</span>
                  {log.resource_type && (
                    <span className="audit-resource">
                      {log.resource_type}
                      {log.resource_id ? ` #${log.resource_id.slice(0, 8)}` : ""}
                    </span>
                  )}
                </div>
                <div className="audit-meta">
                  <span className="audit-user">
                    {log.profile?.full_name ?? log.profile?.email ?? log.user_id?.slice(0, 8) ?? "system"}
                  </span>
                  <span className="audit-time">
                    {new Date(log.created_at).toLocaleString("ko-KR")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AuditLogs;
