/**
 * Login page — Google SSO via Supabase Auth.
 */
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

function Login() {
  const { user, loading, signInWithGoogle } = useAuth();

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.spinner} />
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logoSection}>
          <h1 style={styles.logo}>SmartWAN</h1>
          <p style={styles.subtitle}>Platform</p>
        </div>

        <button
          onClick={signInWithGoogle}
          style={styles.googleBtn}
          onMouseOver={(e) =>
            (e.currentTarget.style.background = "#f1f5f9")
          }
          onMouseOut={(e) =>
            (e.currentTarget.style.background = "#fff")
          }
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.03 24.03 0 0 0 0 21.56l7.98-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
          </svg>
          <span>Google 계정으로 로그인</span>
        </button>

        <p style={styles.footer}>
          조직 관리자가 초대한 Google 계정으로 로그인하세요
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
  },
  card: {
    background: "#fff",
    borderRadius: 16,
    padding: "48px 40px",
    width: 380,
    textAlign: "center",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  },
  logoSection: {
    marginBottom: 40,
  },
  logo: {
    fontSize: 32,
    fontWeight: 700,
    color: "#0f172a",
    margin: 0,
    letterSpacing: "-0.5px",
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    margin: "4px 0 0",
    letterSpacing: "2px",
    textTransform: "uppercase" as const,
  },
  googleBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    width: "100%",
    padding: "14px 24px",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    background: "#fff",
    fontSize: 15,
    fontWeight: 500,
    color: "#334155",
    cursor: "pointer",
    transition: "background 0.2s",
  },
  footer: {
    marginTop: 24,
    fontSize: 12,
    color: "#94a3b8",
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid #e2e8f0",
    borderTopColor: "#3b82f6",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    margin: "0 auto",
  },
};

export default Login;
