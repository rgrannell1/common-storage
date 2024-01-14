import { JSONError } from "../shared/errors.ts";
import type { Request } from "../types.ts";

export class BodyParsers {
  /*
   * Parse the request body as JSON
   *
   * @throws JSONError
   */
  static async json(request: Request) {
    try {
      const result = await request.body();
      return await result.value;
    } catch (_) {
      throw new JSONError("Failed to parse JSON body");
    }
  }
}

export class HeaderParsers {
  /*
   * Parses the Authorization header and returns the username and password
   */
  static basicAuthentication(
    request: Request,
  ): { username: string; password: string } {
    const auth = request.headers.get("Authorization");

    if (!auth) {
      return {
        username: "",
        password: "",
      };
    }

    const credentials = auth.match(/^Basic\s+(.*)$/i);

    if (!credentials || credentials.length < 2) {
      return {
        username: "",
        password: "",
      };
    }

    const [username, password] = atob(credentials[1]).split(":");

    return {
      username,
      password,
    };
  }
}
