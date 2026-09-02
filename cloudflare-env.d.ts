declare global {
  interface CloudflareEnv extends Env {
    TMDB_API_KEY: string
    OMDB_API_KEY: string
    AUTH_SECRET: string
    AUTH_TRUST_HOST: string
    AUTH_GOOGLE_ID: string
    AUTH_GOOGLE_SECRET: string
  }
}

export {}
