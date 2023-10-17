export { validateSchema } from "../app.ts";

export function Context(request: any): any {
  const body = request.body;

  request.body = () => {
    return {
      value: body,
    };
  };
  return {
    state: request.state ?? {},
    request,
    params: request.params ?? {},
    response: {
      status: undefined,
      body: undefined,
    },
  };
}
