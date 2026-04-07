import { useContext, useEffect, useMemo, useState } from "react";
import { AuthContext } from "../context/AuthContext";

const fallbackSummary = {
    totalUsers: 0,
    newUsers7d: 0,
    withCompanyPct: 0,
    latestUsers: [],
    signupTrend: [],
};

const statusMeta = {
    Functional: {
        dotClass: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]",
        label: "Live section",
    },
};

function StatusChip({ type }) {
    const meta = statusMeta[type] || statusMeta.Functional;

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
                const summaryRes = await fetch("http://localhost:5000/api/dashboard/summary", {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });

                if (!summaryRes.ok) {
                    const data = await summaryRes.json().catch(() => ({}));
                    throw new Error(data.error || "Failed to fetch dashboard summary");
                }

                const trendRes = await fetch("http://localhost:5000/api/dashboard/signup-trend", {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });

                if (!trendRes.ok) {
                    throw new Error("Failed to fetch signup trend");
                }

                const data = await summaryRes.json();
                const trendData = await trendRes.json();
                if (!active) return;

                setSummary({
                    totalUsers: Number(data.totalUsers || 0),
                    newUsers7d: Number(data.newUsers7d || 0),
                    withCompanyPct: Number(data.withCompanyPct || 0),
                    latestUsers: Array.isArray(data.latestUsers) ? data.latestUsers : [],
                    signupTrend: Array.isArray(trendData.trend) ? trendData.trend : [],
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
        const avgDaily = summary.signupTrend.length
            ? Math.round(summary.signupTrend.reduce((sum, item) => sum + Number(item.count || 0), 0) / summary.signupTrend.length)
            : 0;

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
                label: "Avg Daily Signups",
                value: summaryLoading ? "..." : String(avgDaily),
                delta: "Based on last 7 days",
                tone: "text-violet-300",
                source: "Functional",
            },
        ];
    }, [summary, summaryLoading]);

    const functionalBars = useMemo(() => {
        const max = Math.max(summary.totalUsers, summary.newUsers7d, summary.withCompanyPct, 1);
        return [
            { label: "Total Users", value: summary.totalUsers },
            { label: "New Users 7d", value: summary.newUsers7d },
            { label: "With Company %", value: summary.withCompanyPct },
        ].map((item) => ({
            ...item,
            pct: Math.max(6, Math.round((item.value / max) * 100)),
        }));
    }, [summary]);

    const functionalTrend = summary.signupTrend.length > 0
        ? summary.signupTrend
        : Array.from({ length: 7 }, (_, idx) => ({ day: `${idx + 1}`, count: 0 }));
    const trendMax = Math.max(...functionalTrend.map((point) => Number(point.count || 0)), 1);
    const trendPoints = functionalTrend
        .map((point, idx) => {
            const x = idx * (100 / (functionalTrend.length - 1 || 1));
            const y = 100 - Math.round((Number(point.count || 0) / trendMax) * 85);
            return `${x},${y}`;
        })
        .join(" ");

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
                                Live overview of user growth and profile adoption from your backend APIs.
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

                <section className="mt-6 grid gap-6 lg:grid-cols-2">
                    <article className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="font-['Space_Grotesk'] text-xl font-bold text-slate-100">User Growth Bars</h2>
                            <StatusChip type="Functional" />
                        </div>
                        <div className="space-y-4">
                            {functionalBars.map((row) => (
                                <div key={row.label}>
                                    <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                                        <span>{row.label}</span>
                                        <span className="font-semibold text-slate-100">{summaryLoading ? "..." : row.value}</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-slate-800">
                                        <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${summaryLoading ? 10 : row.pct}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </article>

                    <article className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="font-['Space_Grotesk'] text-xl font-bold text-slate-100">Daily Signup Trend (7d)</h2>
                            <StatusChip type="Functional" />
                        </div>
                        <svg viewBox="0 0 100 100" className="h-48 w-full rounded-xl border border-slate-800 bg-slate-950 p-3">
                            <polyline fill="none" stroke="#34d399" strokeWidth="2.5" points={trendPoints} />
                            {functionalTrend.map((point, idx) => {
                                const x = idx * (100 / (functionalTrend.length - 1 || 1));
                                const y = 100 - Math.round((Number(point.count || 0) / trendMax) * 85);
                                return <circle key={`${point.day}-${idx}`} cx={x} cy={y} r="1.9" fill="#34d399" />;
                            })}
                        </svg>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                            {functionalTrend.map((point) => (
                                <span key={point.day} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1">
                                    {point.day}: {summaryLoading ? "..." : point.count}
                                </span>
                            ))}
                        </div>
                    </article>

                    <article className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-5 lg:col-span-2">
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
                </section>
            </div>
        </main>
    );
}
