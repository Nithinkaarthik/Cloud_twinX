import { CLOUD_PRICING } from "../data/cloudPricing";

export function runSimulation(req, pricingCatalog = CLOUD_PRICING) {
  const { vcpu, ram, traffic, budget, preferredCloud } = req;
  const results = [];

  const clouds = preferredCloud === "all" ? ["aws", "gcp", "azure"] : [preferredCloud];

  clouds.forEach((cloud) => {
    Object.entries(pricingCatalog[cloud] || {}).forEach(([instance, spec]) => {
      if (spec.vcpu < vcpu || spec.ram < ram) return;

      const monthlyCost = spec.price * 730;
      const annualCost = monthlyCost * 12;
      const overProvisioned = spec.vcpu > vcpu * 1.5 || spec.ram > ram * 1.5;

      let score = 100;
      score -= Math.abs(spec.vcpu - vcpu) * 5;
      score -= Math.abs(spec.ram - ram) * 3;
      if (monthlyCost > budget) score -= 30;
      if (overProvisioned) score -= 15;

      const baseLatency = cloud === "aws" ? 12 : cloud === "gcp" ? 14 : 16;
      const latency = baseLatency + Math.random() * 5;
      const throughput = Math.min(traffic * 1.2, spec.vcpu * 500);

      results.push({
        cloud,
        instance,
        spec,
        monthlyCost: +monthlyCost.toFixed(2),
        annualCost: +annualCost.toFixed(2),
        score: Math.max(0, Math.min(100, +score.toFixed(1))),
        latency: +latency.toFixed(1),
        throughput: +throughput.toFixed(0),
        utilization: +((vcpu / spec.vcpu) * 100).toFixed(1),
        savings: budget - monthlyCost > 0 ? +(budget - monthlyCost).toFixed(2) : 0,
      });
    });
  });

  return results.sort((a, b) => b.score - a.score).slice(0, 6);
}
