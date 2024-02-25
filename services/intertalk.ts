// Enable common-storage servers to intercommunicate and share data

import { InvalidUrlError } from "../shared/errors.ts";
import { AIntertalk } from "../types/storage.ts";

/**
 * Represents a client for interacting with other common-storage servers.
 */
export class IntertalkClient extends AIntertalk {
  endpoint: string;

  constructor(endpoint: string) {
    super();
    this.endpoint = endpoint;
  }

  /**
   * Returns the base URL of the given URL.
   *
   * @param url - The URL to extract the base URL from.
   * @returns The base URL of the given URL.
   *
   * @throws {InvalidUrlError} If the URL is invalid.
   */
  static baseurl(url: string) {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.origin;
    } catch (err) {
      throw new InvalidUrlError(`Invalid URL: ${url}`, { cause: err });
    }
  }

  /* */
  async contentGet(
    topic: string,
    startId: number,
    username: string,
    password: string,
  ) {
    const res = await fetch(
      `${IntertalkClient.baseurl(this.endpoint)}/content/${topic}?startId=${startId}`,
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
