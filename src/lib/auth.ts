import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

function getGitHubClientId(): string | undefined {
  return process.env.GITHUB_CLIENT_ID ?? process.env.GITHUB_ID;
}

function getGitHubClientSecret(): string | undefined {
  return process.env.GITHUB_CLIENT_SECRET ?? process.env.GITHUB_SECRET;
}

export function isAuthConfigured(): boolean {
  return !!(getGitHubClientId() && getGitHubClientSecret());
}

function normalizeUserId(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function resolveTokenUserId(token: { userId?: unknown; sub?: unknown; email?: unknown }) {
  return (
    normalizeUserId(token.userId) ?? normalizeUserId(token.sub) ?? normalizeUserId(token.email)
  );
}

const authResult = isAuthConfigured()
  ? NextAuth({
      secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
      trustHost: true,
      pages: {
        error: "/auth/error",
      },
      providers: [
        GitHub({
          clientId: getGitHubClientId()!,
          clientSecret: getGitHubClientSecret()!,
          issuer: "https://github.com/login/oauth",
          authorization: { params: { scope: "read:user user:email" } },
        }),
      ],
      callbacks: {
        async jwt({ token, account }) {
          if (account) {
            token.accessToken = account.access_token;
            token.provider = account.provider;
            token.userId = resolveTokenUserId(token) ?? normalizeUserId(account.providerAccountId);
          } else if (!token.userId) {
            token.userId = resolveTokenUserId(token);
          }
          return token;
        },
        async session({ session, token }) {
          session.accessToken = token.accessToken as string;
          const userId = resolveTokenUserId(token);
          if (session.user && userId) {
            session.user.id = userId;
          }
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
