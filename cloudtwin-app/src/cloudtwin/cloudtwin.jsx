import { useState, useEffect, useRef } from "react";
import { callGroq } from "./api/groq";
import { CLOUD_PRICING } from "./data/cloudPricing";
import { runSimulation } from "./lib/simulation";
import { generateDeploymentCode } from "./lib/deployment";
import Icon from "./components/Icon";
import CloudBadge from "./components/CloudBadge";
import { S } from "./styles/appStyles";

const ALLOWED_VCPU = [1, 2, 4, 8, 16];
const ALLOWED_RAM = [1, 2, 4, 8, 16, 32, 64];
const ALLOWED_APP_TYPES = ["web", "api", "ml", "db", "batch"];
const ALLOWED_CLOUDS = ["all", "aws", "gcp", "azure"];

function pickNearest(value, options) {
  return options.reduce((best, current) => {
    return Math.abs(current - value) < Math.abs(best - value) ? current : best;
  }, options[0]);
}

function stripMarkdownJson(raw) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] || raw).trim();
}

function normalizeGeneratedForm(candidate, fallback) {
  const appType = ALLOWED_APP_TYPES.includes(candidate?.appType) ? candidate.appType : fallback.appType;
  const preferredCloud = ALLOWED_CLOUDS.includes(candidate?.preferredCloud)
    ? candidate.preferredCloud
    : fallback.preferredCloud;

  const vcpuRaw = Number(candidate?.vcpu);
  const ramRaw = Number(candidate?.ram);
  const trafficRaw = Number(candidate?.traffic);
  const budgetRaw = Number(candidate?.budget);
  const durationRaw = Number(candidate?.duration);

  return {
    appType,
    vcpu: Number.isFinite(vcpuRaw) ? pickNearest(Math.max(1, vcpuRaw), ALLOWED_VCPU) : fallback.vcpu,
    ram: Number.isFinite(ramRaw) ? pickNearest(Math.max(1, ramRaw), ALLOWED_RAM) : fallback.ram,
    traffic: Number.isFinite(trafficRaw) ? Math.max(100, Math.round(trafficRaw)) : fallback.traffic,
    budget: Number.isFinite(budgetRaw) ? Math.max(10, Math.round(budgetRaw)) : fallback.budget,
    duration: Number.isFinite(durationRaw) ? Math.max(1, Math.round(durationRaw)) : fallback.duration,
    preferredCloud,
  };
}

