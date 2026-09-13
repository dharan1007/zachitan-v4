/** @type {import('next').NextConfig} */
const commercialMode = String(process.env.ZACHITAN_RUNTIME_MODE || 'research').trim().toLowerCase() === 'commercial';

const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    if (!commercialMode) return [];
    return [
      {
        source: '/api/data',
        destination: '/api/commercial-blocked',
      },
    ];
  },
  async headers() {
    const common = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), browsing-topics=()' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' }
    ];
    return [{ source: '/(.*)', headers: common }];
  }
};
export default nextConfig;
