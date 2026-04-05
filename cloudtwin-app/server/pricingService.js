import { CLOUD_PRICING } from "../src/cloudtwin/data/cloudPricing.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AWS_REGION_LABEL = "US East (N. Virginia)";
const AWS_ENDPOINT = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/us-east-1/index.json";
const AZURE_REGION = "eastus";
const AZURE_ENDPOINT = "https://prices.azure.com/api/retail/prices";
const GCP_REGION = "us-central1";
const GCP_COMPUTE_SERVICE = "6F81-5844-456A";
const GCP_BILLING_ENDPOINT = `https://cloudbilling.googleapis.com/v1/services/${GCP_COMPUTE_SERVICE}/skus`;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FALLBACK_RETRY_TTL_MS = 20 * 1000;
const PROVIDER_TIMEOUT_MS = 10000;
const DEFAULT_AWS_TIMEOUT_MS = 45000;
const AWS_REFRESH_TTL_MS = 12 * 60 * 60 * 1000;
const AWS_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const AWS_RETRY_BASE_MS = 30 * 1000;
const AWS_RETRY_MAX_MS = 30 * 60 * 1000;
const GCP_PAGE_SIZE = 5000;
const GCP_MAX_PAGES = 24;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const AWS_SNAPSHOT_DIR = path.join(__dirname, "cache");
const AWS_SNAPSHOT_FILE = path.join(AWS_SNAPSHOT_DIR, "aws-pricing-snapshot.json");

let pricingCache = null;
let awsSnapshot = null;
let awsRefreshInFlight = null;
let awsSnapshotLoadInFlight = null;
let awsRefreshFailures = 0;
let awsNextRetryAt = 0;

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

