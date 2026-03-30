import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { getLivePricingCatalog } from "./server/pricingService.js";

function pricingApiPlugin(options) {
  const handler = async (_req, res) => {
    try {
      const payload = await getLivePricingCatalog({
        gcpApiKey: options.gcpApiKey,
        enableAzure: options.enableAzure,
      });

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(payload));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Failed to fetch live pricing",
        })
      );
    }
  };

  return {
    name: "cloudtwin-pricing-api",
    configureServer(server) {
      server.middlewares.use("/api/pricing/live", handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/pricing/live", handler);
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      react(),
      tailwindcss(),
      pricingApiPlugin({
        gcpApiKey: env.GCP_PRICING_API_KEY || env.VITE_GCP_PRICING_API_KEY,
        enableAzure: env.ENABLE_AZURE_SERVER_FETCH !== "false",
      }),
    ],
  };
});
