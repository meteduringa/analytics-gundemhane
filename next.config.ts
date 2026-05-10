import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async headers() {
    const noStoreHeaders = [
      { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
      { key: "Pragma", value: "no-cache" },
      { key: "Expires", value: "0" },
      { key: "Surrogate-Control", value: "no-store" },
    ];

    return [
      {
        source: "/login",
        headers: noStoreHeaders,
      },
      {
        source: "/panel/:path*",
        headers: noStoreHeaders,
      },
      {
        source: "/api/panel/:path*",
        headers: noStoreHeaders,
      },
    ];
  },
};

export default nextConfig;
