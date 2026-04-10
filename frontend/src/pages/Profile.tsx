/**
 * Profile — 내 프로필 편집 페이지.
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getMyProfile, updateMyProfile } from "@/services/api";
import type { Profile as ProfileType } from "@/types";
import "./Admin.css";

function Profile() {
  const { user } = useAuth();
  const [_profile, setProfile] = useState<ProfileType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 편집 필드
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [jobTitle, setJobTitle] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const p = await getMyProfile();
        setProfile(p);
        setFullName(p.full_name ?? "");
        setPhone(p.phone ?? "");
        setDepartment(p.department ?? "");
        setJobTitle(p.job_title ?? "");
      } catch {
        // 프로필이 아직 없을 수 있음 (첫 로그인)
        setFullName(user?.user_metadata?.full_name ?? "");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setMsg(null);
      const updated = await updateMyProfile({
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
        department: department.trim() || null,
        job_title: jobTitle.trim() || null,
      });
      setProfile(updated);
      setMsg("저장 완료!");
    } catch (e) {
      setMsg(`저장 실패: ${e instanceof Error ? e.message : ""}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-page">
        <h2>내 프로필</h2>
        <p className="loading">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <h2>내 프로필</h2>
      </div>

      {/* 기본 정보 (Google에서 가져온) */}
      <div className="card">
        <h3>계정 정보</h3>
        <div className="profile-account">
          {user?.user_metadata?.avatar_url && (
            <img
              src={user.user_metadata.avatar_url}
              alt=""
              className="profile-avatar"
            />
          )}
          <div>
            <div className="profile-email">{user?.email}</div>
            <div className="text-muted" style={{ fontSize: 12 }}>
              Google 계정으로 로그인됨
            </div>
          </div>
        </div>
      </div>

      {/* 편집 가능 정보 */}
      <div className="card" style={{ maxWidth: 560 }}>
        <h3>프로필 정보</h3>

        <div className="form-group">
          <label className="form-label">이름</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="홍길동"
            className="input"
          />
        </div>

        <div className="form-group">
          <label className="form-label">연락처</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="010-0000-0000"
            className="input"
          />
        </div>

        <div className="form-group">
          <label className="form-label">부서</label>
          <input
            type="text"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="예: Enterprise Sales"
            className="input"
          />
        </div>

        <div className="form-group">
          <label className="form-label">직책</label>
          <input
            type="text"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="예: 매니저"
            className="input"
          />
        </div>

        <div className="form-actions">
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "저장 중..." : "프로필 저장"}
          </button>
          {msg && (
            <span
              className={`form-msg ${msg.includes("실패") ? "error" : "success"}`}
            >
              {msg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default Profile;
