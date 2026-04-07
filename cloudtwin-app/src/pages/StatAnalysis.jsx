import { useEffect, useMemo, useState } from "react";
import { fetchLivePricingCatalog } from "../cloudtwin/api/pricing";

const statusMeta = {
    Live: {
        dotClass: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]",
        label: "Live pricing",
    },
    Fallback: {
        dotClass: "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)]",
        label: "Fallback pricing",
    },
};

function StatusDot({ type }) {
    const meta = statusMeta[type] || statusMeta.Fallback;

    return (
        <span className="inline-flex h-3 w-3 rounded-full" title={meta.label} aria-label={meta.label}>
            <span className={`h-3 w-3 rounded-full ${meta.dotClass}`} />
        </span>
    );
}

export default function StatAnalysis() {
    const [catalog, setCatalog] = useState({ aws: {}, gcp: {}, azure: {} });
    const [sourceStatus, setSourceStatus] = useState({ aws: "fallback", gcp: "fallback", azure: "fallback" });
    const [fetchedAt, setFetchedAt] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;

        const loadPricingAnalysis = async () => {
            setLoading(true);
            setError("");

            try {
                const live = await fetchLivePricingCatalog({ force: true });
                if (!active) return;

                setCatalog(live?.catalog || { aws: {}, gcp: {}, azure: {} });
                setSourceStatus(live?.status || { aws: "fallback", gcp: "fallback", azure: "fallback" });
                setFetchedAt(live?.fetchedAt || new Date().toISOString());
            } catch (loadError) {
                if (!active) return;

                setCatalog({ aws: {}, gcp: {}, azure: {} });
                setSourceStatus({ aws: "fallback", gcp: "fallback", azure: "fallback" });
                setError(loadError instanceof Error ? loadError.message : "Unable to load live pricing");
            } finally {
                if (active) setLoading(false);
            }
        };

        loadPricingAnalysis();
        const interval = setInterval(loadPricingAnalysis, 60 * 1000);

        return () => {
            active = false;
            clearInterval(interval);
        };
    }, []);

    const providerRows = useMemo(() => {
        const providers = ["aws", "gcp", "azure"];

        return providers.map((provider) => {
            const entries = Object.entries(catalog?.[provider] || {});
            const prices = entries
                .map(([, spec]) => Number(spec?.price || 0))
                .filter((price) => Number.isFinite(price) && price > 0);

            const averagePrice = prices.length
                ? prices.reduce((sum, price) => sum + price, 0) / prices.length
                : 0;

            const cheapest = entries
                .filter(([, spec]) => Number(spec?.price || 0) > 0)
                .sort((a, b) => Number(a[1].price) - Number(b[1].price))[0];

            return {
                provider,
                providerLabel: provider.toUpperCase(),
                instances: entries.length,
                averagePrice,
                status: sourceStatus?.[provider] || "fallback",
                cheapestName: cheapest?.[0] || "-",
                cheapestPrice: Number(cheapest?.[1]?.price || 0),
            };
        });
    }, [catalog, sourceStatus]);

    const allRows = useMemo(() => {
        return providerRows
            .flatMap((provider) => {
                const entries = Object.entries(catalog?.[provider.provider] || {});
                return entries.map(([name, spec]) => ({
                    provider: provider.providerLabel,
                    instance: name,
                    vcpu: Number(spec?.vcpu || 0),
                    ram: Number(spec?.ram || 0),
                    price: Number(spec?.price || 0),
                    region: spec?.region || "-",
                }));
            })
            .filter((row) => row.price > 0)
            .sort((a, b) => a.price - b.price);
    }, [catalog, providerRows]);

    const cheapestOverall = allRows.slice(0, 10);
    const averageMax = Math.max(...providerRows.map((row) => row.averagePrice), 0.0001);
    const statusType = (mode) => (mode === "live" || mode === "partial-live" ? "Live" : "Fallback");

    const liveProviderCount = providerRows.filter(
        (row) => row.status === "live" || row.status === "partial-live"
    ).length;

    const summaryText = fetchedAt
        ? `${liveProviderCount}/3 providers live • updated ${new Date(fetchedAt).toLocaleTimeString()}`
        : "Loading live pricing status...";

    const pricePoints = cheapestOverall
        .slice(0, 7)
        .map((point, idx, arr) => {
            const x = idx * (100 / (arr.length - 1 || 1));
            const y = 100 - Math.round((point.price / Math.max(arr[arr.length - 1]?.price || 1, 0.0001)) * 85);
            return `${x},${y}`;
        })
        .join(" ");

    return (
        <section className="mx-auto max-w-7xl px-4 pb-14 pt-10 md:px-8">
            <div className="mb-7 rounded-2xl border border-slate-800/70 bg-slate-900/70 p-5 shadow-[0_12px_40px_-20px_rgba(14,165,233,0.55)] md:p-7">
                <h2 className="font-[Space_Grotesk] text-3xl font-bold tracking-tight text-white">Stat Analysis</h2>
                <p className="mt-2 text-sm text-slate-300">
                    Analysis of live cloud pricing catalog across AWS, GCP, and Azure.
                </p>
                <p className="mt-2 text-xs text-slate-400">{summaryText}</p>
            </div>

            {error && (
                <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                    Live pricing refresh warning: {error}
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
                <article className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-5">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="font-[Space_Grotesk] text-lg font-bold text-slate-100">Average Hourly Price by Cloud</h3>
                        <StatusDot type={liveProviderCount > 0 ? "Live" : "Fallback"} />
                    </div>
                    <div className="space-y-4">
                        {providerRows.map((row) => (
                            <div key={row.provider}>
                                <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                                    <span>{row.providerLabel}</span>
                                    <span className="font-semibold text-slate-100">
                                        {loading ? "..." : `$${row.averagePrice.toFixed(4)}/hr`}
                                    </span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-800">
                                    <div
                                        className="h-2 rounded-full bg-emerald-400"
                                        style={{ width: `${loading ? 10 : Math.max(8, Math.round((row.averagePrice / averageMax) * 100))}%` }}
                                    />
                                </div>
                                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                                    <span>{row.instances} instances</span>
                                    <span>{statusType(row.status)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </article>

                <article className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-5">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="font-[Space_Grotesk] text-lg font-bold text-slate-100">Cheapest Instance Snapshot</h3>
                        <StatusDot type={liveProviderCount > 0 ? "Live" : "Fallback"} />
                    </div>
                    <div className="space-y-3">
                        {providerRows.map((row) => (
                            <div key={row.provider} className="rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-3 text-sm text-slate-200">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold text-white">{row.providerLabel}</span>
                                    <span className="text-xs text-slate-400">{statusType(row.status)}</span>
                                </div>
                                <p className="mt-1 text-slate-300">{row.cheapestName}</p>
                                <p className="mt-1 text-xs text-emerald-300">
                                    {loading ? "..." : `$${row.cheapestPrice.toFixed(4)}/hr`}
                                </p>
                            </div>
                        ))}
                    </div>
                </article>

                <article className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-5">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="font-[Space_Grotesk] text-lg font-bold text-slate-100">Lowest Price Curve</h3>
                        <StatusDot type={liveProviderCount > 0 ? "Live" : "Fallback"} />
                    </div>
                    <svg viewBox="0 0 100 100" className="h-48 w-full rounded-xl border border-slate-800 bg-slate-950 p-3">
                        <polyline fill="none" stroke="#34d399" strokeWidth="2.5" points={pricePoints} />
                        {cheapestOverall.slice(0, 7).map((point, idx, arr) => {
                            const x = idx * (100 / (arr.length - 1 || 1));
                            const y = 100 - Math.round((point.price / Math.max(arr[arr.length - 1]?.price || 1, 0.0001)) * 85);
                            return <circle key={`${point.provider}-${point.instance}`} cx={x} cy={y} r="1.9" fill="#34d399" />;
                        })}
                    </svg>
                    <p className="mt-3 text-xs text-slate-400">
                        Plot uses the 7 lowest hourly prices from the current catalog.
                    </p>
                </article>

                <article className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-5 lg:col-span-2">
                    <div className="mb-4 flex items-center justify-between">
                        <h3 className="font-[Space_Grotesk] text-lg font-bold text-slate-100">Top 10 Cheapest Instances (Hourly)</h3>
                        <StatusDot type={liveProviderCount > 0 ? "Live" : "Fallback"} />
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-slate-800 text-slate-400">
                                    <th className="py-2 pr-3 font-medium">Provider</th>
                                    <th className="py-2 pr-3 font-medium">Instance</th>
                                    <th className="py-2 pr-3 font-medium">vCPU</th>
                                    <th className="py-2 pr-3 font-medium">RAM (GB)</th>
                                    <th className="py-2 pr-3 font-medium">Region</th>
                                    <th className="py-2 font-medium">Price/hr</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cheapestOverall.length === 0 && !loading && (
                                    <tr>
                                        <td className="py-3 text-slate-400" colSpan={6}>No pricing rows available.</td>
                                    </tr>
                                )}

                                {cheapestOverall.map((row) => (
                                    <tr key={`${row.provider}-${row.instance}`} className="border-b border-slate-900/80 text-slate-200">
                                        <td className="py-2 pr-3 font-semibold">{row.provider}</td>
                                        <td className="py-2 pr-3">{row.instance}</td>
                                        <td className="py-2 pr-3">{row.vcpu}</td>
                                        <td className="py-2 pr-3">{row.ram}</td>
                                        <td className="py-2 pr-3">{row.region}</td>
                                        <td className="py-2 font-semibold text-emerald-300">{loading ? "..." : `$${row.price.toFixed(4)}`}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </article>
            </div>
        </section>
    );
}
