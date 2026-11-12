import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // File uploads go through server actions. The app caps files at 10 MB
    // (src/lib/files.ts); this leaves room for the rest of the form.
    serverActions: { bodySizeLimit: "11mb" },
    // The proxy (src/proxy.ts) buffers request bodies; match the limit above.
    proxyClientMaxBodySize: "11mb",
  },
};

export default nextConfig;
