/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@mysten/sui',
    '@mysten/dapp-kit',
    '@mysten/bcs',
    '@mysten/utils',
    '@mysten/wallet-standard',
    '@mysten/slush-wallet',
  ],
};

export default nextConfig;
