const parts = {
  topic: {
    type: "string",
    description: "A logical grouping of data under a schema",
    minLength: 1,
    maxLength: 128,
    pattern: "^[^\/]+$",
  },
  subscriptionTopic: {
    type: "string",
    description: "A topic that remote subscriptions are synced into",
    minLength: 1,
    maxLength: 128,
    pattern: "^subscription\..+$",
  },
  username: {
    type: "string",
    minLength: 1,
    maxLength: 128,
  },
  role: {
    type: "string",
    minLength: 1,
    maxLength: 128,
  },
  startId: {
    description: "the ID from which we want to read content",
    anyOf: [
      {
        type: "number",
        minimum: 0,
      },
      {
        type: "string",
        pattern: "^[0-9]+$",
      },
    ],
  },
  batchId: {
    type: "string",
    minLength: 1,
    maxLength: 128,
  },
  description: {
    type: "string",
    minLength: 1,
    maxLength: 2048,
  },
  schema: {
    description: "a JSON schema. We're not validating the whole thing here!",
    type: "object",
  },
  content: {
    type: "array",
    description: "An array of content to add to the topic",
  },
  permission: {
    type: "object",
    description: "A permission a user can be granted",
    properties: {
      routes: {
        oneOf: [
          {
            type: "string",
            const: "ALL",
          },
          {
            type: "array",
            items: {
              enum: [
                "GET /content",
                "POST /content",
                "GET /topic",
                "POST /topic",
                "DELETE /topic",
              ],
            },
          },
        ],
      },
      topics: {
        oneOf: [
          {
            type: "string",
            const: "ALL",
          },
          {
            type: "string",
            const: "USER_CREATED",
          },
          {
            type: "array",
            items: {
              type: "string",
              minLength: 1,
              maxLength: 128,
            },
          },
        ],
      },
    },
    required: ["routes", "topics"],
  },
  password: {
    type: "string",
    description: "A user password",
    minLength: 12,
    maxLength: 128,
  },
  topicUrl: {
    type: "string",
    description: "A URL to a topic on another common-storage server",
    maxLength: 1024,
    pattern: "^http[s]{0,1}://.+/content/.+$",
  },
  frequency: {
    type: "number",
    description: "The frequency in seconds at which to sync the subscription",
    minimum: 60,
  },
};

export const schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  $defs: {
    params: {} as Record<string, unknown>,
    body: {} as Record<string, unknown>,
    response: {} as Record<string, unknown>,
  },
};

// ++++++ GET /content/:topic ++++++
schema.$defs.params.contentGet = {
  type: "object",
  properties: {
    topic: parts.topic,
  },
  required: ["topic"],
};

// ++++++ POST /content/:topic ++++++
schema.$defs.body.contentPost = {
  type: "object",
  description: "Add content to a topic",
  properties: {
    batchId: parts.batchId,
    content: parts.content,
  },
  required: ["content"],
};

schema.$defs.params.contentPost = {
  type: "object",
  properties: {
    topic: parts.topic,
  },
  required: ["topic"],
};

// ++++++ POST /topic/:topic ++++++
schema.$defs.body.topicPost = {
  type: "object",
  description: "Add a topic",
  properties: {
    description: parts.description,
    schema: parts.schema,
  },
  required: ["description"],
};

schema.$defs.params.topicPost = {
  type: "object",
  properties: {
    topic: parts.topic,
  },
  required: ["topic"],
};

// ++++++ GET /role/:name ++++++
schema.$defs.params.roleGet = {
  type: "object",
  properties: {
    role: parts.role,
  },
  required: ["role"],
};

// ++++++ POST /role/:name ++++++
schema.$defs.body.rolePost = {
  type: "object",
  description: "Add a role",
  properties: {
    permissions: {
      type: "array",
      items: parts.permission,
    },
  },
  required: ["permissions"],
};

schema.$defs.params.rolePost = {
  type: "object",
  properties: {
    role: parts.role,
  },
  required: ["role"],
};

// ++++++ POST /user/:name ++++++
schema.$defs.body.userPost = {
  type: "object",
  description: "Add a user",
  properties: {
    role: parts.role,
    password: parts.password,
  },
  required: ["role", "password"],
};

schema.$defs.params.userPost = {
  type: "object",
  properties: {
    name: parts.username,
  },
  required: ["name"],
};

// ++++++ POST /subscription/:topic ++++++
schema.$defs.body.subscriptionPost = {
  type: "object",
  description: "Add a subscription",
  properties: {
    source: parts.topicUrl,
    serviceAccount: parts.username,
    frequency: parts.frequency,
  },
  required: ["source", "serviceAccount", "frequency"],
};

schema.$defs.params.subscriptionPost = {
  type: "object",
  properties: {
    topic: parts.subscriptionTopic,
  },
  required: ["topic"],
};

// ++++++ GET /feed ++++++
schema.$defs.params.feedGet = {
  type: "object",
};

// ++++++ GET /user/:name ++++++
schema.$defs.params.userGet = {
  type: "object",
  properties: {
    name: parts.username,
  },
  required: ["name"],
};

export type Schema = typeof schema;
