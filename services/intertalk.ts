// Enable common-storage servers to intercommunicate and share data

import { CONTENT_GET_TIMEOUT } from "../shared/constants.ts";
import { IIntertalk } from "../types/storage.ts";

/**
 * Represents a client for interacting with other common-storage servers.
 */
export class IntertalkClient implements IIntertalk {
  /*
   * Fetches content from a remote common-storage server.
   */
  async contentGet(
    source: string,
    startId: number,
    username: string,
    password: string,
  ) {
    return await fetch(
      `${source}?startId=${startId}`,
      {
        method: "GET",
        signal: AbortSignal.timeout(CONTENT_GET_TIMEOUT),
        headers: {
          "Content-Type": "application/x-ndjson",
          "Authorization": "Basic " + btoa(`${username}:${password}`),
        },
        referrerPolicy: "no-referrer",
      },
    );
  }
}