export default function CloudTwin() {
  const [tab, setTab] = useState("simulator");
  const [form, setForm] = useState({
    appType: "web",
    vcpu: 2,
    ram: 4,
    traffic: 1000,
    budget: 100,
    duration: 12,
    preferredCloud: "all",
  });
  const [simulating, setSimulating] = useState(false);
  const [results, setResults] = useState([]);
  const [selectedResult, setSelectedResult] = useState(null);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: "assistant", content: "Hi! I'm CloudTwin AI. Ask me anything about cloud infrastructure, AWS, GCP, Azure, Kubernetes, cost optimization, or deployment strategies." }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [pricingTs, setPricingTs] = useState("");
  const [aiScenario, setAiScenario] = useState("Build an API service for 20k users/month under $250 budget, low latency in US regions.");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiLastSummary, setAiLastSummary] = useState("");
  const [aiError, setAiError] = useState("");
  const chatEndRef = useRef(null);
  const [pricingData, setPricingData] = useState(null);

  useEffect(() => {
    // Simulate "fetching" real-time pricing
    setTimeout(() => {
      setPricingTs(new Date().toLocaleTimeString());
      setPricingData({ aws: 0.0104, gcp: 0.0076, azure: 0.0104 });
    }, 800);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const runAndSetSimulation = async (inputForm) => {
    setSimulating(true);
    setResults([]);
    setSelectedResult(null);
    setShowCode(false);
    await new Promise(r => setTimeout(r, 1800));
    const res = runSimulation(inputForm);
    setResults(res);
    setSelectedResult(res[0]);
    setSimulating(false);
  };

  const handleSimulate = async () => {
    await runAndSetSimulation(form);
  };

  const handleGenerateAndSimulate = async () => {
    if (!aiScenario.trim() || aiGenerating || simulating) return;
    setAiGenerating(true);
    setAiError("");
    try {
      const reply = await callGroq(
        [{ role: "user", content: aiScenario.trim() }],
        `You convert user cloud workload descriptions into simulator inputs.
Return ONLY JSON (no prose, no markdown) with this shape:
{
  "appType": "web|api|ml|db|batch",
  "vcpu": number,
  "ram": number,
  "traffic": number,
  "budget": number,
  "duration": number,
  "preferredCloud": "all|aws|gcp|azure",
  "summary": "short one-line assumption summary"
}
Rules:
- Use realistic values.
- Keep monthly budget in USD.
- Keep traffic as requests per minute.
- Prefer cloud="all" unless user strongly states a provider.`
      );

      const parsed = JSON.parse(stripMarkdownJson(reply));
      const generatedForm = normalizeGeneratedForm(parsed, form);
      setForm(generatedForm);
      setAiLastSummary(typeof parsed.summary === "string" ? parsed.summary : "AI generated a simulation profile from your prompt.");
      await runAndSetSimulation(generatedForm);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to generate simulation profile.";
      setAiError(msg);
    }
    setAiGenerating(false);
  };

  const handleCopyCode = () => {
    if (!selectedResult) return;
    const code = generateDeploymentCode(selectedResult, form);
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages(m => [...m, { role: "user", content: userMsg }]);
    setChatLoading(true);
    try {
      const reply = await callGroq(
        [{ role: "user", content: userMsg }],
        `You are CloudTwin AI, an expert cloud infrastructure assistant. You specialize in AWS, GCP, Azure, Kubernetes, Docker, Terraform, cost optimization, serverless, and DevOps. Be concise, technical, and helpful. Format code in plaintext without markdown symbols when possible.`
      );
      setChatMessages(m => [...m, { role: "assistant", content: reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error connecting to AI.";
      setChatMessages(m => [...m, { role: "assistant", content: msg }]);
    }
    setChatLoading(false);
  };

  const deployCode = selectedResult ? generateDeploymentCode(selectedResult, form) : "";

  // Pricing page data
  const allInstances = Object.entries(CLOUD_PRICING).flatMap(([cloud, insts]) =>
    Object.entries(insts).map(([name, spec]) => ({ cloud, name, ...spec }))
  ).sort((a, b) => a.price - b.price);

  return (
    <div style={S.app}>
      {/* Background grid */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0,
        backgroundImage: `
          linear-gradient(rgba(59,130,246,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(59,130,246,0.03) 1px, transparent 1px)
        `,
        backgroundSize: "40px 40px",
        pointerEvents: "none",
      }} />
      <div style={{
        position: "fixed",
        top: -200, left: "50%", transform: "translateX(-50%)",
        width: 800, height: 400,
        background: "radial-gradient(ellipse, rgba(59,130,246,0.12) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
      }} />

      {/* NAV */}
      <nav style={S.nav}>
        <div style={S.logo}>
          <Icon name="cloud" size={26} />
          <span>Cloud<span style={S.logoAccent}>Twin</span></span>
          <span style={{ fontSize: 10, background: "#3b82f6", color: "#fff", borderRadius: 4, padding: "1px 6px", fontWeight: 700, letterSpacing: 0.5 }}>BETA</span>
        </div>
        <div style={S.navTabs}>
          {[
            { id: "simulator", label: "Simulator" },
            { id: "pricing", label: "Live Pricing" },
            { id: "deploy", label: "Deploy Code" },
          ].map(t => (
            <button key={t.id} style={S.navTab(tab === t.id)} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#64748b" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: pricingTs ? "#22c55e" : "#64748b", display: "inline-block" }} />
          {pricingTs ? `Prices synced ${pricingTs}` : "Syncing prices..."}
        </div>
      </nav>

      {/* â”€â”€ SIMULATOR TAB â”€â”€ */}
      {tab === "simulator" && (
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={S.hero}>
            <div style={S.heroTag}>
              <Icon name="zap" size={12} />
              AI-Powered Cloud Optimization
            </div>
            <h1 style={S.heroTitle}>
              Find Your Perfect<br />Cloud Configuration
            </h1>
            <p style={S.heroSub}>
              Define your requirements. CloudTwin simulates thousands of configurations and recommends the most cost-efficient setup with real pricing data.
            </p>
          </div>

          <div style={S.grid}>
            {/* Left: Form */}
            <div>
              <div style={S.card}>
                <div style={S.cardTitle}><Icon name="server" size={14} /> Requirements</div>

                {[
                  { label: "Application Type", key: "appType", type: "select", opts: [
                    { v: "web", l: "Web Application" },
                    { v: "api", l: "REST API" },
                    { v: "ml", l: "ML / AI Workload" },
                    { v: "db", l: "Database Server" },
                    { v: "batch", l: "Batch Processing" },
                  ]},
                  { label: "vCPU Cores Needed", key: "vcpu", type: "select", opts: [1,2,4,8,16].map(v=>({v,l:`${v} vCPUs`})) },
                  { label: "RAM Required (GB)", key: "ram", type: "select", opts: [1,2,4,8,16,32,64].map(v=>({v,l:`${v} GB`})) },
                  { label: "Expected Traffic (req/min)", key: "traffic", type: "number" },
                  { label: "Monthly Budget (USD)", key: "budget", type: "number" },
                  { label: "Preferred Cloud Provider", key: "preferredCloud", type: "select", opts: [
                    { v: "all", l: "All Providers" },
                    { v: "aws", l: "Amazon AWS" },
                    { v: "gcp", l: "Google Cloud" },
                    { v: "azure", l: "Microsoft Azure" },
                  ]},
                ].map(field => (
                  <div key={field.key} style={{ marginBottom: 16 }}>
                    <label style={S.label}>{field.label}</label>
                    {field.type === "select" ? (
                      <select
                        style={S.select}
                        value={form[field.key]}
                        onChange={e => setForm(f => ({ ...f, [field.key]: isNaN(e.target.value) ? e.target.value : +e.target.value }))}
                      >
                        {field.opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                    ) : (
                      <input
                        type="number"
                        style={S.input}
                        value={form[field.key]}
                        onChange={e => setForm(f => ({ ...f, [field.key]: +e.target.value }))}
                      />
                    )}
                  </div>
                ))}

                <div style={{ marginTop: 8, marginBottom: 14 }}>
                  <label style={S.label}>Generate Inputs with AI</label>
                  <textarea
                    style={{
                      ...S.input,
                      minHeight: 88,
                      resize: "vertical",
                      paddingTop: 10,
                      lineHeight: 1.35,
                    }}
                    value={aiScenario}
                    onChange={e => setAiScenario(e.target.value)}
                    placeholder="Describe your workload and constraints, then let AI generate the simulation profile."
                  />
                  <button
                    style={{ ...S.btn("secondary"), marginTop: 10 }}
                    onClick={handleGenerateAndSimulate}
                    disabled={aiGenerating || simulating || !aiScenario.trim()}
                  >
                    {aiGenerating ? (
                      <>
                        <span style={{
                          width: 16, height: 16, border: "2px solid #3b82f640",
                          borderTopColor: "#3b82f6", borderRadius: "50%",
                          animation: "spin 0.8s linear infinite", display: "inline-block"
                        }} />
                        Generating Profile...
                      </>
                    ) : (
                      <><Icon name="star" size={15} /> Generate & Simulate</>
                    )}
                  </button>
                  {aiLastSummary && !aiError && (
                    <div style={{ marginTop: 10, fontSize: 12, color: "#93c5fd" }}>
                      AI assumptions: {aiLastSummary}
                    </div>
                  )}
                  {aiError && (
                    <div style={{ marginTop: 10, fontSize: 12, color: "#fca5a5" }}>
                      {aiError}
                    </div>
                  )}
                </div>

                <button
                  style={{ ...S.btn("primary"), marginTop: 8 }}
                  onClick={handleSimulate}
                  disabled={simulating || aiGenerating}
                >
                  {simulating ? (
                    <>
                      <span style={{
                        width: 16, height: 16, border: "2px solid #ffffff40",
                        borderTopColor: "#fff", borderRadius: "50%",
                        animation: "spin 0.8s linear infinite", display: "inline-block"
                      }} />
                      Simulating...
                    </>
                  ) : (
                    <><Icon name="zap" size={15} /> Run Simulation</>
                  )}
                </button>
              </div>

              {/* Quick Stats */}
              {results.length > 0 && (
                <div style={{ ...S.card, marginTop: 16 }}>
                  <div style={S.cardTitle}><Icon name="trending" size={14} /> Simulation Summary</div>
                  <div style={S.statsGrid}>
                    <div style={S.statCard}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#3b82f6" }}>{results.length}</div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Options Found</div>
                    </div>
                    <div style={S.statCard}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#22c55e" }}>${results[0]?.monthlyCost}</div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Best Price/mo</div>
                    </div>
                    <div style={S.statCard}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: "#f59e0b" }}>{results[0]?.score}%</div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Fit Score</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>
                    Compared across {Object.keys(CLOUD_PRICING).length} cloud providers
                  </div>
                </div>
              )}
            </div>

            {/* Right: Results */}
            <div>
              {results.length === 0 && !simulating && (
                <div style={{
                  ...S.card,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  minHeight: 400, textAlign: "center", color: "#64748b",
                }}>
                  <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>â˜</div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No simulation yet</div>
                  <div style={{ fontSize: 13 }}>Fill in your requirements and click Run Simulation</div>
                </div>
              )}

              {simulating && (
                <div style={{
                  ...S.card,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  minHeight: 400, gap: 20,
                }}>
                  {[
                    "Fetching real-time pricing...",
                    "Analyzing AWS instances...",
                    "Comparing GCP configurations...",
                    "Running cost simulation...",
                    "Ranking by efficiency...",
                  ].map((msg, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      opacity: 0.4 + i * 0.15,
                      animation: `fadeIn 0.3s ease ${i * 0.3}s both`,
                    }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: "#3b82f6",
                        animation: "pulse 1s ease infinite",
                        animationDelay: `${i * 0.2}s`,
                      }} />
                      <span style={{ fontSize: 13, color: "#8892b0" }}>{msg}</span>
                    </div>
                  ))}
                </div>
              )}

              {results.length > 0 && (
                <div>
                  <div style={{ ...S.cardTitle, color: "#64748b", fontSize: 12, marginBottom: 16, paddingLeft: 4 }}>
                    <Icon name="star" size={14} />
                    TOP CONFIGURATIONS â€” sorted by fit score
                  </div>
                  {results.map((r, i) => (
                    <div
                      key={`${r.cloud}-${r.instance}`}
                      style={{
                        ...S.resultCard(i),
                        border: selectedResult?.instance === r.instance && selectedResult?.cloud === r.cloud
                          ? "1px solid #3b82f6"
                          : S.resultCard(i).border,
                      }}
                      onClick={() => { setSelectedResult(r); setShowCode(false); }}
                    >
                      {i === 0 && (
                        <div style={{
                          position: "absolute", top: -1, right: 16,
                          background: "linear-gradient(135deg, #3b82f6, #6366f1)",
                          color: "#fff", fontSize: 10, fontWeight: 700,
                          padding: "2px 10px", borderRadius: "0 0 8px 8px",
                          letterSpacing: 1,
                        }}>â­ BEST MATCH</div>
                      )}

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <CloudBadge cloud={r.cloud} />
                            <span style={{ fontSize: 16, fontWeight: 800, color: "#fff", fontFamily: "monospace" }}>
                              {r.instance}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: "#64748b" }}>
                            {r.spec.vcpu} vCPU Â· {r.spec.ram}GB RAM Â· {r.spec.storage}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 22, fontWeight: 900, color: "#22c55e" }}>${r.monthlyCost}<span style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>/mo</span></div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>${r.annualCost}/yr</div>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                        <div style={S.metric}>
                          <span style={S.metricVal}>{r.score}%</span>
                          <span style={S.metricLabel}>Fit Score</span>
                        </div>
                        <div style={S.metric}>
                          <span style={S.metricVal}>{r.latency}ms</span>
                          <span style={S.metricLabel}>Latency</span>
                        </div>
                        <div style={S.metric}>
                          <span style={S.metricVal}>{r.utilization}%</span>
                          <span style={S.metricLabel}>CPU Util</span>
                        </div>
                        <div style={S.metric}>
                          <span style={S.metricVal}>{r.throughput}</span>
                          <span style={S.metricLabel}>req/min</span>
                        </div>
                      </div>

                      <div style={S.scoreBar(r.score)} />

                      {r.savings > 0 && (
                        <div style={{ ...S.tag("#22c55e"), marginTop: 10, display: "inline-block", fontSize: 11 }}>
                          Saves ${r.savings.toFixed(2)}/mo vs budget
                        </div>
                      )}
                    </div>
                  ))}

                  {selectedResult && (
                    <button
                      style={{ ...S.btn("primary"), marginTop: 8 }}
                      onClick={() => { setShowCode(true); setTab("deploy"); }}
                    >
                      <Icon name="code" size={15} />
                      Generate Terraform for {selectedResult.instance}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ PRICING TAB â”€â”€ */}
      {tab === "pricing" && (
        <div style={{ position: "relative", zIndex: 1, padding: "40px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Live Cloud Pricing</h2>
            <p style={{ color: "#64748b", marginBottom: 30, fontSize: 14 }}>
              Approximate hourly on-demand rates. Last synced: {pricingTs || "syncing..."}
            </p>

            {["aws", "gcp", "azure"].map(cloud => (
              <div key={cloud} style={{ ...S.card, marginBottom: 20 }}>
                <div style={S.cardTitle}>
                  <CloudBadge cloud={cloud} />
                  <span style={{ marginLeft: 8 }}>
                    {cloud === "aws" ? "Amazon Web Services" : cloud === "gcp" ? "Google Cloud Platform" : "Microsoft Azure"}
                  </span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1e2a4a" }}>
                        {["Instance", "vCPU", "RAM", "$/hr", "$/mo (730h)", "Storage"].map(h => (
                          <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "#64748b", fontWeight: 600, fontSize: 11, letterSpacing: 0.5 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(CLOUD_PRICING[cloud]).map(([name, spec], i) => (
                        <tr key={name} style={{ borderBottom: "1px solid #0d1224", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                          <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#93c5fd", fontWeight: 600 }}>{name}</td>
                          <td style={{ padding: "10px 12px", color: "#e8eaf6" }}>{spec.vcpu}</td>
                          <td style={{ padding: "10px 12px", color: "#e8eaf6" }}>{spec.ram} GB</td>
                          <td style={{ padding: "10px 12px", color: "#22c55e", fontWeight: 700 }}>${spec.price.toFixed(4)}</td>
                          <td style={{ padding: "10px 12px", color: "#22c55e", fontWeight: 700 }}>${(spec.price * 730).toFixed(2)}</td>
                          <td style={{ padding: "10px 12px", color: "#64748b" }}>{spec.storage}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            <div style={{ ...S.card, background: "rgba(59,130,246,0.05)", border: "1px solid #3b82f630" }}>
              <div style={{ display: "flex", gap: 10, color: "#60a5fa", fontSize: 13 }}>
                <Icon name="info" size={16} />
                <span>Pricing shown is approximate on-demand rates for US regions. Spot/preemptible instances can save 60-90%. Reserved instances save 30-40%. For production deployments, always verify current pricing at your cloud provider's pricing calculator.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ DEPLOY TAB â”€â”€ */}
      {tab === "deploy" && (
        <div style={{ position: "relative", zIndex: 1, padding: "40px" }}>
          <div style={{ maxWidth: 1000, margin: "0 auto" }}>
            <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Deployment Code</h2>
            <p style={{ color: "#64748b", marginBottom: 30, fontSize: 14 }}>
              Production-ready Terraform configuration, generated from your simulation results.
            </p>

            {!selectedResult ? (
              <div style={{ ...S.card, textAlign: "center", padding: 60, color: "#64748b" }}>
                <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>{"</>"}</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No configuration selected</div>
                <div style={{ fontSize: 13, marginBottom: 24 }}>Run a simulation first to generate deployment code</div>
                <button style={{ ...S.btn("secondary"), width: "auto", margin: "0 auto" }} onClick={() => setTab("simulator")}>
                  Go to Simulator
                </button>
              </div>
            ) : (
              <>
                {/* Selected instance summary */}
                <div style={{ ...S.card, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                    <CloudBadge cloud={selectedResult.cloud} />
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: "#fff" }}>{selectedResult.instance}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{selectedResult.spec.vcpu} vCPU Â· {selectedResult.spec.ram}GB RAM</div>
                    </div>
                    <div style={{ ...S.tag("#22c55e"), fontSize: 13 }}>Score: {selectedResult.score}%</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#22c55e" }}>${selectedResult.monthlyCost}/mo</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>~${selectedResult.annualCost}/yr</div>
                  </div>
                </div>

                {/* Other results as chips */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                  {results.map((r, i) => (
                    <button
                      key={`${r.cloud}-${r.instance}`}
                      onClick={() => setSelectedResult(r)}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 8,
                        border: selectedResult?.instance === r.instance && selectedResult?.cloud === r.cloud
                          ? "1px solid #3b82f6" : "1px solid #1e2a4a",
                        background: selectedResult?.instance === r.instance && selectedResult?.cloud === r.cloud
                          ? "#3b82f620" : "transparent",
                        color: "#e8eaf6",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: "monospace",
                      }}
                    >
                      {r.cloud.toUpperCase()} {r.instance}
                    </button>
                  ))}
                </div>

                {/* Code block */}
                <div style={{ position: "relative" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>main.tf â€” Terraform</span>
                    <button
                      onClick={handleCopyCode}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        background: copied ? "#22c55e20" : "#3b82f620",
                        border: `1px solid ${copied ? "#22c55e40" : "#3b82f640"}`,
                        color: copied ? "#22c55e" : "#3b82f6",
                        borderRadius: 8, padding: "6px 14px",
                        cursor: "pointer", fontSize: 12, fontWeight: 600,
                      }}
                    >
                      <Icon name={copied ? "check" : "copy"} size={13} />
                      {copied ? "Copied!" : "Copy Code"}
                    </button>
                  </div>
                  <div style={S.codeBlock}>
                    {generateDeploymentCode(selectedResult, form)}
                  </div>
                </div>

                {/* Instructions */}
                <div style={{ ...S.card, marginTop: 20 }}>
                  <div style={S.cardTitle}><Icon name="info" size={14} /> Deployment Steps</div>
                  {[
                    "Install Terraform: brew install terraform / apt install terraform",
                    "Configure cloud credentials (aws configure / gcloud auth / az login)",
                    "Save the code above as main.tf in a new directory",
                    "Run: terraform init  â†’  terraform plan  â†’  terraform apply",
                    "Your instance will be live in ~2 minutes",
                  ].map((step, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: "50%",
                        background: "#3b82f620", border: "1px solid #3b82f640",
                        color: "#3b82f6", fontSize: 11, fontWeight: 800,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, marginTop: 1,
                      }}>{i + 1}</div>
                      <div style={{ fontSize: 13, color: "#8892b0", fontFamily: "monospace", lineHeight: 1.6 }}>{step}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* â”€â”€ CHAT FAB â”€â”€ */}
      <button style={S.chatFab} onClick={() => setChatOpen(o => !o)}>
        <Icon name={chatOpen ? "x" : "chat"} size={22} />
      </button>

      {/* â”€â”€ CHAT WINDOW â”€â”€ */}
      <div style={S.chatWindow(chatOpen)}>
        <div style={S.chatHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "linear-gradient(135deg, #3b82f6, #6366f1)",
              display: "flex", alignItems: "center", justifyContent: "center"
            }}>
              <Icon name="bot" size={16} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>CloudTwin AI</div>
              <div style={{ fontSize: 10, color: "#22c55e" }}>â— Online Â· Powered by Groq</div>
            </div>
          </div>
          <button onClick={() => setChatOpen(false)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer" }}>
            <Icon name="minimize" size={16} />
          </button>
        </div>

        <div style={S.chatMessages}>
          {chatMessages.map((msg, i) => (
            <div key={i} style={S.chatMsg(msg.role)}>
              {msg.content}
            </div>
          ))}
          {chatLoading && (
            <div style={S.chatMsg("assistant")}>
              <span style={{ opacity: 0.6 }}>Thinking</span>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  display: "inline-block", width: 4, height: 4,
                  borderRadius: "50%", background: "#60a5fa",
                  margin: "0 2px", animation: "bounce 0.6s ease infinite",
                  animationDelay: `${i * 0.15}s`,
                }} />
              ))}
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div style={S.chatInput}>
          <textarea
            style={S.chatField}
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            placeholder="Ask about AWS, GCP, Kubernetes..."
            rows={1}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChat(); } }}
          />
          <button style={S.chatSend} onClick={handleChat} disabled={chatLoading}>
            <Icon name="send" size={15} />
          </button>
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800;900&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        @keyframes bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        select option { background: #0d1224; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e2a4a; border-radius: 3px; }
        textarea { resize: none; }
      `}</style>
    </div>
  );
}
