/**
 * CreateOrg — 새 조직 생성 페이지.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/contexts/OrgContext";
import { createOrganization } from "@/services/api";
import "./Admin.css";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .replace(/[\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function CreateOrg() {
  const navigate = useNavigate();
  const { refresh } = useOrg();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slugEdited) {
      setSlug(slugify(val));
    }
  };

  const handleCreate = async () => {
    if (!name.trim() || !slug.trim()) return;
    try {
      setCreating(true);
      setError(null);
      await createOrganization({ name: name.trim(), slug: slug.trim() });
      await refresh();
      navigate("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "조직 생성 실패");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="admin-page">
      <div className="page-header">
        <h2>새 조직 만들기</h2>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="form-group">
          <label className="form-label">조직 이름</label>
          <input
            type="text"
            placeholder="예: SKT SmartWAN팀"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="input"
            autoFocus
          />
        </div>

        <div className="form-group">
          <label className="form-label">Slug (URL 식별자)</label>
          <input
            type="text"
            placeholder="예: skt-smartwan"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugEdited(true);
            }}
            className="input"
          />
          <p className="form-hint">
            영문, 숫자, 하이픈만 사용 가능합니다. 나중에 변경할 수 없습니다.
          </p>
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="form-actions">
          <button
            className="btn btn-secondary"
            onClick={() => navigate("/")}
          >
            취소
          </button>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={creating || !name.trim() || !slug.trim()}
          >
            {creating ? "생성 중..." : "조직 만들기"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateOrg;
