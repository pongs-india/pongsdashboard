/** @type {import('next').NextConfig} */
const securityHeaders = [
  // The app is never meant to be framed (clickjacking).
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]

const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Ship only the icons each page uses from lucide-react.
  experimental: { optimizePackageImports: ['lucide-react', 'recharts'] },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // API responses carry user data: never cache them in shared caches.
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
    ]
  },
}

export default nextConfig
