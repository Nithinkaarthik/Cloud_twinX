import { useEffect, useMemo, useState } from "react";

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

function StatusDot({ type }) {
    const meta = statusMeta[type] || statusMeta["Dummy Data"];

    return (
        <span className="inline-flex h-3 w-3 rounded-full" title={meta.label} aria-label={meta.label}>
            <span className={`h-3 w-3 rounded-full ${meta.dotClass}`} />
        </span>
    );
}

export default function StatAnalysis() {
    const [summary, setSummary] = useState({ totalUsers: 0, newUsers7d: 0, withCompanyPct: 0 });
    const [signupTrend, setSignupTrend] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;

        const loadSummary = async () => {
            setLoading(true);
            try {
                const token = localStorage.getItem("token");
                const res = await fetch("http://localhost:5000/api/dashboard/summary", {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });

                if (!res.ok) throw new Error("Unable to load stats");

                const data = await res.json();
                if (!active) return;

                setSummary({
                    totalUsers: Number(data.totalUsers || 0),
                    newUsers7d: Number(data.newUsers7d || 0),
                    withCompanyPct: Number(data.withCompanyPct || 0),
                });

                const trendRes = await fetch("http://localhost:5000/api/dashboard/signup-trend", {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });

                if (!trendRes.ok) throw new Error("Unable to load signup trend");

                const trendData = await trendRes.json();
                setSignupTrend(Array.isArray(trendData.trend) ? trendData.trend : []);
            } catch {
                if (!active) return;
                setSummary({ totalUsers: 0, newUsers7d: 0, withCompanyPct: 0 });
                setSignupTrend([]);
            } finally {
                if (active) setLoading(false);
            }
        };

        loadSummary();
        return () => {
            active = false;
        };
    }, []);

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

    const functionalTrend = signupTrend.length > 0 ? signupTrend : Array.from({ length: 7 }, (_, idx) => ({ day: `${idx + 1}`, count: 0 }));
    const trendMax = Math.max(...functionalTrend.map((p) => p.count), 1);
    const points = functionalTrend
        .map((p, i) => {
            const x = i * (100 / (functionalTrend.length - 1 || 1));
            const y = 100 - Math.round((p.count / trendMax) * 85);
            return `${x},${y}`;
        })
        .join(" ");

    const dummyPie = [35, 25, 20, 20];

    return (
        <section className="mx-auto max-w-7xl px-4 pb-14 pt-10 md:px-8">
            <div className="mb-7 rounded-2xl border border-slate-800/70 bg-slate-900/70 p-5 shadow-[0_12px_40px_-20px_rgba(14,165,233,0.55)] md:p-7">
                <h2 className="font-[Space_Grotesk] text-3xl font-bold tracking-tight text-white">Stat Analysis</h2>
                <p className="mt-2 text-sm text-slate-300">
                    Visual statistics dashboard with mixed live and placeholder plots.
                </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <article className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-5">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="font-[Space_Grotesk] text-lg font-bold text-slate-100">User Growth Bars</h3>
                        <StatusDot type="Functional" />
                    </div>
                    <div className="space-y-4">
                        {functionalBars.map((row) => (
                            <div key={row.label}>
                                <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                                    <span>{row.label}</span>
                                    <span className="font-semibold text-slate-100">{loading ? "..." : row.value}</span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-800">
                                    <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${loading ? 10 : row.pct}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </article>

                <article className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-5">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="font-[Space_Grotesk] text-lg font-bold text-slate-100">Daily Signup Trend (7d)</h3>
                        <StatusDot type="Functional" />
                    </div>
                    <svg viewBox="0 0 100 100" className="h-48 w-full rounded-xl border border-slate-800 bg-slate-950 p-3">
                        <polyline fill="none" stroke="#34d399" strokeWidth="2.5" points={points} />
                        {functionalTrend.map((p, i) => {
                            const x = i * (100 / (functionalTrend.length - 1 || 1));
                            const y = 100 - Math.round((p.count / trendMax) * 85);
                            return <circle key={`${p.day}-${i}`} cx={x} cy={y} r="1.9" fill="#34d399" />;
                        })}
                    </svg>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        {functionalTrend.map((p) => (
                            <span key={p.day} className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1">
                                {p.day}: {loading ? "..." : p.count}
                            </span>
                        ))}
                    </div>
                </article>

                <article className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-5">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="font-[Space_Grotesk] text-lg font-bold text-slate-100">Region Split Pie</h3>
                        <StatusDot type="Dummy Data" />
                    </div>
                    <div className="mx-auto h-48 w-48 rounded-full" style={{
                        background: `conic-gradient(#ef4444 0% ${dummyPie[0]}%, #f97316 ${dummyPie[0]}% ${dummyPie[0] + dummyPie[1]}%, #eab308 ${dummyPie[0] + dummyPie[1]}% ${dummyPie[0] + dummyPie[1] + dummyPie[2]}%, #fb7185 ${dummyPie[0] + dummyPie[1] + dummyPie[2]}% 100%)`,
                    }} />
                </article>

                <article className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-5">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="font-[Space_Grotesk] text-lg font-bold text-slate-100">Live Profile Coverage</h3>
                        <StatusDot type="Functional" />
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
                        <p className="text-sm text-slate-300">Profiles with company info</p>
                        <p className="mt-2 font-[Space_Grotesk] text-5xl font-bold text-emerald-400">{loading ? "..." : `${summary.withCompanyPct}%`}</p>
                        <div className="mt-4 h-3 rounded-full bg-slate-800">
                            <div className="h-3 rounded-full bg-emerald-400" style={{ width: `${loading ? 8 : Math.max(8, summary.withCompanyPct)}%` }} />
                        </div>
                    </div>
                </article>
            </div>
        </section>
    );
}
