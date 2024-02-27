// Enable common-storage servers to intercommunicate and share data

import { InvalidUrlError } from "../shared/errors.ts";
import { AIntertalk } from "../types/storage.ts";

/**
 * Represents a client for interacting with other common-storage servers.
 */
export class IntertalkClient extends AIntertalk {
  constructor() {
    super();
  }

  /* */
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
