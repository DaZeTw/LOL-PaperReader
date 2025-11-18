import "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      dbId?: number
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}

