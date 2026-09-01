import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare"

const nextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "image.tmdb.org" }],
  },
}

export default nextConfig

initOpenNextCloudflareForDev()
