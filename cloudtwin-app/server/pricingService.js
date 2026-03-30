import { CLOUD_PRICING } from "../src/cloudtwin/data/cloudPricing.js";

const AWS_REGION_LABEL = "US East (N. Virginia)";
const AWS_ENDPOINT = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/us-east-1/index.json";
const AZURE_REGION = "eastus";
const AZURE_ENDPOINT = "https://prices.azure.com/api/retail/prices";
const GCP_REGION = "us-central1";
const GCP_COMPUTE_SERVICE = "6F81-5844-456A";
const GCP_COMPUTE_PRICING_PAGES = [
  "https://cloud.google.com/products/compute/pricing/general-purpose",
  "https://cloud.google.com/products/compute/pricing/compute-optimized",
  "https://cloud.google.com/products/compute/pricing/memory-optimized",
];
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PROVIDER_TIMEOUT_MS = 10000;

let pricingCache = null;

async function fetchWithTimeout(url, options = {}) {
  const timeoutMs = options.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithTimeout(url, timeoutMs = PROVIDER_TIMEOUT_MS) {
  try {
    const res = await fetchWithTimeout(url, { timeoutMs });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } catch (error) {
    throw error;
  }
}

function clonePricingCatalog() {
  return JSON.parse(JSON.stringify(CLOUD_PRICING));
}

function toUsd(unitPrice) {
  if (!unitPrice) return null;
  const units = Number(unitPrice.units || 0);
  const nanos = Number(unitPrice.nanos || 0);
  const value = units + nanos / 1_000_000_000;
  return Number.isFinite(value) && value > 0 ? value : null;
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractGcpPriceFromHtml(html, instanceName) {
  const instancePattern = escapeRegex(instanceName);
  const rowRegex = new RegExp(
    `<tr[^>]*>[\\s\\S]*?<p>${instancePattern}<\\/p>[\\s\\S]*?\\$([0-9]+(?:\\.[0-9]+)?)\\s*\\/\\s*1\\s*hour[\\s\\S]*?<\\/tr>`,
    "i"
  );
  const rowMatch = html.match(rowRegex);
  if (!rowMatch?.[1]) return null;

  const price = Number(rowMatch[1]);
  return Number.isFinite(price) && price > 0 ? price : null;
}

async function applyAwsLivePricing(catalog, status) {
  const wanted = new Set(Object.keys(catalog.aws));
  const payload = await fetchJsonWithTimeout(AWS_ENDPOINT, 15000);
  const matched = new Map();

  for (const product of Object.values(payload.products || {})) {
    const attr = product?.attributes || {};
    const instanceType = attr.instanceType;
    if (!wanted.has(instanceType)) continue;
    if (attr.location !== AWS_REGION_LABEL) continue;
    if (attr.operatingSystem !== "Linux") continue;
    if (attr.preInstalledSw !== "NA") continue;
    if (attr.tenancy !== "Shared") continue;
    if (attr.capacitystatus && attr.capacitystatus !== "Used") continue;

    const terms = payload.terms?.OnDemand?.[product.sku];
    if (!terms) continue;
    const offer = Object.values(terms)[0];
    const dimension = offer ? Object.values(offer.priceDimensions || {})[0] : null;
    const usd = Number(dimension?.pricePerUnit?.USD);
    if (!Number.isFinite(usd) || usd <= 0) continue;

    const previous = matched.get(instanceType);
    if (!previous || usd < previous) matched.set(instanceType, usd);
  }

  let updated = 0;
  for (const [instance, price] of matched.entries()) {
    if (!catalog.aws[instance]) continue;
    catalog.aws[instance].price = +price.toFixed(6);
    updated += 1;
  }

  status.aws = updated === wanted.size ? "live" : updated > 0 ? "partial-live" : "fallback";
}

async function applyAzureLivePricing(catalog, status) {
  const names = Object.keys(catalog.azure);
  let updated = 0;

  await Promise.all(
    names.map(async (name) => {
      const armSkuName = `Standard_${name}`;
      const filter = [
        "serviceName eq 'Virtual Machines'",
        `armRegionName eq '${AZURE_REGION}'`,
        `armSkuName eq '${armSkuName}'`,
        "priceType eq 'Consumption'",
      ].join(" and ");

      const url = `${AZURE_ENDPOINT}?$filter=${encodeURIComponent(filter)}`;
      const payload = await fetchJsonWithTimeout(url, 7000).catch(() => null);
      if (!payload) return;
      const items = payload.Items || [];
      const valid = items.filter((item) => {
        const text = `${item.skuName || ""} ${item.productName || ""} ${item.meterName || ""}`;
        if (/(spot|low priority|promo|windows)/i.test(text)) return false;
        return Number.isFinite(item.unitPrice) && item.unitPrice > 0;
      });

      if (!valid.length) return;
      const best = valid.reduce((min, item) => (item.unitPrice < min ? item.unitPrice : min), valid[0].unitPrice);
      catalog.azure[name].price = +best.toFixed(6);
      updated += 1;
    })
  );

  status.azure = updated === names.length ? "live" : updated > 0 ? "partial-live" : "fallback";
}

function findRateFromSkus(skus, familyRegex) {
  const filtered = skus.filter((sku) => {
    const description = sku.description || "";
    if (!familyRegex.test(description)) return false;
    if (/(preemptible|spot|committed use|gpu|sole tenancy|premium image)/i.test(description)) return false;
    if (sku.category?.usageType && sku.category.usageType !== "OnDemand") return false;
    if (sku.serviceRegions && !sku.serviceRegions.includes(GCP_REGION)) return false;
    return true;
  });

  let best = null;
  for (const sku of filtered) {
    const expression = sku.pricingInfo?.[0]?.pricingExpression;
    const rate = toUsd(expression?.tieredRates?.[0]?.unitPrice);
    if (rate && (!best || rate < best)) best = rate;
  }
  return best;
}

async function applyGcpLivePricing(catalog, status, gcpApiKey) {
  let updated = 0;

  // Primary no-key path: scrape public Google pricing page server-side.
  const htmlParts = await Promise.all(
    GCP_COMPUTE_PRICING_PAGES.map(async (url) => {
      return await fetchWithTimeout(url, { timeoutMs: 20000 })
        .then(async (res) => (res.ok ? await res.text() : ""))
        .catch(() => "");
    })
  );
  const html = htmlParts.filter(Boolean).join("\n");

  if (html) {
    for (const [instance, spec] of Object.entries(catalog.gcp)) {
      const price = extractGcpPriceFromHtml(html, instance);
      if (!price) continue;
      spec.price = +price.toFixed(6);
      updated += 1;
    }
  }

  // Optional fallback path when key is provided: Cloud Billing API.
  if (updated < Object.keys(catalog.gcp).length && gcpApiKey) {
    const url = `https://cloudbilling.googleapis.com/v1/services/${GCP_COMPUTE_SERVICE}/skus?currencyCode=USD&pageSize=5000&key=${encodeURIComponent(gcpApiKey)}`;
    const payload = await fetchJsonWithTimeout(url, 12000).catch(() => null);
    const skus = payload?.skus || [];

    if (skus.length) {
      const rates = {
        e2: {
          core: findRateFromSkus(skus, /E2 .*Instance Core/i),
          ram: findRateFromSkus(skus, /E2 .*Instance Ram/i),
        },
        n1: {
          core: findRateFromSkus(skus, /N1 .*Instance Core/i),
          ram: findRateFromSkus(skus, /N1 .*Instance Ram/i),
        },
        n2: {
          core: findRateFromSkus(skus, /N2 .*Instance Core/i),
          ram: findRateFromSkus(skus, /N2 .*Instance Ram/i),
        },
        c2: {
          core: findRateFromSkus(skus, /C2 .*Instance Core/i),
          ram: findRateFromSkus(skus, /C2 .*Instance Ram/i),
        },
      };

      const familyByInstance = {
        "e2-micro": "e2",
        "e2-small": "e2",
        "e2-medium": "e2",
        "n1-standard-2": "n1",
        "n1-standard-4": "n1",
        "n1-standard-8": "n1",
        "c2-standard-4": "c2",
        "n2-highmem-4": "n2",
      };

      for (const [instance, spec] of Object.entries(catalog.gcp)) {
        if (extractGcpPriceFromHtml(html || "", instance)) continue;

        const family = familyByInstance[instance];
        const familyRates = rates[family];
        if (!familyRates?.core || !familyRates?.ram) continue;

        const hourly = spec.vcpu * familyRates.core + spec.ram * familyRates.ram;
        if (!Number.isFinite(hourly) || hourly <= 0) continue;
        spec.price = +hourly.toFixed(6);
        updated += 1;
      }
    }
  }

  status.gcp = updated === Object.keys(catalog.gcp).length ? "live" : updated > 0 ? "partial-live" : "fallback";
}

export async function getLivePricingCatalog(options = {}) {
  const now = Date.now();
  if (!options.force && pricingCache && pricingCache.expiresAt > now) {
    return pricingCache.value;
  }

  const catalog = clonePricingCatalog();
  const status = { aws: "fallback", gcp: "fallback", azure: "fallback" };
  const gcpApiKey = options.gcpApiKey;
  const enableAzure = options.enableAzure !== false;

  const jobs = [
    applyAwsLivePricing(catalog, status),
    applyGcpLivePricing(catalog, status, gcpApiKey),
  ];

  if (enableAzure) {
    jobs.push(applyAzureLivePricing(catalog, status));
  }

  await Promise.allSettled(jobs);

  const value = {
    catalog,
    status,
    fetchedAt: new Date().toISOString(),
  };

  pricingCache = {
    value,
    expiresAt: now + CACHE_TTL_MS,
  };

  return value;
}
