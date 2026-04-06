import { useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "../context/AuthContext";

const fallbackSummary = {
    totalUsers: 0,
    newUsers7d: 0,
    withCompanyPct: 0,
    latestUsers: [],
};

const providerSplit = [
    { provider: "AWS", percent: 44, color: "bg-amber-400" },
    { provider: "Azure", percent: 31, color: "bg-sky-400" },
    { provider: "GCP", percent: 25, color: "bg-emerald-400" },
];

const upcomingTasks = [
    "Right-size analytics-worker CPU from 8 to 4 vCPU",
    "Enable reserved instances for billing-api",
    "Move customer-portal cache layer to managed Redis",
    "Run load test before recommendation-engine scale-up",
];

const statusMeta = {
    Functional: {
        dotClass: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]",
        label: "Live section",
    },
    "Dummy Data": {
        dotClass: "bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.8)]",
        label: "Stagnant section",
    },
};

function StatusChip({ type }) {
    const meta = statusMeta[type] || statusMeta["Dummy Data"];

    return (
        <span
            className="inline-flex h-3 w-3 rounded-full"
            title={meta.label}
            aria-label={meta.label}
        >
            <span className={`h-3 w-3 rounded-full ${meta.dotClass}`} />
        </span>
    );
}

export default function Dashboard() {
    const { user } = useContext(AuthContext);
    const [summary, setSummary] = useState(fallbackSummary);
    const [summaryLoading, setSummaryLoading] = useState(true);
    const [summaryError, setSummaryError] = useState("");

    useEffect(() => {
        let active = true;

        const loadSummary = async () => {
            setSummaryLoading(true);
            setSummaryError("");

            try {
                const token = localStorage.getItem("token");
                const res = await fetch("http://localhost:5000/api/dashboard/summary", {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });

                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || "Failed to fetch dashboard summary");
                }

                const data = await res.json();
                if (!active) return;

                setSummary({
                    totalUsers: Number(data.totalUsers || 0),
                    newUsers7d: Number(data.newUsers7d || 0),
                    withCompanyPct: Number(data.withCompanyPct || 0),
                    latestUsers: Array.isArray(data.latestUsers) ? data.latestUsers : [],
                });
            } catch (error) {
                if (!active) return;
                setSummaryError(error instanceof Error ? error.message : "Failed to load dashboard summary");
            } finally {
                if (active) setSummaryLoading(false);
            }
        };

        loadSummary();
        return () => {
            active = false;
        };
    }, []);

    const summaryCards = useMemo(() => {
        return [
            {
                label: "Registered Users",
                value: summaryLoading ? "..." : String(summary.totalUsers),
                delta: "MongoDB live count",
                tone: "text-emerald-300",
                source: "Functional",
            },
            {
                label: "New Users (7d)",
                value: summaryLoading ? "..." : String(summary.newUsers7d),
                delta: "MongoDB live count",
                tone: "text-cyan-300",
                source: "Functional",
            },
            {
                label: "Profiles With Company",
                value: summaryLoading ? "..." : `${summary.withCompanyPct}%`,
                delta: "MongoDB live ratio",
                tone: "text-amber-300",
                source: "Functional",
            },
            {
                label: "Reliability Score",
                value: "99.92%",
                delta: "within SLA",
                tone: "text-violet-300",
                source: "Dummy Data",
            },
        ];
    }, [summary, summaryLoading]);

    return (
        <main className="mx-auto max-w-7xl px-4 pb-10 pt-8 md:px-8 md:pt-10">
            <div className="mx-auto max-w-7xl">
                <header className="mb-7 rounded-2xl border border-slate-800/70 bg-slate-900/70 p-5 shadow-[0_12px_40px_-20px_rgba(14,165,233,0.55)] backdrop-blur md:p-7">
                    <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.16em] text-sky-300">CloudTwin Dashboard</p>
                            <h1 className="mt-2 font-['Space_Grotesk'] text-3xl font-bold text-slate-100 md:text-4xl">
                                Welcome back{user?.fullName ? `, ${user.fullName}` : ""}
                            </h1>
                            <p className="mt-2 max-w-2xl text-sm text-slate-300">
                                This is a starter dashboard with mock metrics. Next, we can wire these cards and tables to MongoDB-backed APIs.
                            </p>
                        </div>
                    </div>
                </header>

                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {summaryCards.map((card) => (
                        <article
                            key={card.label}
                            className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-4 shadow-[0_12px_28px_-22px_rgba(56,189,248,0.7)]"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs uppercase tracking-[0.12em] text-slate-400">{card.label}</p>
                                <StatusChip type={card.source} />
                            </div>
                            <p className="mt-3 font-['Space_Grotesk'] text-3xl font-bold text-white">{card.value}</p>
                            <p className={`mt-2 text-xs font-semibold ${card.tone}`}>{card.delta}</p>
                        </article>
                    ))}
                </section>

                {summaryError && (
                    <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                        Live widgets are unavailable: {summaryError}
                    </div>
                )}

                <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <article className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="font-['Space_Grotesk'] text-xl font-bold text-slate-100">Latest Registered Users</h2>
                            <StatusChip type="Functional" />
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-slate-800 text-slate-400">
                                        <th className="py-2 pr-3 font-medium">Name</th>
                                        <th className="py-2 pr-3 font-medium">Email</th>
                                        <th className="py-2 pr-3 font-medium">Company</th>
                                        <th className="py-2 font-medium">Created</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {summary.latestUsers.length === 0 && !summaryLoading && (
                                        <tr>
                                            <td className="py-3 text-slate-400" colSpan={4}>No user records found yet.</td>
                                        </tr>
                                    )}

                                    {summary.latestUsers.map((item) => (
                                        <tr key={item._id || item.email} className="border-b border-slate-900/80 text-slate-200">
                                            <td className="py-2 pr-3 font-semibold">{item.fullName || "-"}</td>
                                            <td className="py-2 pr-3">{item.email || "-"}</td>
                                            <td className="py-2 pr-3">{item.company || "-"}</td>
                                            <td className="py-2 font-semibold text-slate-100">
                                                {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "-"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </article>

                    <aside className="space-y-6">
                        <article className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-5">
                            <div className="mb-2 flex items-center justify-between">
                                <h3 className="font-['Space_Grotesk'] text-lg font-bold text-slate-100">Cloud Spend Split</h3>
                                <StatusChip type="Dummy Data" />
                            </div>
                            <div className="mt-4 space-y-3">
                                {providerSplit.map((item) => (
                                    <div key={item.provider}>
                                        <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                                            <span>{item.provider}</span>
                                            <span>{item.percent}%</span>
                                        </div>
                                        <div className="h-2 rounded-full bg-slate-800">
                                            <div className={`h-2 rounded-full ${item.color}`} style={{ width: `${item.percent}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </article>

                        <article className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-5">
                            <div className="mb-2 flex items-center justify-between">
                                <h3 className="font-['Space_Grotesk'] text-lg font-bold text-slate-100">Next Actions</h3>
                                <StatusChip type="Dummy Data" />
                            </div>
                            <ul className="mt-3 space-y-2 text-sm text-slate-300">
                                {upcomingTasks.map((task) => (
                                    <li key={task} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                                        {task}
                                    </li>
                                ))}
                            </ul>
                        </article>
                    </aside>
                </section>
            </div>
        </main>
    );
}
