import { useState, useEffect, useRef } from "react";
import { callGroq } from "./api/groq";
import { fetchLivePricingCatalog } from "./api/pricing";
import { CLOUD_PRICING } from "./data/cloudPricing";
import { runSimulation } from "./lib/simulation";
import { generateDeploymentCode } from "./lib/deployment";
import Icon from "./components/Icon";
import CloudBadge from "./components/CloudBadge";

const LIVE_REFRESH_MS = 6 * 60 * 60 * 1000;

const ALLOWED_VCPU = [1, 2, 4, 8, 16];
const ALLOWED_RAM = [1, 2, 4, 8, 16, 32, 64];
const ALLOWED_APP_TYPES = ["web", "api", "ml", "db", "batch"];
const ALLOWED_CLOUDS = ["all", "aws", "gcp", "azure"];

const DUMMY_ANALYTICS = {
  generatedAt: "2026-04-02T10:30:00Z",
  kpis: {
    avgResponseMs: 142,
    p95LatencyMs: 268,
    uptimePct: 99.94,
    monthlyEstimate: 218.42,
  },
  monthlyCostByCloud: [
    { cloud: "AWS", value: 236.5 },
    { cloud: "GCP", value: 214.2 },
    { cloud: "Azure", value: 205.7 },
  ],
  trafficTrend: [
    { month: "Jan", requestsK: 124 },
    { month: "Feb", requestsK: 138 },
    { month: "Mar", requestsK: 146 },
    { month: "Apr", requestsK: 159 },
    { month: "May", requestsK: 172 },
    { month: "Jun", requestsK: 181 },
    { month: "Jul", requestsK: 196 },
    { month: "Aug", requestsK: 208 },
    { month: "Sep", requestsK: 221 },
    { month: "Oct", requestsK: 234 },
    { month: "Nov", requestsK: 246 },
    { month: "Dec", requestsK: 259 },
  ],
  latencyByRegion: [
    { region: "us-east", p50: 88, p95: 158 },
    { region: "us-west", p50: 102, p95: 186 },
    { region: "eu-west", p50: 131, p95: 229 },
    { region: "ap-south", p50: 149, p95: 262 },
  ],
  incidentMix: [
    { label: "Low", value: 48, color: "#38bdf8" },
    { label: "Medium", value: 31, color: "#f59e0b" },
    { label: "High", value: 15, color: "#f97316" },
    { label: "Critical", value: 6, color: "#ef4444" },
  ],
};

const DASHBOARD_SAMPLE = {
  tenant: {
    orgName: "CloudNova Retail",
    accountId: "acct_demo_1024",
    plan: "Growth",
    region: "us-east",
    usersActive: 27,
    owner: "Ava Johnson",
  },
  health: {
    overall: "Healthy",
    score: 91,
    alertsOpen: 3,
    deploymentsThisMonth: 14,
    infraCostMtd: 1729.43,
    budgetUtilizationPct: 68,
  },
  environments: [
    { name: "Production", cloud: "aws", status: "Healthy", services: 12, latencyMs: 128 },
    { name: "Staging", cloud: "azure", status: "Warning", services: 8, latencyMs: 173 },
    { name: "Development", cloud: "gcp", status: "Healthy", services: 16, latencyMs: 149 },
  ],
  recentDeployments: [
    { id: "dep_4481", service: "checkout-api", env: "Production", cloud: "aws", status: "Succeeded", at: "09:40" },
    { id: "dep_4477", service: "search-worker", env: "Staging", cloud: "azure", status: "Succeeded", at: "08:15" },
    { id: "dep_4474", service: "catalog-ui", env: "Development", cloud: "gcp", status: "Failed", at: "07:28" },
  ],
  customerProfiles: [
    { customerId: "cus_1001", name: "Northwind Stores", tier: "Enterprise", spendMtd: 12340, lastLogin: "2h ago" },
    { customerId: "cus_1002", name: "BluePeak Health", tier: "Business", spendMtd: 6480, lastLogin: "5h ago" },
    { customerId: "cus_1003", name: "NovaLearn", tier: "Starter", spendMtd: 1310, lastLogin: "1d ago" },
    { customerId: "cus_1004", name: "Urban Cart", tier: "Business", spendMtd: 5820, lastLogin: "3d ago" },
  ],
};

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

const cardClass = "rounded-2xl border border-slate-800/70 bg-slate-900/70 shadow-[0_12px_45px_-22px_rgba(37,99,235,0.7)] backdrop-blur";
const inputClass = "w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-sky-400";
const labelClass = "mb-1.5 block text-xs font-semibold tracking-wide text-slate-400";

function buildCloudContext(form, selectedResult) {
  const base = [
    `App type: ${form.appType}`,
    `Requested vCPU: ${form.vcpu}`,
    `Requested RAM (GB): ${form.ram}`,
    `Traffic req/min: ${form.traffic}`,
    `Monthly budget USD: ${form.budget}`,
    `Preferred cloud: ${form.preferredCloud}`,
  ];

  if (!selectedResult) {
    return `${base.join(" | ")} | No simulation result selected yet.`;
  }

  return `${base.join(" | ")} | Selected result: ${selectedResult.cloud.toUpperCase()} ${selectedResult.instance} | Monthly: $${selectedResult.monthlyCost} | Latency: ${selectedResult.latency}ms | Score: ${selectedResult.score}%`;
}