async function applyAwsLivePricing(catalog, status, awsTimeoutMs = DEFAULT_AWS_TIMEOUT_MS) {
  const wanted = new Set(Object.keys(catalog.aws));
  const payload = await fetchJsonWithTimeout(AWS_ENDPOINT, awsTimeoutMs);
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

function applyAwsSnapshot(catalog, status) {
  if (!awsSnapshot?.prices) return;

  const ageMs = Date.now() - Number(awsSnapshot.fetchedAtMs || 0);
  if (!Number.isFinite(ageMs) || ageMs > AWS_SNAPSHOT_MAX_AGE_MS) return;

  let updated = 0;
  for (const [instance, price] of Object.entries(awsSnapshot.prices)) {
    if (!catalog.aws[instance]) continue;
    catalog.aws[instance].price = price;
    updated += 1;
  }

  if (!updated) return;
  status.aws = awsSnapshot.mode || "partial-live";
}

async function loadAwsSnapshotFromDisk() {
  if (awsSnapshot) return;
  if (awsSnapshotLoadInFlight) {
    await awsSnapshotLoadInFlight;
    return;
  }

  awsSnapshotLoadInFlight = (async () => {
    try {
      const raw = await readFile(AWS_SNAPSHOT_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed?.prices || !parsed?.fetchedAtMs) return;

      const ageMs = Date.now() - Number(parsed.fetchedAtMs || 0);
      if (!Number.isFinite(ageMs) || ageMs > AWS_SNAPSHOT_MAX_AGE_MS) return;

      awsSnapshot = {
        prices: parsed.prices,
        mode: parsed.mode || "partial-live",
        fetchedAtMs: Number(parsed.fetchedAtMs),
      };
    } catch {
      // No on-disk snapshot yet or unreadable snapshot; continue with in-memory flow.
    }
  })();

  try {
    await awsSnapshotLoadInFlight;
  } finally {
    awsSnapshotLoadInFlight = null;
  }
}

async function saveAwsSnapshotToDisk(snapshot) {
  try {
    await mkdir(AWS_SNAPSHOT_DIR, { recursive: true });
    await writeFile(AWS_SNAPSHOT_FILE, JSON.stringify(snapshot), "utf8");
  } catch {
    // Disk cache write failures should not affect pricing API responses.
  }
}

async function refreshAwsSnapshot(awsTimeoutMs) {
  const catalog = clonePricingCatalog();
  const status = { aws: "fallback", gcp: "fallback", azure: "fallback" };

  await applyAwsLivePricing(catalog, status, awsTimeoutMs);
  if (status.aws === "fallback") {
    awsRefreshFailures += 1;
    const backoffMs = Math.min(AWS_RETRY_BASE_MS * (2 ** Math.max(0, awsRefreshFailures - 1)), AWS_RETRY_MAX_MS);
    awsNextRetryAt = Date.now() + backoffMs;
    return;
  }

  const prices = {};
  for (const [instance, spec] of Object.entries(catalog.aws)) {
    if (Number.isFinite(spec.price) && spec.price > 0) {
      prices[instance] = spec.price;
    }
  }

  awsSnapshot = {
    prices,
    mode: status.aws,
    fetchedAtMs: Date.now(),
  };

  awsRefreshFailures = 0;
  awsNextRetryAt = 0;
  await saveAwsSnapshotToDisk(awsSnapshot);
}

function ensureAwsBackgroundRefresh(enableAws, awsTimeoutMs) {
  if (!enableAws) return;

  const now = Date.now();
  if (awsNextRetryAt > now) return;

  const isFresh = awsSnapshot && now - awsSnapshot.fetchedAtMs < AWS_REFRESH_TTL_MS;
  if (isFresh || awsRefreshInFlight) return;

  awsRefreshInFlight = refreshAwsSnapshot(awsTimeoutMs).catch(() => null).finally(() => {
    awsRefreshInFlight = null;
  });
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
      let items = [];
      let pageUrl = url;
      let pageCount = 0;

      while (pageUrl && pageCount < 4) {
        const payload = await fetchJsonWithTimeout(pageUrl, 8000).catch(() => null);
        if (!payload) break;
        items = items.concat(payload.Items || []);
        pageUrl = payload.NextPageLink || null;
        pageCount += 1;
      }

      const valid = items.filter((item) => {
        const text = `${item.skuName || ""} ${item.productName || ""} ${item.meterName || ""}`;
        if (/(spot|low priority|promo|windows|hybrid benefit)/i.test(text)) return false;
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

function isCoreSku(description) {
  return /instance core/i.test(description);
}

function isRamSku(description) {
  return /instance ram/i.test(description);
}

function pickFamily(description) {
  if (/\be2\b/i.test(description)) return "e2";
  if (/\bn1\b/i.test(description)) return "n1";
  if (/\bn2\b/i.test(description)) return "n2";
  if (/\bc2\b/i.test(description)) return "c2";
  return null;
}

async function fetchAllGcpSkus(apiKey) {
  let pageToken = "";
  let pages = 0;
  const allSkus = [];

  while (pages < GCP_MAX_PAGES) {
    const query = new URLSearchParams({
      currencyCode: "USD",
      pageSize: String(GCP_PAGE_SIZE),
      key: apiKey,
    });

    if (pageToken) {
      query.set("pageToken", pageToken);
    }

    const url = `${GCP_BILLING_ENDPOINT}?${query.toString()}`;
    const payload = await fetchJsonWithTimeout(url, 12000);
    const skus = payload?.skus || [];
    allSkus.push(...skus);

    pageToken = payload?.nextPageToken || "";
    pages += 1;
    if (!pageToken) break;
  }

  return allSkus;
}

function buildGcpFamilyRates(skus) {
  const rates = {
    e2: { core: null, ram: null },
    n1: { core: null, ram: null },
    n2: { core: null, ram: null },
    c2: { core: null, ram: null },
  };

  for (const sku of skus) {
    const description = sku.description || "";
    if (/(preemptible|spot|committed use|gpu|sole tenancy|premium image)/i.test(description)) continue;
    if (sku.category?.usageType && sku.category.usageType !== "OnDemand") continue;
    if (sku.serviceRegions && !sku.serviceRegions.includes(GCP_REGION)) continue;

    const family = pickFamily(description);
    if (!family) continue;

    const expression = sku.pricingInfo?.[0]?.pricingExpression;
    const rate = toUsd(expression?.tieredRates?.[0]?.unitPrice);
    if (!rate) continue;

    if (isCoreSku(description)) {
      const current = rates[family].core;
      rates[family].core = current && current < rate ? current : rate;
      continue;
    }

    if (isRamSku(description)) {
      const current = rates[family].ram;
      rates[family].ram = current && current < rate ? current : rate;
    }
  }

  return rates;
}

async function applyGcpLivePricing(catalog, status, gcpApiKey) {
  if (!gcpApiKey) {
    status.gcp = "fallback";
    return;
  }

  const skus = await fetchAllGcpSkus(gcpApiKey).catch(() => []);
  if (!skus.length) {
    status.gcp = "fallback";
    return;
  }

  // Keep regex-based matching as a secondary fallback when family extraction misses a SKU.
  const familyRates = buildGcpFamilyRates(skus);
  const regexRates = {
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

  let updated = 0;
  for (const [instance, spec] of Object.entries(catalog.gcp)) {
    const family = familyByInstance[instance];
    if (!family) continue;

    const core = familyRates[family]?.core || regexRates[family]?.core;
    const ram = familyRates[family]?.ram || regexRates[family]?.ram;
    if (!core || !ram) continue;

    const hourly = spec.vcpu * core + spec.ram * ram;
    if (!Number.isFinite(hourly) || hourly <= 0) continue;
    spec.price = +hourly.toFixed(6);
    updated += 1;
  }

  const total = Object.keys(catalog.gcp).length;
  status.gcp = updated === total ? "live" : updated > 0 ? "partial-live" : "fallback";
}

export async function getLivePricingCatalog(options = {}) {
  const now = Date.now();
  if (!options.force && pricingCache && pricingCache.expiresAt > now) {
    return pricingCache.value;
  }

  await loadAwsSnapshotFromDisk();

  const catalog = clonePricingCatalog();
  const status = { aws: "fallback", gcp: "fallback", azure: "fallback" };
  const gcpApiKey = options.gcpApiKey;
  const enableAzure = options.enableAzure !== false;
  const enableAws = options.enableAws === true;
  const enableGcp = options.enableGcp !== false;
  const awsTimeoutMs = Number.isFinite(options.awsTimeoutMs) ? options.awsTimeoutMs : DEFAULT_AWS_TIMEOUT_MS;

  ensureAwsBackgroundRefresh(enableAws, awsTimeoutMs);
  applyAwsSnapshot(catalog, status);

  const jobs = [];

  if (enableGcp) {
    jobs.push(applyGcpLivePricing(catalog, status, gcpApiKey));
  }

  if (enableAzure) {
    jobs.push(applyAzureLivePricing(catalog, status));
  }

  await Promise.allSettled(jobs);

  const value = {
    catalog,
    status,
    fetchedAt: new Date().toISOString(),
  };

  const hasLive = Object.values(status).some((mode) => mode === "live" || mode === "partial-live");

  pricingCache = {
    value,
    // Keep live snapshots longer; retry quickly when every provider is fallback.
    expiresAt: now + (hasLive ? CACHE_TTL_MS : FALLBACK_RETRY_TTL_MS),
  };

  return value;
}
