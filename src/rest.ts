export const methodNotFound = () => {
  return {
    statusCode: 405,
    body: JSON.stringify({
      error: {
        message: "method not supported.",
      },
    }),
  };
};

export const requireParameter = (name: string, value: string | undefined) => {
  if (!value) {
    return {
      statusCode: 422,
      body: JSON.stringify({
        error: {
          message: `parameter ${name} is required`,
        },
      }),
    };
  }
};
