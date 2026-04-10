import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

const githubId = process.env.GITHUB_ID;
const githubSecret = process.env.GITHUB_SECRET;

export function isAuthConfigured(): boolean {
  return !!(githubId && githubSecret);
}

const authResult = isAuthConfigured()
  ? NextAuth({
      secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
      providers: [
        GitHub({
          clientId: githubId!,
          clientSecret: githubSecret!,
          authorization: { params: { scope: "read:user user:email" } },
        }),
      ],
      callbacks: {
        async jwt({ token, account }) {
          if (account) {
            token.accessToken = account.access_token;
            token.provider = account.provider;
          }
          return token;
        },
        async session({ session, token }) {
          session.accessToken = token.accessToken as string;
          return session;
        },
      },
    })
  : {
      handlers: {
        GET: async () => new Response("Auth not configured", { status: 503 }),
        POST: async () => new Response("Auth not configured", { status: 503 }),
      },
      auth: async () => null,
      signIn: async () => undefined,
      signOut: async () => undefined,
    };

export const { handlers, auth, signIn, signOut } = authResult;
