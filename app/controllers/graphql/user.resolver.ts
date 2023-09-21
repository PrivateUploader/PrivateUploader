import {
  Arg,
  ClassType,
  Ctx,
  FieldResolver,
  Mutation,
  Query,
  Resolver,
  Root
} from "type-graphql"
import { UserUtilsService } from "@app/services/userUtils.service"
import { User } from "@app/models/user.model"
import { Service } from "typedi"
import { Session } from "@app/models/session.model"
import { Op } from "sequelize"
import { Subscription } from "@app/models/subscription.model"
import { Domain } from "@app/models/domain.model"
import { Plan } from "@app/models/plan.model"
import { Integration } from "@app/models/integration.model"
import { Badge } from "@app/models/badge.model"
import { Context } from "@app/types/graphql/context"
import { Notification } from "@app/models/notification.model"
import {
  PartialUserBase,
  partialUserBase,
  PartialUserFriend,
  PartialUserPublic
} from "@app/classes/graphql/user/partialUser"
import { createContext, EXPECTED_OPTIONS_KEY } from "dataloader-sequelize"
import { AutoCollectRule } from "@app/models/autoCollectRule.model"
import { UpdateUserInput } from "@app/classes/graphql/user/updateUser"
import { Authorization } from "@app/lib/graphql/AuthChecker"
import { UserProfileInput } from "@app/classes/graphql/user/profileInput"
import { GraphQLError } from "graphql/error"
import { Stats } from "@app/classes/graphql/core/core"
import { Friend } from "@app/models/friend.model"
import { FriendStatus } from "@app/classes/graphql/user/friends"
import { AutoCollectCache } from "@app/types/collection"
import { FriendNickname } from "@app/models/friendNickname"
import { BlockedUser } from "@app/models/blockedUser.model"
import { GqlError } from "@app/lib/gqlErrors"

@Resolver(User)
@Service()
export class UserResolver extends createBaseResolver("User", User) {
  @Authorization({
    scopes: "user.view",
    userOptional: true
  })
  @Query(() => User || null, {
    nullable: true
  })
  async currentUser(@Ctx() ctx: Context) {
    if (!ctx.user) return null
    return await this.findByPk(ctx.user.id, ctx)
  }

  @Authorization({
    userOptional: true,
    scopes: []
  })
  @Query(() => PartialUserPublic, {
    nullable: true
  })
  async user(@Arg("input") input: UserProfileInput, @Ctx() ctx: Context) {
    let user: User | null = null
    if (input.username) {
      user = await this.findByUsername(input.username, ctx)
    } else if (input.id) {
      user = await this.findByPk(input.id, ctx)
    } else {
      throw new GraphQLError("You must provide a username or id")
    }

    if (!user?.publicProfile && !ctx.user) {
      throw new GraphQLError(
        "You must be logged in to view this user's profile."
      )
    }

    if (!user || user.banned) {
      return null
    }
    if (await this.userUtilsService.blocked(ctx.user!!.id, user.id, true)) {
      throw new GqlError("BLOCKED")
    }
    return user
  }

  @Authorization({
    scopes: "user.modify"
  })
  @Mutation(() => Boolean)
  async updateUser(@Arg("input") input: UpdateUserInput, @Ctx() ctx: Context) {
    await this.userUtilsService.updateUser(ctx.user!!.id, input)
    return true
  }

  @FieldResolver(() => [Session])
  async sessions(@Root() user: User, @Ctx() ctx: Context) {
    return await user.$get("sessions")
  }

  @FieldResolver(() => Number)
  async pendingAutoCollects(@Root() user: User) {
    return await redis.json
      .get(`autoCollects:${user.id}`)
      .then((autoCollects: AutoCollectCache[]) => {
        if (!autoCollects?.length) return 0
        return autoCollects.reduce(
          (acc, curr) => acc + curr.autoCollectApprovals.length,
          0
        )
      })
  }

  @Authorization({
    scopes: ["user.view"],
    userOptional: true
  })
  @Query(() => [PartialUserFriend])
  async trackedUsers(@Ctx() ctx: Context): Promise<PartialUserFriend[]> {
    if (!ctx.user) return []

    return this.userUtilsService.trackedUsers(ctx.user.id)
  }

  @Authorization({
    scopes: ["user.view"],
    userOptional: true
  })
  @Query(() => [Number])
  async trackedUserIds(
    @Ctx() ctx: Partial<Context>,
    regenerate = false
  ): Promise<number[]> {
    return await this.userUtilsService.trackedUserIds(ctx.user?.id, false)
  }
}

