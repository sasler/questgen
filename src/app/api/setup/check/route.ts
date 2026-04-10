import { NextResponse } from "next/server";
import { isAuthConfigured } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const status = {
    auth: isAuthConfigured(),
    secret: !!(process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET),
    redis: !!(
      process.env.UPSTASH_REDIS_REST_URL &&
      process.env.UPSTASH_REDIS_REST_TOKEN
    ),
  };

  let redisConnected = false;
  if (status.redis) {
    try {
      const { Redis } = await import("@upstash/redis");
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      });
      await redis.ping();
      redisConnected = true;
    } catch {
      redisConnected = false;
    }
  }

  return NextResponse.json({
    auth: status.auth,
    secret: status.secret,
    redis: status.redis,
    redisConnected,
    allConfigured: status.auth && status.secret && status.redis,
  });
}
