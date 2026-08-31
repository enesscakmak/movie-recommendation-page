import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { D1Adapter } from "@auth/d1-adapter"
import { getCloudflareContext } from "@opennextjs/cloudflare"

export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  const { env } = await getCloudflareContext({ async: true })
  return {
    adapter: D1Adapter(env.DB),
    providers: [Google],
    session: { strategy: "database" },
    trustHost: true,
    callbacks: {
      session({ session, user }) {
        session.user.id = user.id
        return session
      },
    },
  }
})
