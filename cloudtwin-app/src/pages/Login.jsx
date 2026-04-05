import { useState, useContext } from "react";
import { AuthContext } from "../context/AuthContext";

export default function Login({ onSwitchToSignup }) {
  const { login } = useContext(AuthContext);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await login(email, password);
    if (!result.success) {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="auth-scene">
      <div className="auth-cloud auth-cloud-a" />
      <div className="auth-cloud auth-cloud-b" />

      <div className="auth-shell">
        <aside className="auth-story">
          <div className="auth-badge">
            <span className="auth-dot" />
            Cloud AI Control
          </div>
          <h1 className="auth-title">
            Navigate your cloud costs with <strong>real-time intelligence</strong>
          </h1>
          <p className="auth-subtext">
            Sign in to continue running deployment simulations, compare provider pricing, and receive architecture recommendations built for your workloads.
          </p>

          <div className="auth-feature-list">
            <p className="auth-feature-item">
              <span>1</span>
              Live pricing insights from major cloud providers.
            </p>
            <p className="auth-feature-item">
              <span>2</span>
              AI-backed sizing guidance for performance and cost.
            </p>
            <p className="auth-feature-item">
              <span>3</span>
              Scenario simulations for instant architecture decisions.
            </p>
          </div>
        </aside>

        <main className="auth-card">
          <div className="mb-6">
            <p className="text-sky-300 text-xs tracking-[0.14em] uppercase">Welcome Back</p>
            <h2 className="font-['Space_Grotesk'] text-3xl font-bold text-slate-100 mt-2">Log In to CloudTwin</h2>
            <p className="text-slate-400 text-sm mt-2">Your command center for cloud optimization.</p>
          </div>

          {error && <div className="auth-alert mb-4">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="auth-field">
              <label className="auth-label">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="auth-input"
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter secure password"
                required
                className="auth-input"
              />
            </div>

            <button type="submit" disabled={loading} className="auth-submit mt-2">
              {loading ? "Authenticating..." : "Enter Dashboard"}
            </button>
          </form>

          <p className="auth-switch">
            New to CloudTwin?{" "}
            <button type="button" onClick={onSwitchToSignup} className="auth-switch-btn">
              Create your account
            </button>
          </p>
        </main>
      </div>
    </div>
  );
}
