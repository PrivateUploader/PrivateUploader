import { Container } from "typedi"
import { UserResolver } from "@app/controllers/graphql/user.resolver"
import { AccessLevel } from "@app/enums/admin/AccessLevel"
import { Context } from "@app/types/graphql/context"
import { createContext } from "@app/lib/dataloader"

export default async function generateContext(ctx: any): Promise<Context> {
  let token
  let session

  token =
    ctx?.request?.headers?.get("Authorization") ||
    ctx?.connectionParams?.authorization ||
    ctx?.connectionParams?.token ||
    ""

  if (global.config?.finishedSetup) {
    const userResolver = Container.get(UserResolver)
    session = await redis.json.get(`session:${token}`)
    const user = await redis.json.get(`user:${session?.userId || 0}`)
    if (session && user) {
      session.user = user
    } else {
      session = await userResolver.findByToken(token)
      if (session) {
        redis.json.set(
          `session:${token}`,
          "$",
          {
            ...("toJSON" in session ? session.toJSON() : session),
            user: undefined
          },
          {
            ttl: session?.expiredAt
              ? dayjs(session.expiredAt).diff(dayjs(), "second")
              : 60 * 60 * 24 * 7
          }
        )

        redis.json.set(`user:${session.userId}`, "$", session.user)
      }
    }
  }

  return {
    user: session?.user,
    client: {
      version:
        ctx?.request?.headers?.get("X-TPU-Client-Version") ||
        ctx?.connectionParams?.["x-tpu-client-version"] ||
        "unknown",
      name:
        ctx?.request?.headers?.get("X-TPU-Client") ||
        ctx?.connectionParams?.["x-tpu-client"] ||
        "unknown"
    },
    scopes: session?.scopes || "",
    role: session
      ? session?.user?.administrator
        ? AccessLevel.ADMIN
        : session?.user?.moderator
          ? AccessLevel.MODERATOR
          : AccessLevel.USER
      : AccessLevel.NO_ACCESS,
    token,
    dataloader: global.config?.finishedSetup ? createContext(db) : null,
    ip: ctx.extra?.ip || ctx.req?.ip || "0.0.0.0",
    meta: {},
    request: ctx.request,
    req: ctx.req,
    cache: global.gqlCache,
    id: ctx.id
  } as Context
}
