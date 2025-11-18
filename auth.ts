import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { upsertUser } from "@/lib/db"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: {
    signIn: "/",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      // Save or update user in PostgreSQL when they sign in
      if (user.email && account?.provider === "google") {
        try {
          const dbUser = await upsertUser({
            email: user.email,
            google_id: account.providerAccountId,
            name: user.name || null,
          })
          
          // Store database user ID in the user object
          user.id = dbUser.id.toString()
        } catch (error) {
          console.error("Error saving user to database:", error)
          // Allow sign in even if database save fails (graceful degradation)
        }
      }
      return true
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string
        // Add database user ID if available
        if (token.dbUserId) {
          session.user.dbId = token.dbUserId as number
        }
      }
      return session
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.sub = user.id
        // dbUserId is set in signIn callback, just preserve it here
        if (user.id && !isNaN(parseInt(user.id))) {
          token.dbUserId = parseInt(user.id)
        }
      }
      return token
    },
  },
})

