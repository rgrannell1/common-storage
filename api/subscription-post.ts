import type {
  Config,
  IGetRole,
  IGetUser,
  IGetTopic,
  ILogger,
  SchemaValidator,
} from "../types/index.ts";
import { RequestPart } from "../types/index.ts";
import { Status } from "../shared/status.ts";
import { BodyParsers } from "../services/parsers.ts";
import { PERMISSIONLESS_ROLE } from "../shared/constants.ts";
import { IntertalkClient } from "../services/intertalk.ts";

type Services = {
  storage: IGetUser & IGetRole & IGetTopic;
  logger: ILogger;
  schema: SchemaValidator;
  intertalk: IntertalkClient;
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

    const { topic } = ctx.params.topic
    const { source, serviceAccount, frequency } = body;

    // check the target topic actually exists. JSON schema
    // will check it starts with subscription.
    const topicData = await storage.getTopic(topic);
    if (!topicData) {
      ctx.response.status = Status.NotFound;
      ctx.response.body = JSON.stringify({
        error: `Topic "${topic}" does not exist`,
      });
      return;
    }

    // check the service-account actually exists
    const userData = await storage.getUser(serviceAccount);
    if (!userData) {
      ctx.response.status = Status.NotFound;
      ctx.response.body = JSON.stringify({
        error: `User "${name}" does not exist`,
      });
      return;
    }

    if (userData.role !== PERMISSIONLESS_ROLE) {
      ctx.response.status = Status.UnprocessableEntity;
      ctx.response.body = JSON.stringify({
        error: `User "${name}" does not have the ${PERMISSIONLESS_ROLE} role, so cannot be used as a service-account for retrieving subscriptions from another server`,
      });
      return;
    }

    const client = new IntertalkClient(IntertalkClient.baseurl(source));

    try {
      await client.contentGet(topic);
    } catch (err) {

    }

    // GET /content/:target. Check topic, connection, content returned
    // write to check schema matches
    // check no existing subscription
  };
}
