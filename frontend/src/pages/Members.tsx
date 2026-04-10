/**
 * Members — 조직 멤버 관리 페이지.
 * 멤버 목록, 초대, 역할 변경, 멤버 제거.
 */
import { useEffect, useState, useCallback } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  listMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
} from "@/services/api";
import type { OrgMember, OrgRole } from "@/types";
import "./Admin.css";

const ROLES: OrgRole[] = ["owner", "admin", "member", "viewer"];
const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "소유자",
  admin: "관리자",
  member: "멤버",
  viewer: "뷰어",
};

function Members() {
  const { currentOrg, myRole } = useOrg();
  const { user } = useAuth();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 초대 폼
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("member");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  const isAdmin = myRole === "owner" || myRole === "admin";

  const loadMembers = useCallback(async () => {
    if (!currentOrg) return;
    try {
      setLoading(true);
      const data = await listMembers(currentOrg.id);
      setMembers(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "멤버 목록 로딩 실패");
    } finally {
      setLoading(false);
    }
  }, [currentOrg]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleInvite = async () => {
    if (!currentOrg || !inviteEmail.trim()) return;
    try {
      setInviting(true);
      setInviteMsg(null);
      await inviteMember(currentOrg.id, inviteEmail.trim(), inviteRole);
      setInviteEmail("");
      setInviteRole("member");
      setInviteMsg("초대 완료!");
      await loadMembers();
    } catch (e) {
      setInviteMsg(
        `초대 실패: ${e instanceof Error ? e.message : "알 수 없는 오류"}`
      );
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: OrgRole) => {
    if (!currentOrg) return;
    try {
      await updateMemberRole(currentOrg.id, userId, newRole);
      await loadMembers();
    } catch (e) {
      alert(`역할 변경 실패: ${e instanceof Error ? e.message : ""}`);
    }
  };

  const handleRemove = async (userId: string, email: string) => {
    if (!currentOrg) return;
    if (!confirm(`정말 ${email} 멤버를 제거하시겠습니까?`)) return;
    try {
      await removeMember(currentOrg.id, userId);
      await loadMembers();
    } catch (e) {
      alert(`멤버 제거 실패: ${e instanceof Error ? e.message : ""}`);
    }
  };

  if (!currentOrg) {
    return (
      <div className="admin-page">
        <h2>멤버 관리</h2>
        <p className="empty-state">소속된 조직이 없습니다. 먼저 조직을 생성해 주세요.</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <div>
          <h2>멤버 관리</h2>
          <p className="page-subtitle">{currentOrg.name} 조직의 멤버를 관리합니다</p>
        </div>
        <span className="member-count">{members.length}명</span>
      </div>

      {/* 초대 폼 */}
      {isAdmin && (
        <div className="card invite-section">
          <h3>멤버 초대</h3>
          <div className="invite-form">
            <input
              type="email"
              placeholder="이메일 주소 입력"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="input"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as OrgRole)}
              className="select"
            >
              {ROLES.filter((r) => r !== "owner").map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
            >
              {inviting ? "초대 중..." : "초대"}
            </button>
          </div>
          {inviteMsg && (
            <p
              className={`invite-msg ${inviteMsg.includes("실패") ? "error" : "success"}`}
            >
              {inviteMsg}
            </p>
          )}
        </div>
      )}

      {/* 멤버 목록 */}
      <div className="card">
        {loading ? (
          <p className="loading">로딩 중...</p>
        ) : error ? (
          <p className="error-text">{error}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>멤버</th>
                <th>이메일</th>
                <th>부서</th>
                <th>역할</th>
                {isAdmin && <th style={{ width: 80 }}>작업</th>}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const email = m.profile?.email ?? "—";
                const name = m.profile?.full_name ?? email.split("@")[0];
                const isMe = m.user_id === user?.id;
                const isOwner = m.role === "owner";
                return (
                  <tr key={m.user_id}>
                    <td>
                      <div className="member-cell">
                        {m.profile?.avatar_url && (
                          <img
                            src={m.profile.avatar_url}
                            alt=""
                            className="member-avatar"
                          />
                        )}
                        <span className="member-name">
                          {name}
                          {isMe && <span className="me-badge">나</span>}
                        </span>
                      </div>
                    </td>
                    <td className="text-muted">{email}</td>
                    <td className="text-muted">
                      {m.profile?.department ?? "—"}
                    </td>
                    <td>
                      {isAdmin && !isMe && !isOwner ? (
                        <select
                          value={m.role}
                          onChange={(e) =>
                            handleRoleChange(
                              m.user_id,
                              e.target.value as OrgRole
                            )
                          }
                          className="select select-sm"
                        >
                          {ROLES.filter((r) => r !== "owner").map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`role-tag role-${m.role}`}>
                          {ROLE_LABELS[m.role]}
                        </span>
                      )}
                    </td>
                    {isAdmin && (
                      <td>
                        {!isMe && !isOwner && (
                          <button
                            className="btn-icon danger"
                            onClick={() => handleRemove(m.user_id, email)}
                            title="멤버 제거"
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Members;
