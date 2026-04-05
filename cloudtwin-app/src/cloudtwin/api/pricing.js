import { CLOUD_PRICING } from "../data/cloudPricing";

const CACHE_TTL_MS = 30 * 60 * 1000;
const FALLBACK_RETRY_MS = 15 * 1000;

let pricingCache = null;

function fallbackPayload() {
    return {
        catalog: CLOUD_PRICING,
        status: { aws: "fallback", gcp: "fallback", azure: "fallback" },
        fetchedAt: new Date().toISOString(),
    };
}

export async function fetchLivePricingCatalog(options = {}) {
    const now = Date.now();
    if (!options.force && pricingCache && pricingCache.expiresAt > now) {
        return pricingCache.value;
    }

    const customBase = (import.meta.env.VITE_API_BASE_URL || "").trim();
    const endpoints = [
        customBase ? `${customBase.replace(/\/$/, "")}/api/pricing/live` : null,
        "/api/pricing/live",
        "http://localhost:5000/api/pricing/live",
    ].filter(Boolean);

    try {
        let lastError = null;
        let data = null;

        for (const endpoint of endpoints) {
            try {
                const res = await fetch(endpoint, {
                    method: "GET",
                    headers: { Accept: "application/json" },
                });

                if (!res.ok) {
                    throw new Error(`Pricing API request failed (${res.status})`);
                }

                data = await res.json();
                break;
            } catch (error) {
                lastError = error;
            }
        }

        if (!data) {
            throw lastError || new Error("Pricing API request failed");
        }

        const value = {
            catalog: data?.catalog || CLOUD_PRICING,
            status: data?.status || { aws: "fallback", gcp: "fallback", azure: "fallback" },
            fetchedAt: data?.fetchedAt || new Date().toISOString(),
        };

        const hasLive = Object.values(value.status).some((mode) => mode === "live" || mode === "partial-live");

        pricingCache = {
            value,
            expiresAt: now + (hasLive ? CACHE_TTL_MS : FALLBACK_RETRY_MS),
        };

        return value;
    } catch {
        const value = fallbackPayload();
        pricingCache = {
            value,
            expiresAt: now + FALLBACK_RETRY_MS,
        };
        return value;
    }
}