function buildCloudSystemPrompt(form, selectedResult) {
  return `You are CloudTwin AI, a specialist assistant for cloud and AI engineering.

Focus areas:
- Cloud architecture (AWS, GCP, Azure), Kubernetes, containers, IaC, networking basics.
- AI workload sizing, GPU/CPU selection guidance, inference and training deployment patterns.
- Cost optimization, performance tuning, reliability, observability, security best practices.

Behavior:
- Prioritize practical answers for architecture and implementation.
- If the user asks for recommendation, provide 2-3 options with tradeoffs.
- Give concise step-by-step guidance when asked how to do something.
- Use short sections: Recommendation, Why, Next Steps.
- If user asks unrelated non-tech topics, briefly steer back to cloud/AI domain.
- Do not invent exact cloud prices; label estimates clearly.

Current app context:
${buildCloudContext(form, selectedResult)}`;
}

export default function CloudTwin() {
  const [tab, setTab] = useState("dashboard");
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
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    {
      role: "assistant",
      content:
        "Hi, I am CloudTwin AI. Ask me about cloud architecture, AI workloads, cost optimization, Kubernetes, Terraform, or deployment strategy.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [pricingTs, setPricingTs] = useState("");
  const [pricingData, setPricingData] = useState(CLOUD_PRICING);
  const [pricingSource, setPricingSource] = useState({ aws: "fallback", gcp: "fallback", azure: "fallback" });
  const [aiScenario, setAiScenario] = useState(
    "Build an API service for 20k users per month with low latency in US regions under $250 budget."
  );
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiLastSummary, setAiLastSummary] = useState("");
  const [aiError, setAiError] = useState("");
  const chatEndRef = useRef(null);

  useEffect(() => {
    let active = true;

    const loadPricing = async () => {
      const attemptTs = new Date().toLocaleTimeString();
      const live = await fetchLivePricingCatalog().catch(() => null);
      if (!active) return;

      setPricingTs(attemptTs);
      if (!live) return;

      setPricingData(live.catalog);
      setPricingSource(live.status);
    };

    loadPricing();
    const timer = setInterval(loadPricing, LIVE_REFRESH_MS);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const runAndSetSimulation = async (inputForm) => {
    setSimulating(true);
    setResults([]);
    setSelectedResult(null);
    await new Promise((r) => setTimeout(r, 1400));
    const res = runSimulation(inputForm, pricingData);
    setResults(res);
    setSelectedResult(res[0]);
    setSimulating(false);
  };

  const sourceLabel = (cloud) => {
    const mode = pricingSource[cloud];
    if (mode === "live") return "Live API";
    if (mode === "partial-live") return "Partial API";
    return "Fallback Data";
  };

  const hasAnyLiveSource = Object.values(pricingSource).some((mode) => mode === "live" || mode === "partial-live");

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
- Prefer cloud=all unless user strongly states a provider.`
      );

      const parsed = JSON.parse(stripMarkdownJson(reply));
      const generatedForm = normalizeGeneratedForm(parsed, form);
      setForm(generatedForm);
      setAiLastSummary(
        typeof parsed.summary === "string"
          ? parsed.summary
          : "AI generated a simulation profile from your prompt."
      );
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
      setTimeout(() => setCopied(false), 1600);
    });
  };

  const handleChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages((m) => [...m, { role: "user", content: userMsg }]);
    setChatLoading(true);
    try {
      const reply = await callGroq(
        [{ role: "user", content: userMsg }],
        buildCloudSystemPrompt(form, selectedResult)
      );
      setChatMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error connecting to AI.";
      setChatMessages((m) => [...m, { role: "assistant", content: msg }]);
    }
    setChatLoading(false);
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden text-slate-100">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_18%_5%,rgba(56,189,248,0.2),transparent_42%),radial-gradient(circle_at_80%_15%,rgba(59,130,246,0.22),transparent_38%),linear-gradient(180deg,#030712_0%,#071126_100%)]" />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[linear-gradient(to_right,rgba(56,189,248,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(56,189,248,0.07)_1px,transparent_1px)] bg-[size:42px_42px] opacity-25" />
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="cloud-drift cloud-drift-1" />
        <div className="cloud-drift cloud-drift-2" />
        <div className="cloud-drift cloud-drift-3" />
        <div className="vapor-sweep" />
      </div>

      <nav className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div className="flex items-center gap-2.5 text-xl font-bold tracking-tight">
            <Icon name="cloud" size={22} />
            <span className="font-[Space_Grotesk]">Cloud</span>
            <span className="font-[Space_Grotesk] text-sky-400">Twin</span>
            <span className="rounded-md border border-sky-400/40 bg-sky-400/20 px-2 py-0.5 text-[10px] font-bold tracking-[0.14em] text-sky-200">
              BETA
            </span>
          </div>

          <div className="flex rounded-xl border border-slate-700 bg-slate-900/80 p-1 text-sm">
            {[
              { id: "dashboard", label: "Dashboard" },
              { id: "simulator", label: "Simulator" },
              { id: "pricing", label: "Live Pricing" },
              { id: "deploy", label: "Deploy Code" },
              { id: "analysis", label: "Stat Analysis" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-3.5 py-2 font-semibold transition ${tab === t.id
                  ? "bg-sky-500 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                  }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
            <span className={`h-2 w-2 rounded-full ${hasAnyLiveSource ? "bg-emerald-400" : pricingTs ? "bg-amber-400" : "bg-slate-600"}`} />
            {pricingTs
              ? `${hasAnyLiveSource ? "Prices synced" : "Fallback (API blocked)"} ${pricingTs}`
              : "Syncing prices..."}
          </div>
        </div>
      </nav>

      {tab === "dashboard" && (
        <section className="mx-auto max-w-7xl px-4 pb-14 pt-10 md:px-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-[Space_Grotesk] text-3xl font-bold tracking-tight text-white">Control Dashboard</h2>
              <p className="mt-2 text-sm text-slate-400">
                Multi-tenant overview with sample customer data. Future-ready for MongoDB login and user-specific dashboards.
              </p>
            </div>
            <button
              onClick={() => setTab("simulator")}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
            >
              <Icon name="zap" size={14} />
              Open Simulator
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DashboardKpi title="Tenant" value={DASHBOARD_SAMPLE.tenant.orgName} meta={`${DASHBOARD_SAMPLE.tenant.plan} Plan`} tone="sky" />
            <DashboardKpi title="System Health" value={`${DASHBOARD_SAMPLE.health.score}%`} meta={DASHBOARD_SAMPLE.health.overall} tone="emerald" />
            <DashboardKpi
              title="Infra Cost MTD"
              value={`$${DASHBOARD_SAMPLE.health.infraCostMtd.toFixed(2)}`}
              meta={`${DASHBOARD_SAMPLE.health.budgetUtilizationPct}% budget used`}
              tone="amber"
            />
            <DashboardKpi
              title="Open Alerts"
              value={`${DASHBOARD_SAMPLE.health.alertsOpen}`}
              meta={`${DASHBOARD_SAMPLE.health.deploymentsThisMonth} deployments this month`}
              tone="fuchsia"
            />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className={`${cardClass} p-5`}>
              <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                <Icon name="server" size={13} /> Environment Status Board
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-2">Environment</th>
                      <th className="px-3 py-2">Cloud</th>
                      <th className="px-3 py-2">Services</th>
                      <th className="px-3 py-2">Latency</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DASHBOARD_SAMPLE.environments.map((env) => (
                      <tr key={env.name} className="border-b border-slate-900">
                        <td className="px-3 py-2.5 font-semibold text-white">{env.name}</td>
                        <td className="px-3 py-2.5">
                          <CloudBadge cloud={env.cloud} />
                        </td>
                        <td className="px-3 py-2.5 text-slate-300">{env.services}</td>
                        <td className="px-3 py-2.5 text-slate-300">{env.latencyMs} ms</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`rounded-md px-2 py-1 text-xs font-semibold ${env.status === "Healthy"
                              ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                              : "border border-amber-500/40 bg-amber-500/15 text-amber-300"
                              }`}
                          >
                            {env.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={`${cardClass} p-5`}>
              <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                <Icon name="trending" size={13} /> Deployment Activity
              </div>
              <div className="space-y-3">
                {DASHBOARD_SAMPLE.recentDeployments.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-xs text-slate-300">{item.id}</p>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${item.status === "Succeeded"
                          ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                          : "border border-rose-500/40 bg-rose-500/15 text-rose-300"
                          }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-white">{item.service}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {item.env} • {item.cloud.toUpperCase()} • {item.at}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div className={`${cardClass} p-5`}>
              <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                <Icon name="chat" size={13} /> Customer Overview (Sample)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-2">Customer ID</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Tier</th>
                      <th className="px-3 py-2">Spend MTD</th>
                      <th className="px-3 py-2">Last Login</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DASHBOARD_SAMPLE.customerProfiles.map((customer) => (
                      <tr key={customer.customerId} className="border-b border-slate-900">
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-300">{customer.customerId}</td>
                        <td className="px-3 py-2.5 font-semibold text-white">{customer.name}</td>
                        <td className="px-3 py-2.5 text-slate-300">{customer.tier}</td>
                        <td className="px-3 py-2.5 text-emerald-300">${customer.spendMtd.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-slate-400">{customer.lastLogin}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={`${cardClass} p-5`}>
              <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                <Icon name="info" size={13} /> Account Snapshot
              </div>
              <div className="space-y-3 text-sm">
                <SnapshotRow label="Owner" value={DASHBOARD_SAMPLE.tenant.owner} />
                <SnapshotRow label="Account ID" value={DASHBOARD_SAMPLE.tenant.accountId} />
                <SnapshotRow label="Primary Region" value={DASHBOARD_SAMPLE.tenant.region} />
                <SnapshotRow label="Active Users" value={`${DASHBOARD_SAMPLE.tenant.usersActive}`} />
                <SnapshotRow label="Plan" value={DASHBOARD_SAMPLE.tenant.plan} />
              </div>
              <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
                Suggested MongoDB model fields for future auth dashboard: userId, tenantId, role, lastLoginAt, preferredCloud,
                savedSimulations, deploymentHistory.
              </div>
            </div>
          </div>
        </section>
      )}

      {tab === "simulator" && (
        <main className="mx-auto max-w-7xl px-4 pb-14 pt-10 md:px-8">
          <div className="relative mb-8 text-center md:mb-10">
            <div className="pointer-events-none absolute -left-3 top-2 hidden md:block">
              <div className="floating-chip floating-chip-fast inline-flex items-center gap-2 rounded-full border border-sky-300/40 bg-sky-400/15 px-3 py-1.5 text-[11px] font-semibold text-sky-200">
                <Icon name="cloud" size={11} />
                Multi-cloud
              </div>
            </div>
            <div className="pointer-events-none absolute -right-3 top-14 hidden md:block">
              <div className="floating-chip inline-flex items-center gap-2 rounded-full border border-cyan-300/40 bg-cyan-400/10 px-3 py-1.5 text-[11px] font-semibold text-cyan-200">
                <Icon name="zap" size={11} />
                Real-time sim
              </div>
            </div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-400/35 bg-sky-400/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-sky-300">
              <Icon name="zap" size={12} />
              AI-Powered Cloud Optimization
            </div>
            <h1 className="font-[Space_Grotesk] text-4xl font-bold tracking-tight text-white md:text-6xl">
              Simulate Better Infrastructure
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
              Define your workload and budget. CloudTwin evaluates pricing and fit across major cloud providers
              and recommends high-efficiency configurations.
            </p>
            <div className="mt-4 flex justify-center">
              <div className="floating-chip floating-chip-slow inline-flex items-center gap-2 rounded-full border border-blue-300/35 bg-blue-500/10 px-3 py-1.5 text-[11px] font-semibold text-blue-200">
                <Icon name="server" size={11} />
                Cost fit score
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[390px_minmax(0,1fr)]">
            <section className={`${cardClass} p-5 md:p-6`}>
              <div className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                <Icon name="server" size={14} /> Requirements
              </div>

              {[
                {
                  label: "Application Type",
                  key: "appType",
                  type: "select",
                  opts: [
                    { v: "web", l: "Web Application" },
                    { v: "api", l: "REST API" },
                    { v: "ml", l: "ML or AI Workload" },
                    { v: "db", l: "Database Server" },
                    { v: "batch", l: "Batch Processing" },
                  ],
                },
                {
                  label: "vCPU Cores Needed",
                  key: "vcpu",
                  type: "select",
                  opts: [1, 2, 4, 8, 16].map((v) => ({ v, l: `${v} vCPUs` })),
                },
                {
                  label: "RAM Required (GB)",
                  key: "ram",
                  type: "select",
                  opts: [1, 2, 4, 8, 16, 32, 64].map((v) => ({ v, l: `${v} GB` })),
                },
                { label: "Expected Traffic (req/min)", key: "traffic", type: "number" },
                { label: "Monthly Budget (USD)", key: "budget", type: "number" },
                {
                  label: "Preferred Cloud Provider",
                  key: "preferredCloud",
                  type: "select",
                  opts: [
                    { v: "all", l: "All Providers" },
                    { v: "aws", l: "Amazon AWS" },
                    { v: "gcp", l: "Google Cloud" },
                    { v: "azure", l: "Microsoft Azure" },
                  ],
                },
              ].map((field) => (
                <div key={field.key} className="mb-4">
                  <label className={labelClass}>{field.label}</label>
                  {field.type === "select" ? (
                    <select
                      className={inputClass}
                      value={form[field.key]}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          [field.key]: Number.isNaN(+e.target.value) ? e.target.value : +e.target.value,
                        }))
                      }
                    >
                      {field.opts.map((o) => (
                        <option key={o.v} value={o.v}>
                          {o.l}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      className={inputClass}
                      value={form[field.key]}
                      onChange={(e) => setForm((f) => ({ ...f, [field.key]: +e.target.value }))}
                    />
                  )}
                </div>
              ))}

              <div className="mt-6 rounded-xl border border-slate-700/70 bg-slate-950/50 p-4">
                <label className={labelClass}>Generate Inputs with AI</label>
                <textarea
                  className={`${inputClass} min-h-[88px] resize-y leading-5`}
                  value={aiScenario}
                  onChange={(e) => setAiScenario(e.target.value)}
                  placeholder="Describe workload and constraints, then generate simulation inputs."
                />
                <button
                  onClick={handleGenerateAndSimulate}
                  disabled={aiGenerating || simulating || !aiScenario.trim()}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/15 px-4 py-2.5 text-sm font-semibold text-sky-200 transition hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {aiGenerating ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-300/25 border-t-sky-300" />
                      Generating profile...
                    </>
                  ) : (
                    <>
                      <Icon name="star" size={14} />
                      Generate and Simulate
                    </>
                  )}
                </button>
                {aiLastSummary && !aiError && <p className="mt-2 text-xs text-sky-300">AI assumptions: {aiLastSummary}</p>}
                {aiError && <p className="mt-2 text-xs text-rose-300">{aiError}</p>}
              </div>

              <button
                onClick={handleSimulate}
                disabled={simulating || aiGenerating}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {simulating ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                    Simulating...
                  </>
                ) : (
                  <>
                    <Icon name="zap" size={14} />
                    Run Simulation
                  </>
                )}
              </button>

              {results.length > 0 && (
                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                    <Icon name="trending" size={13} /> Simulation Summary
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-center">
                      <div className="text-xl font-extrabold text-sky-400">{results.length}</div>
                      <div className="text-[11px] text-slate-400">Options</div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-center">
                      <div className="text-xl font-extrabold text-emerald-400">${results[0]?.monthlyCost}</div>
                      <div className="text-[11px] text-slate-400">Best price</div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-center">
                      <div className="text-xl font-extrabold text-amber-300">{results[0]?.score}%</div>
                      <div className="text-[11px] text-slate-400">Fit score</div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section>
              {results.length === 0 && !simulating && (
                <div className={`${cardClass} flex min-h-[430px] flex-col items-center justify-center p-8 text-center`}>
                  <div className="mb-4 text-5xl text-slate-600">CLOUD</div>
                  <h3 className="text-lg font-bold text-slate-100">No simulation yet</h3>
                  <p className="mt-2 text-sm text-slate-400">Fill the form or use AI generation and start simulation.</p>
                </div>
              )}

              {simulating && (
                <div className={`${cardClass} flex min-h-[430px] flex-col justify-center gap-4 p-8`}>
                  {[
                    "Fetching pricing baselines",
                    "Comparing instance families",
                    "Scoring performance fit",
                    "Ranking cost efficiency",
                  ].map((msg, i) => (
                    <div key={msg} className="flex items-center gap-3 text-slate-300" style={{ opacity: 0.55 + i * 0.12 }}>
                      <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />
                      <span className="text-sm">{msg}...</span>
                    </div>
                  ))}
                </div>
              )}

              {results.length > 0 && (
                <div>
                  <div className="mb-3 flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                    <Icon name="star" size={13} /> Top Configurations
                  </div>
                  {results.map((r, i) => {
                    const active = selectedResult?.instance === r.instance && selectedResult?.cloud === r.cloud;
                    return (
                      <article
                        key={`${r.cloud}-${r.instance}`}
                        onClick={() => setSelectedResult(r)}
                        className={`${cardClass} relative mb-3 cursor-pointer p-5 transition hover:-translate-y-0.5 ${active ? "border-sky-500/70" : ""
                          } ${i === 0 ? "bg-gradient-to-br from-sky-600/15 via-blue-700/10 to-slate-900/70" : ""}`}
                      >
                        {i === 0 && (
                          <span className="absolute right-5 top-0 rounded-b-md bg-gradient-to-r from-sky-500 to-blue-600 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-white">
                            BEST MATCH
                          </span>
                        )}

                        <div className="mb-3 flex items-start justify-between gap-4">
                          <div>
                            <div className="mb-1 flex items-center gap-2">
                              <CloudBadge cloud={r.cloud} />
                              <span className="font-mono text-base font-semibold text-white">{r.instance}</span>
                            </div>
                            <p className="text-xs text-slate-400">
                              {r.spec.vcpu} vCPU • {r.spec.ram}GB RAM • {r.spec.storage}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-extrabold text-emerald-400">
                              ${r.monthlyCost}
                              <span className="ml-1 text-xs font-medium text-slate-400">/mo</span>
                            </div>
                            <div className="text-[11px] text-slate-400">${r.annualCost}/yr</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <Metric label="Fit" value={`${r.score}%`} />
                          <Metric label="Latency" value={`${r.latency}ms`} />
                          <Metric label="CPU Util" value={`${r.utilization}%`} />
                          <Metric label="Throughput" value={`${r.throughput}`} />
                        </div>

                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
                          <div className="h-full bg-gradient-to-r from-sky-400 to-blue-500" style={{ width: `${r.score}%` }} />
                        </div>

                        {r.savings > 0 && (
                          <div className="mt-3 inline-flex rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-xs font-semibold text-emerald-300">
                            Saves ${r.savings.toFixed(2)} per month
                          </div>
                        )}
                      </article>
                    );
                  })}

                  {selectedResult && (
                    <button
                      onClick={() => setTab("deploy")}
                      className="mt-2 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:brightness-110"
                    >
                      <Icon name="code" size={14} />
                      Generate Terraform for {selectedResult.instance}
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        </main>
      )}

      {tab === "pricing" && (
        <section className="mx-auto max-w-7xl px-4 pb-14 pt-10 md:px-8">
          <h2 className="font-[Space_Grotesk] text-3xl font-bold tracking-tight text-white">Live Cloud Pricing</h2>
          <p className="mt-2 text-sm text-slate-400">
            Approximate hourly on-demand rates. {hasAnyLiveSource ? "Last synced" : "Last attempt"}: {pricingTs || "syncing..."}
          </p>

          <div className="mt-6 space-y-5">
            {["aws", "gcp", "azure"].map((cloud, cloudIndex) => (
              <div
                key={cloud}
                className={`${cardClass} overflow-hidden p-5 pricing-card-enter pricing-card-enter-${cloudIndex + 1} pricing-header-live`}
              >
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <CloudBadge cloud={cloud} />
                  <span className="instance-name-live">
                    {cloud === "aws"
                      ? "Amazon Web Services"
                      : cloud === "gcp"
                        ? "Google Cloud Platform"
                        : "Microsoft Azure"}
                  </span>
                  <span className={`ml-auto text-xs ${pricingSource[cloud] === "fallback" ? "text-amber-400" : "text-emerald-400"}`}>
                    {pricingSource[cloud] === "live" && (
                      <span className="inline-flex items-center gap-1.5 animate-pulse">
                        <span className="bounce-1 h-1.5 w-1.5 rounded-full bg-current"></span>
                        <span className="bounce-2 h-1.5 w-1.5 rounded-full bg-current"></span>
                        <span className="bounce-3 h-1.5 w-1.5 rounded-full bg-current"></span>
                      </span>
                    )}
                    {sourceLabel(cloud)}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm table-body-scan relative">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-400 header-live">
                        {[
                          "Instance",
                          "vCPU",
                          "RAM",
                          "USD/hr",
                          "USD/mo (730h)",
                          "Storage",
                        ].map((h) => (
                          <th key={h} className="px-3 py-2 font-semibold">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(pricingData[cloud] || {}).map(([name, spec], i) => (
                        <tr
                          key={name}
                          className={`border-b border-slate-900 pricing-table-row ${i % 2 === 0 ? "bg-transparent" : "bg-slate-900/45"}`}
                          style={{ animationDelay: `${i * 0.08}s` }}
                        >
                          <td className="px-3 py-2.5 font-mono font-semibold instance-name-live">{name}</td>
                          <td className="px-3 py-2.5 text-slate-100 price-cell-animated">{spec.vcpu}</td>
                          <td className="px-3 py-2.5 text-slate-100 price-cell-animated">{spec.ram} GB</td>
                          <td className="px-3 py-2.5 font-bold text-emerald-400 price-value">${spec.price.toFixed(4)}</td>
                          <td className="px-3 py-2.5 font-bold text-emerald-400 price-value">${(spec.price * 730).toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-slate-400 price-cell-animated">{spec.storage}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 animate-in fade-in-50 duration-1000 rounded-2xl border border-sky-500/35 bg-sky-500/10 p-4 text-sm text-sky-100">
            <div className="flex items-start gap-2">
              <Icon name="info" size={16} />
              <p>
                Pricing shown is approximate for US regions. Spot or reserved models can reduce monthly spend
                significantly. Validate final pricing with official cloud calculators before production rollout.
              </p>
            </div>
          </div>
        </section>
      )}

      {tab === "deploy" && (
        <section className="mx-auto max-w-5xl px-4 pb-14 pt-10 md:px-8">
          <h2 className="font-[Space_Grotesk] text-3xl font-bold tracking-tight text-white">Deployment Code</h2>
          <p className="mt-2 text-sm text-slate-400">Terraform configuration generated from your simulation result.</p>

          {!selectedResult ? (
            <div className={`${cardClass} mt-6 p-10 text-center`}>
              <div className="text-4xl text-slate-600">CODE</div>
              <p className="mt-3 text-sm text-slate-300">No configuration selected. Run a simulation first.</p>
              <button
                onClick={() => setTab("simulator")}
                className="mt-5 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
              >
                Go to Simulator
              </button>
            </div>
          ) : (
            <>
              <div className={`${cardClass} mt-6 flex flex-wrap items-center justify-between gap-4 p-5`}>
                <div className="flex items-center gap-3">
                  <CloudBadge cloud={selectedResult.cloud} />
                  <div>
                    <p className="font-mono text-lg font-semibold text-white">{selectedResult.instance}</p>
                    <p className="text-xs text-slate-400">
                      {selectedResult.spec.vcpu} vCPU • {selectedResult.spec.ram}GB RAM • score {selectedResult.score}%
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-extrabold text-emerald-400">${selectedResult.monthlyCost}/mo</div>
                  <div className="text-xs text-slate-400">~${selectedResult.annualCost}/yr</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {results.map((r) => {
                  const active = selectedResult?.instance === r.instance && selectedResult?.cloud === r.cloud;
                  return (
                    <button
                      key={`${r.cloud}-${r.instance}`}
                      onClick={() => setSelectedResult(r)}
                      className={`rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold transition ${active
                        ? "border-sky-500 bg-sky-500/20 text-sky-200"
                        : "border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500"
                        }`}
                    >
                      {r.cloud.toUpperCase()} {r.instance}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">main.tf</span>
                  <button
                    onClick={handleCopyCode}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${copied
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                      : "border-sky-500/40 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25"
                      }`}
                  >
                    <Icon name={copied ? "check" : "copy"} size={13} />
                    {copied ? "Copied" : "Copy code"}
                  </button>
                </div>
                <pre className="max-h-[460px] overflow-auto rounded-2xl border border-slate-800 bg-slate-950 p-4 font-['JetBrains_Mono'] text-xs leading-6 text-cyan-300">
                  {generateDeploymentCode(selectedResult, form)}
                </pre>
              </div>

              <div className={`${cardClass} mt-5 p-5`}>
                <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                  <Icon name="info" size={13} /> Deployment Steps
                </div>
                {[
                  "Install Terraform on your machine.",
                  "Authenticate cloud credentials (aws configure, gcloud auth, or az login).",
                  "Save this template as main.tf in a clean folder.",
                  "Run terraform init, terraform plan, then terraform apply.",
                  "Validate network, security, and tags after provisioning.",
                ].map((step, i) => (
                  <div key={step} className="mb-2.5 flex items-start gap-3">
                    <div className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-sky-500/40 bg-sky-500/15 text-xs font-bold text-sky-300">
                      {i + 1}
                    </div>
                    <p className="font-['JetBrains_Mono'] text-xs leading-6 text-slate-300">{step}</p>
                  </div>
                ))}

                <button
                  onClick={() => setTab("analysis")}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/15 px-4 py-2 text-sm font-semibold text-fuchsia-200 transition hover:bg-fuchsia-500/25"
                >
                  <Icon name="trending" size={14} />
                  View Statistical Analysis
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {tab === "analysis" && (
        <section className="mx-auto max-w-7xl px-4 pb-14 pt-10 md:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-[Space_Grotesk] text-3xl font-bold tracking-tight text-white">Statistical Analysis</h2>
              <p className="mt-2 text-sm text-slate-400">
                Static demo dataset for charts and plots. Timestamp: {new Date(DUMMY_ANALYTICS.generatedAt).toLocaleString()}
              </p>
            </div>
            <button
              onClick={() => setTab("deploy")}
              className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              Back to Deploy Code
            </button>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Avg Response" value={`${DUMMY_ANALYTICS.kpis.avgResponseMs} ms`} tone="sky" />
            <StatCard title="P95 Latency" value={`${DUMMY_ANALYTICS.kpis.p95LatencyMs} ms`} tone="amber" />
            <StatCard title="Uptime" value={`${DUMMY_ANALYTICS.kpis.uptimePct}%`} tone="emerald" />
            <StatCard title="Monthly Estimate" value={`$${DUMMY_ANALYTICS.kpis.monthlyEstimate}`} tone="fuchsia" />
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <div className={`${cardClass} p-5`}>
              <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                <Icon name="dollar" size={13} /> Cloud Cost Comparison
              </div>
              <BarChart
                data={DUMMY_ANALYTICS.monthlyCostByCloud}
                formatValue={(value) => `$${value.toFixed(1)}`}
                suffix="/mo"
              />
            </div>

            <div className={`${cardClass} p-5`}>
              <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                <Icon name="trending" size={13} /> Request Volume Trend
              </div>
              <LineChart data={DUMMY_ANALYTICS.trafficTrend} />
            </div>

            <div className={`${cardClass} p-5`}>
              <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                <Icon name="zap" size={13} /> Regional Latency Plot
              </div>
              <LatencyPlot data={DUMMY_ANALYTICS.latencyByRegion} />
            </div>

            <div className={`${cardClass} p-5`}>
              <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                <Icon name="info" size={13} /> Incident Severity Mix
              </div>
              <DonutChart data={DUMMY_ANALYTICS.incidentMix} />
            </div>
          </div>
        </section>
      )}

      <button
        onClick={() => setChatOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_15px_35px_-10px_rgba(56,189,248,0.85)] transition hover:scale-105"
      >
        <Icon name={chatOpen ? "x" : "chat"} size={20} />
      </button>

      <aside
        className={`fixed bottom-24 right-6 z-40 flex w-[min(92vw,390px)] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/95 shadow-2xl backdrop-blur transition-all duration-300 ${chatOpen ? "h-[520px] opacity-100" : "h-0 opacity-0"
          }`}
      >
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-r from-sky-500 to-blue-600">
              <Icon name="bot" size={15} />
            </div>
            <div>
              <p className="text-sm font-bold text-white">CloudTwin AI</p>
              <p className="text-[11px] text-emerald-400">Online - Powered by Groq</p>
            </div>
          </div>
          <button onClick={() => setChatOpen(false)} className="text-slate-400 hover:text-slate-200">
            <Icon name="minimize" size={15} />
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {chatMessages.map((msg, i) => (
            <div
              key={`${msg.role}-${i}`}
              className={`max-w-[86%] rounded-2xl px-3 py-2 text-sm leading-6 ${msg.role === "user"
                ? "ml-auto rounded-br-md bg-gradient-to-r from-sky-500 to-blue-600 text-white"
                : "rounded-bl-md border border-slate-700 bg-slate-900 text-slate-100"
                }`}
            >
              {msg.content}
            </div>
          ))}
          {chatLoading && (
            <div className="max-w-[86%] rounded-2xl rounded-bl-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200">
              Thinking <span className="inline-block animate-bounce">.</span>
              <span className="inline-block animate-bounce [animation-delay:120ms]">.</span>
              <span className="inline-block animate-bounce [animation-delay:240ms]">.</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="flex gap-2 border-t border-slate-800 bg-slate-900/80 p-3">
          <textarea
            rows={1}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask about AWS, GCP, Kubernetes..."
            className="h-10 flex-1 resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleChat();
              }
            }}
          />
          <button
            onClick={handleChat}
            disabled={chatLoading}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-sky-500 to-blue-600 text-white disabled:opacity-60"
          >
            <Icon name="send" size={14} />
          </button>
        </div>
      </aside>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5">
      <div className="text-lg font-extrabold leading-none text-slate-100">{value}</div>
      <div className="mt-1 text-[11px] text-slate-400">{label}</div>
    </div>
  );
}

