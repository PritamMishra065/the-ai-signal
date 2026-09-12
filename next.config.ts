import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  logging: { fetches: { fullUrl: false } },
};

export default nextConfig;
