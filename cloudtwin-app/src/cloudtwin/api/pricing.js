import { CLOUD_PRICING } from "../data/cloudPricing";

const CACHE_TTL_MS = 30 * 60 * 1000;

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

    try {
        const res = await fetch("/api/pricing/live", {
            method: "GET",
            headers: { Accept: "application/json" },
        });

        if (!res.ok) {
            throw new Error(`Pricing API request failed (${res.status})`);
        }

        const data = await res.json();
        const value = {
            catalog: data?.catalog || CLOUD_PRICING,
            status: data?.status || { aws: "fallback", gcp: "fallback", azure: "fallback" },
            fetchedAt: data?.fetchedAt || new Date().toISOString(),
        };

        pricingCache = {
            value,
            expiresAt: now + CACHE_TTL_MS,
        };

        return value;
    } catch {
        const value = fallbackPayload();
        pricingCache = {
            value,
            expiresAt: now + CACHE_TTL_MS,
        };
        return value;
    }
}