function StatCard({ title, value, tone }) {
  const toneClass = {
    sky: "text-sky-300 border-sky-400/35 bg-sky-500/10",
    amber: "text-amber-300 border-amber-400/35 bg-amber-500/10",
    emerald: "text-emerald-300 border-emerald-400/35 bg-emerald-500/10",
    fuchsia: "text-fuchsia-300 border-fuchsia-400/35 bg-fuchsia-500/10",
  };

  return (
    <div className={`${cardClass} border ${toneClass[tone] || toneClass.sky} p-4`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{title}</p>
      <p className="mt-2 text-2xl font-extrabold text-white">{value}</p>
    </div>
  );
}

function BarChart({ data, formatValue, suffix = "" }) {
  const max = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className="space-y-3">
      {data.map((item) => {
        const width = `${(item.value / max) * 100}%`;
        return (
          <div key={item.cloud}>
            <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
              <span className="font-semibold">{item.cloud}</span>
              <span>{formatValue(item.value)} {suffix}</span>
            </div>
            <div className="h-3 rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-400 via-blue-500 to-fuchsia-500"
                style={{ width }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LineChart({ data }) {
  const width = 620;
  const height = 240;
  const padding = 20;
  const values = data.map((d) => d.requestsK);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const stepX = (width - padding * 2) / (data.length - 1 || 1);

  const points = data
    .map((item, i) => {
      const x = padding + i * stepX;
      const y = height - padding - ((item.requestsK - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2">
        <defs>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        <polyline
          fill="none"
          stroke="url(#lineGradient)"
          strokeWidth="4"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
        {data.map((item, i) => {
          const x = padding + i * stepX;
          const y = height - padding - ((item.requestsK - min) / range) * (height - padding * 2);
          return <circle key={item.month} cx={x} cy={y} r="4" fill="#22d3ee" />;
        })}
      </svg>
      <div className="mt-2 grid grid-cols-6 gap-1 text-center text-[10px] text-slate-400 md:grid-cols-12">
        {data.map((item) => (
          <span key={item.month}>{item.month}</span>
        ))}
      </div>
    </div>
  );
}

function LatencyPlot({ data }) {
  const maxP95 = Math.max(...data.map((d) => d.p95), 1);

  return (
    <div className="space-y-3">
      {data.map((item) => {
        const p50Width = `${(item.p50 / maxP95) * 100}%`;
        const p95Width = `${(item.p95 / maxP95) * 100}%`;
        return (
          <div key={item.region} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-300">
              <span className="font-semibold uppercase">{item.region}</span>
              <span>P50 {item.p50}ms | P95 {item.p95}ms</span>
            </div>
            <div className="space-y-1.5">
              <div className="h-2 rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-cyan-400" style={{ width: p50Width }} />
              </div>
              <div className="h-2 rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-amber-400" style={{ width: p95Width }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({ data }) {
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  let offset = 0;

  const segments = data.map((item) => {
    const start = (offset / total) * 360;
    offset += item.value;
    const end = (offset / total) * 360;
    return `${item.color} ${start}deg ${end}deg`;
  });

  return (
    <div className="grid gap-5 md:grid-cols-[180px_1fr] md:items-center">
      <div
        className="mx-auto h-44 w-44 rounded-full border border-slate-700"
        style={{
          background: `conic-gradient(${segments.join(", ")})`,
        }}
      >
        <div className="m-auto mt-10 flex h-24 w-24 items-center justify-center rounded-full border border-slate-700 bg-slate-950/95 text-xs font-semibold text-slate-300">
          {total} events
        </div>
      </div>

      <div className="space-y-2">
        {data.map((item) => {
          const pct = ((item.value / total) * 100).toFixed(1);
          return (
            <div key={item.label} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-slate-200">{item.label}</span>
              </div>
              <span className="text-slate-400">{item.value} ({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DashboardKpi({ title, value, meta, tone }) {
  const toneClass = {
    sky: "border-sky-500/35 bg-sky-500/10",
    emerald: "border-emerald-500/35 bg-emerald-500/10",
    amber: "border-amber-500/35 bg-amber-500/10",
    fuchsia: "border-fuchsia-500/35 bg-fuchsia-500/10",
  };

  return (
    <div className={`${cardClass} border ${toneClass[tone] || toneClass.sky} p-4`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{title}</p>
      <p className="mt-2 text-xl font-extrabold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-300">{meta}</p>
    </div>
  );
}

function SnapshotRow({ label, value }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold text-slate-100">{value}</span>
    </div>
  );
}
