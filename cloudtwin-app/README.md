# React + Vite....
..
This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Free Live Pricing API Key Setup (GCP)

CloudTwin can use the free Google Cloud Billing Catalog API to fetch GCP live pricing.

1. Open Google Cloud Console: https://console.cloud.google.com
2. Create or select a project.
3. Enable API: Billing Catalog API.
4. Go to APIs and Services -> Credentials -> Create Credentials -> API key.
5. Copy the key and set it in your env file:

```bash
GCP_API_KEY=your_new_key_here
```

You can also use this fallback variable:

```bash
FREE_PRICING_API_KEY=your_new_key_here
```

Key priority in app:

1. `GCP_API_KEY`
2. `FREE_PRICING_API_KEY`

After updating the key, restart backend server:

```bash
npm run server
```

To rotate/change the key later:

1. Generate a new API key in Google Cloud Console.
2. Replace the old value in `.env`.
3. Restart server.
4. (Recommended) Delete or disable the old key in Google Cloud Console.

## No-Billing Mode (No Google Billing Account)

If you do not want to enable a Google billing account, CloudTwin can still run with reliable live pricing:

1. Azure live pricing (free, no key)
2. AWS background live pricing (free, no key)
3. GCP fallback dataset (no key)

Use these `.env` values:

```bash
ENABLE_AWS_PRICING=true
ENABLE_AZURE_PRICING=true
ENABLE_GCP_PRICING=true
GCP_API_KEY=
FREE_PRICING_API_KEY=
```

Notes:

1. Azure is fetched live on each refresh cycle.
2. AWS is refreshed in background cache so API responses stay fast.
3. GCP remains fallback unless you provide a GCP key.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
