/**
 * OrgSettings — 조직 설정 페이지.
 * 조직 이름 변경, 기본 정보 관리.
 */
import { useEffect, useState } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { updateOrganization } from "@/services/api";
import "./Admin.css";

function OrgSettings() {
  const { currentOrg, myRole, refresh } = useOrg();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const isAdmin = myRole === "owner" || myRole === "admin";

  useEffect(() => {
    if (currentOrg) {
      setName(currentOrg.name);
    }
  }, [currentOrg]);

  const handleSave = async () => {
    if (!currentOrg || !name.trim()) return;
    try {
      setSaving(true);
      setMsg(null);
      await updateOrganization(currentOrg.id, { name: name.trim() });
      await refresh();
      setMsg("저장 완료!");
    } catch (e) {
      setMsg(`저장 실패: ${e instanceof Error ? e.message : ""}`);
    } finally {
      setSaving(false);
    }
  };

  if (!currentOrg) {
    return (
      <div className="admin-page">
        <h2>조직 설정</h2>
        <p className="empty-state">소속된 조직이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h2>조직 설정</h2>
          <p className="page-subtitle">{currentOrg.name}의 기본 정보를 관리합니다</p>
        </div>
      </div>

      <div className="card">
        <h3>기본 정보</h3>
        <div className="form-group">
          <label className="form-label">조직 이름</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            disabled={!isAdmin}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Slug (URL 식별자)</label>
          <input
            type="text"
            value={currentOrg.slug}
            className="input"
            disabled
          />
          <p className="form-hint">Slug는 변경할 수 없습니다</p>
        </div>

        <div className="form-group">
          <label className="form-label">생성일</label>
          <input
            type="text"
            value={new Date(currentOrg.created_at).toLocaleDateString("ko-KR")}
            className="input"
            disabled
          />
        </div>

        {isAdmin && (
          <div className="form-actions">
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || name === currentOrg.name}
            >
              {saving ? "저장 중..." : "변경사항 저장"}
            </button>
            {msg && (
              <span
                className={`form-msg ${msg.includes("실패") ? "error" : "success"}`}
              >
                {msg}
              </span>
            )}
          </div>
        )}

        {!isAdmin && (
          <p className="info-text">조직 설정 변경은 관리자 이상만 가능합니다.</p>
        )}
      </div>

      {/* 위험 영역 */}
      {myRole === "owner" && (
        <div className="card danger-zone">
          <h3>위험 영역</h3>
          <p className="text-muted">
            조직을 삭제하면 모든 데이터가 영구적으로 제거됩니다. 이 작업은 되돌릴 수 없습니다.
          </p>
          <button className="btn btn-danger" disabled>
            조직 삭제 (추후 지원)
          </button>
        </div>
      )}
    </div>
  );
}

export default OrgSettings;
