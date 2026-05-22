import type { NextConfig } from 'next';

const config: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'replicate.delivery' },
    ],
  },
};

export default config;
