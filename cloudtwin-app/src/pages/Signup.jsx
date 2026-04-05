import { useState, useContext } from "react";
import { AuthContext } from "../context/AuthContext";

export default function Signup({ onSwitchToLogin }) {
  const { signup } = useContext(AuthContext);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    company: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    const result = await signup(
      formData.email,
      formData.password,
      formData.fullName,
      formData.company
    );

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
            Cloud AI Onboarding
          </div>
          <h1 className="auth-title">
            Launch your <strong>cloud efficiency</strong> workspace
          </h1>
          <p className="auth-subtext">
            Create your account to unlock infrastructure recommendations, compare cloud providers, and model production workloads with confidence.
          </p>

          <div className="auth-feature-list">
            <p className="auth-feature-item">
              <span>1</span>
              Build and test deployment scenarios in minutes.
            </p>
            <p className="auth-feature-item">
              <span>2</span>
              Track pricing changes with live sync signals.
            </p>
            <p className="auth-feature-item">
              <span>3</span>
              Receive AI suggestions to avoid over-provisioning.
            </p>
          </div>
        </aside>

        <main className="auth-card">
          <div className="mb-5">
            <p className="text-sky-300 text-xs tracking-[0.14em] uppercase">Create Account</p>
            <h2 className="font-['Space_Grotesk'] text-3xl font-bold text-slate-100 mt-2">Join CloudTwin</h2>
            <p className="text-slate-400 text-sm mt-2">Start optimizing your cloud architecture today.</p>
          </div>

          {error && <div className="auth-alert mb-4">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="auth-field">
              <label className="auth-label">Full Name</label>
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                placeholder="John Doe"
                required
                className="auth-input"
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Email Address</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="you@example.com"
                required
                className="auth-input"
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Company (Optional)</label>
              <input
                type="text"
                name="company"
                value={formData.company}
                onChange={handleChange}
                placeholder="Your Company"
                className="auth-input"
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Password</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Minimum 6 characters"
                required
                className="auth-input"
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Confirm Password</label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Retype your password"
                required
                className="auth-input"
              />
            </div>

            <button type="submit" disabled={loading} className="auth-submit mt-2">
              {loading ? "Creating account..." : "Start With CloudTwin"}
            </button>
          </form>

          <p className="auth-switch">
            Already have access?{" "}
            <button type="button" onClick={onSwitchToLogin} className="auth-switch-btn">
              Return to login
            </button>
          </p>
        </main>
      </div>
    </div>
  );
}
