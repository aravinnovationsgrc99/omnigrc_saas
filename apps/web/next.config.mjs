/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@omnigrc/shared'],
  output: 'standalone',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
