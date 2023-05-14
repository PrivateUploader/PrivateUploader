import { AuthService } from "@app/services/auth.service"
import { Request, Response } from "express"
import { Service } from "typedi"
import Errors from "@app/lib/errors"
import Router from "express-promise-router"
import { InviteService } from "@app/services/invite.service"
import { AdminService } from "@app/services/admin.service"
import blacklist from "@app/lib/word-blacklist.json"
import rateLimits from "@app/lib/rateLimits"

@Service()
export class AuthController {
  router: any

  constructor(
    private readonly authService: AuthService,
    private readonly inviteService: InviteService,
    private readonly adminService: AdminService
  ) {
    this.configureRouter()
  }

  private configureRouter(): void {
    this.router = Router()

    /**
     * @swagger
     *
     * /api/v2/auth/login:
     *   post:
     *     description: Generates TPU Web session.
     *     tags:
     *       - AuthService
     *     produces:
     *       - application/json
     *     responses:
     *       200:
     *         description: OK
     *     parameters:
     *         - in: header
     *           name: Authorization
     *           schema:
     *             type: string
     *             format: TPU-KEY
     *           required: true
     */
    this.router.post(
      "/login",
      rateLimits.standardLimiter,
      async (req: Request, res: Response) => {
        if (!req.body.email || !req.body.password)
          throw Errors.INVALID_CREDENTIALS
        res.json(
          await this.authService.login(
            req.body.email,
            req.body.password,
            req.body.code
          )
        )
      }
    )
    this.router.post(
      "/register",
      rateLimits.mailLimiter,
      async (req: Request, res: Response) => {
        const invite = await this.inviteService.getInviteCache(
          req.body.inviteKey
        )
        if (!config.registrations) {
          if (!invite) throw Errors.INVITE_NOT_FOUND

          if (invite.registerUserId) throw Errors.INVITE_ALREADY_USED
        }
        // check the username to the blacklist
        if (blacklist.includes(req.body.username)) {
          throw Errors.INVALID_USERNAME
        }
        const register = await this.authService.register(
          req.body.username,
          req.body.password,
          req.body.email,
          invite?.id
        )

        // promo invite key
        if (
          req.body.inviteKey !== "1bf9e09f-d813-4783-9aa0-050a756e68cb" &&
          invite
        ) {
          await this.inviteService.useInvite(
            req.body.inviteKey,
            register.user.id
          )
        }
        res.json(register)
      }
    )

    this.router.post(
      "/recover",
      rateLimits.mailLimiter,
      async (req: Request, res: Response) => {
        const recovery = await this.authService.passwordReset(req.body.email)
        res.sendStatus(204)
        await this.adminService.sendEmail(
          {
            body: {
              intro: `Account recovery`,
              title: `Hello ${recovery.username}.`,
              action: [
                {
                  instructions: `You requested a password reset for your TPU account. Please use the button below to recover your account.`,
                  button: {
                    color: "#0190ea", // Optional action button color
                    text: "Recover account",
                    link:
                      config.hostnameWithProtocol +
                      "/passwordReset/" +
                      recovery.code
                  }
                }
              ]
            }
          },
          req.body.email,
          "TPU account password reset"
        )
      }
    )

    this.router.patch("/recover", async (req: Request, res: Response) => {
      res.json(
        await this.authService.passwordResetConfirm(
          req.body.code,
          req.body.password
        )
      )
    })
  }
}