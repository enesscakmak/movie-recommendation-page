import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare"

const nextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "image.tmdb.org" }],
  },
  experimental: {
    webpackBuildWorker: true,
    parallelServerBuildTraces: true,
    parallelServerCompiles: true,
  },
}

export default nextConfig

initOpenNextCloudflareForDev()
