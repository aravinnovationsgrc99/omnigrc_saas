/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@omnigrc/shared'],
  output: 'standalone',
};

export default nextConfig;
