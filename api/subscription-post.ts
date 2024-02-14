import type {
  Config,
  IAddUser,
  IGetRole,
  IGetUser,
  ILogger,
  SchemaValidator,
} from "../types/index.ts";
import { RequestPart } from "../types/index.ts";
import { Status } from "../shared/status.ts";
import { BodyParsers } from "../services/parsers.ts";

type Services = {
  storage: IGetUser & IGetRole;
  logger: ILogger;
  schema: SchemaValidator;
};

type PostSubscriptionConfig = Partial<Config>;

export function postSubscription(_: PostSubscriptionConfig, services: Services) {
  const { storage, logger, schema } = services;

  return async function (ctx: any) {
    await logger.addActivity({
      request: ctx.request,
      message: "starting request",
      metadata: {},
    });

    const body = await BodyParsers.json(ctx.request);

    schema("subscriptionPost", ctx.params, RequestPart.Params);
    schema("subscriptionPost", body, RequestPart.Body);

    // check user permission role
    // check /feed
    // GET /content/:target
    // check prefixed subscription.
    // check schema matches
    // check no existing subscription
  };
}