@Resolver(PartialUserPublic)
@Service()
export class PartialUserPublicResolver extends createBaseResolver(
  "PartialUserPublic",
  PartialUserPublic
) {}

function createBaseResolver<T extends ClassType>(
  suffix: string,
  objectTypeCls: T
) {
  @Resolver(objectTypeCls)
  abstract class UserResolver {
    constructor(public userUtilsService: UserUtilsService) {}

    async findByPk(id: number, ctx: Context) {
      return await User.findByPk(id, {
        [EXPECTED_OPTIONS_KEY]: createContext(db),
        attributes: {
          include: ["alternatePasswords"]
        }
      })
    }

    async findByUsername(username: string, ctx: Context) {
      return await User.findOne({
        [EXPECTED_OPTIONS_KEY]: createContext(db),
        where: {
          username
        }
      })
    }

    @FieldResolver(() => [Badge])
    async badges(@Root() user: User) {
      return await user.$get("badges")
    }

    @FieldResolver(() => [Notification])
    async notifications(@Root() user: User, @Ctx() ctx: Context) {
      return await user.$get("notifications", {
        limit: 15,
        order: [["createdAt", "DESC"]]
      })
    }

    @FieldResolver(() => [Integration])
    async integrations(@Root() user: User, @Ctx() ctx: Context) {
      return await user.$get("integrations")
    }

    @FieldResolver(() => [Domain])
    async domain(@Root() user: User, @Ctx() ctx: Context) {
      return await user.$get("domain")
    }

    @FieldResolver(() => [Subscription])
    async subscription(@Root() user: User, @Ctx() ctx: Context) {
      return await user.$get("subscription")
    }

    @FieldResolver(() => Plan)
    async plan(@Root() user: User, @Ctx() ctx: Context) {
      return await user.$get("plan")
    }

    @FieldResolver(() => AutoCollectRule)
    async autoCollectRules(@Root() user: User, @Ctx() ctx: Context) {
      return await user.$get("autoCollectRules")
    }

    @FieldResolver(() => Stats || null)
    async stats(@Root() user: User, @Ctx() ctx: Context) {
      return await redis.json.get(`userStats:${user.id}`)
    }

    @FieldResolver(() => [Friend])
    async friends(@Root() user: User, @Ctx() ctx: Context) {
      if (!ctx.user) return []
      const friends = await Friend.findAll({
        where: {
          userId: user.id,
          status: "accepted"
        },
        attributes: ["friendId"]
      })
      return await Friend.findAll({
        where: {
          userId: ctx.user.id,
          friendId: friends.map((f) => f.friendId),
          status: "accepted"
        }
      })
    }

    @FieldResolver(() => FriendStatus)
    async friend(
      @Root() user: User,
      @Ctx() ctx: Context
    ): Promise<FriendStatus> {
      if (!ctx.user) return FriendStatus.NONE
      return (await this.userUtilsService.getFriendStatus(
        ctx.user.id,
        user.id,
        true
      )) as FriendStatus
    }

    async findByToken(token: string | null) {
      return await Session.findOne({
        where: {
          token,
          expiredAt: {
            [Op.gt]: new Date()
          }
        },
        include: [
          {
            model: User,
            as: "user",
            required: true,
            attributes: [
              ...partialUserBase,
              "itemsPerPage",
              "status",
              "storedStatus",
              "emailVerified"
            ]
          }
        ]
      })
    }
  }
  return UserResolver
}

@Resolver(PartialUserFriend)
@Service()
export class PartialUserFriendResolver {
  @FieldResolver(() => FriendNickname)
  async nickname(@Root() user: User, @Ctx() ctx: Context) {
    return user.$get("nickname", {
      where: {
        userId: ctx.user?.id
      }
    })
  }

  @FieldResolver(() => Boolean)
  async blocked(@Ctx() ctx: Context, @Root() user: User) {
    const block = await BlockedUser.findOne({
      where: {
        userId: user.id,
        blockedUserId: ctx.user!!.id
      }
    })
    if (!block) return false
    return !block.silent
  }
}

@Resolver(Badge)
@Service()
export class BadgeResolver {
  @FieldResolver(() => User)
  async users(@Root() badge: Badge) {
    return await badge.$get("users")
  }
}
