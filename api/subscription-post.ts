import type {
  Config,
  ILogger,
  SchemaValidator,
  SubscriptionStorage,
} from "../types/index.ts";
import { RequestPart } from "../types/index.ts";
import { Status } from "../shared/status.ts";
import { BodyParsers } from "../services/parsers.ts";
import { IntertalkClient } from "../services/intertalk.ts";
import {
  ContentInvalidError,
  MultipleSubscriptionError,
  NetworkError,
  SubscriptionAuthorisationError,
  TopicNotFoundError,
  TopicValidationError,
  UserHasPermissionsError,
  UserNotFound,
} from "../shared/errors.ts";
import * as Iter from "../shared/iter.ts";
import { Subscriptions } from "../services/subscriptions.ts";
import { JSONError } from "../shared/errors.ts";
import {
  SubscriptionSyncProgress,
  SubscriptionSyncState,
} from "../types/index.ts";

type Services = {
  storage: SubscriptionStorage;
  logger: ILogger;
  schema: SchemaValidator;
  intertalk: typeof IntertalkClient;
};

type PostSubscriptionConfig = Partial<Config>;

// A map of error-constructors to response codes
const errorMap = new Map<any, number>([
  [TopicNotFoundError, Status.NotFound],
  [UserNotFound, Status.NotFound],
  [UserHasPermissionsError, Status.UnprocessableEntity],
  [NetworkError, Status.InternalServerError],
  [JSONError, Status.BadGateway],
  [ContentInvalidError, Status.BadGateway],
  [NetworkError, Status.BadGateway],
  [TopicValidationError, Status.UnprocessableEntity],
  [SubscriptionAuthorisationError, Status.Unauthorized],
  [MultipleSubscriptionError, Status.UnprocessableEntity],
]);

export function postSubscription(
  _: PostSubscriptionConfig,
  services: Services,
) {
  const { storage, logger, schema } = services;

  return async function (ctx: any) {
    const body = await BodyParsers.json(ctx.request);

    schema("subscriptionPost", ctx.params, RequestPart.Params);
    schema("subscriptionPost", body, RequestPart.Body);

    const { topic } = ctx.params;
    const { source, serviceAccount, frequency } = body;

    const subscriptionClient = new Subscriptions(
      storage,
      logger,
      IntertalkClient,
    );
    const syncGenerator = subscriptionClient.sync(
      source,
      topic,
      serviceAccount,
      frequency,
    );

    try {
      await Iter.takeWhile(({ state }: SubscriptionSyncProgress) => {
        return state !== SubscriptionSyncState.FIRST_CONTENT_SAVED;
      }, syncGenerator);

      // this should be logged
      setTimeout(async () => {
        for await (const progress of syncGenerator) {
          await storage.setSubscriptionProgress(topic, progress);
        }
      });
    } catch (err) {
      let code = Status.InternalServerError;

      // find an appropriate response code, by checking the error type
      for (const [error, status] of errorMap) {
        if (err instanceof error) {
          code = status;
          break;
        }
      }

      await logger.error("Error reading subscription", ctx.request, {
        error: err.message,
        stack: err.stack,
      });

      ctx.response.status = code;
      // pass the message forward
      ctx.response.body = JSON.stringify({
        error: code === Status.InternalServerError
          ? "Internal server error"
          : err.message,
      });
      return;
    }

    ctx.response.status = Status.OK;
    ctx.response.body = JSON.stringify({});
  };
}
