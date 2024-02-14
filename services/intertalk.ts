// Enable common-storage servers to intercommunicate and share data

import { InvalidUrlError } from "../shared/errors.ts";

/**
 * Represents a client for interacting with other common-storage servers.
 *
 */
export class IntertalkClient {
  endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint
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
      throw new InvalidUrlError(`Invalid URL: ${url}`, {cause: err});
    }
  }

  /*
   *
   */
  async contentGet(topic: string) {
    try {
      const res = await fetch(`${this.endpoint}/content/${topic}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        referrerPolicy: 'no-referrer'
      });

    } catch (err) {
      // this can fail a million ways. Distinguish between the important ones

    }
  }
}
