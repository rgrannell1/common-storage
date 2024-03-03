// Enable common-storage servers to intercommunicate and share data

import { AIntertalk } from "../types/storage.ts";

/**
 * Represents a client for interacting with other common-storage servers.
 */
export class IntertalkClient extends AIntertalk {
  constructor() {
    super();
  }

  /*
   * Fetches content from a remote common-storage server.
   *
   */
  async contentGet(
    source: string,
    startId: number,
    username: string,
    password: string,
  ) {
    const res = await fetch(
      `${source}?startId=${startId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Basic " + btoa(`${username}:${password}`),
        },
        referrerPolicy: "no-referrer",
      },
    );

    return res;
  }
}
