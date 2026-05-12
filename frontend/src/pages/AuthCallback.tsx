/**
 * AuthCallback — Supabase OAuth 콜백 처리 페이지.
 *
 * PKCE flow (?code=...) 와 implicit flow (#access_token=...) 둘 다 처리.
 * 성공 시 / 로, 실패 시 에러 메시지 + /login 으로.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const code = searchParams.get("code");
    const hasHashToken =
      typeof window !== "undefined" && window.location.hash.includes("access_token");
    const errParam = searchParams.get("error_description") || searchParams.get("error");

    if (errParam) {
      setError(decodeURIComponent(errParam));
      return;
    }

    const finish = (sessionExists: boolean, errMsg?: string) => {
      if (errMsg) {
        setError(errMsg);
        return;
      }
      if (!sessionExists) {
        setError("세션을 잡지 못했습니다. 다시 로그인해주세요.");
        return;
      }
      navigate("/", { replace: true });
    };

    if (code) {
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ data, error }) => {
          finish(Boolean(data?.session), error?.message);
        })
        .catch((e: unknown) => {
          finish(false, e instanceof Error ? e.message : "코드 교환 실패");
        });
    } else if (hasHashToken) {
      // Implicit flow: Supabase 클라이언트가 자동으로 hash 파싱 후 세션 셋업
      supabase.auth
        .getSession()
        .then(({ data, error }) => {
          finish(Boolean(data?.session), error?.message);
        })
        .catch((e: unknown) => {
          finish(false, e instanceof Error ? e.message : "세션 조회 실패");
        });
    } else {
      setError("인증 콜백 정보가 없습니다. 다시 로그인해주세요.");
    }
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>로그인 오류</h2>
          <p style={{ color: "#dc2626", fontSize: 13, lineHeight: 1.6 }}>{error}</p>
          <button
            onClick={() => navigate("/login", { replace: true })}
            style={{
              marginTop: 16,
              padding: "10px 18px",
              background: "#4338ca",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            로그인 화면으로
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={spinnerStyle} />
        <p style={{ marginTop: 16, color: "#64748b", fontSize: 13 }}>인증 처리 중…</p>
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  padding: "40px 32px",
  width: 380,
  textAlign: "center",
  boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
};

const spinnerStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  border: "3px solid #e2e8f0",
  borderTopColor: "#3b82f6",
  borderRadius: "50%",
  animation: "spin 0.8s linear infinite",
  margin: "0 auto",
};
