/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
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
