// Ajv-based topic payload validation — compiles JSON Schema files at startup, validates writes at runtime
// @work.md

// deno-lint-ignore-file no-explicit-any
import Ajv2020Module from "ajv/dist/2020";
import type { ValidateFunction } from "ajv";
import type { TopicConfig } from "../../commons/config.ts";

const Ajv2020 = (Ajv2020Module as any).default ?? Ajv2020Module;
const ajv = new Ajv2020();

export interface IValidateTopicPayload {
  validate(topic: string, payload: unknown): string | null;
}

export class TopicSchemaRegistry implements IValidateTopicPayload {
  #validators = new Map<string, ValidateFunction>();

  register(topic: string, schema: Record<string, unknown>): void {
    this.#validators.set(topic, ajv.compile(schema));
  }

  // Returns null if the payload is valid or no schema is registered for the topic.
  // Returns an error message string if the payload fails validation.
  validate(topic: string, payload: unknown): string | null {
    const validator = this.#validators.get(topic);
    if (validator === undefined) return null;
    if (validator(payload)) return null;
    return ajv.errorsText(validator.errors);
  }
}

export async function buildSchemaRegistry(
  events: TopicConfig[],
  objects: TopicConfig[],
): Promise<TopicSchemaRegistry> {
  const registry = new TopicSchemaRegistry();

  for (const topic of [...events, ...objects]) {
    if (topic.schema !== undefined) {
      const text = await Deno.readTextFile(topic.schema);
      registry.register(topic.name, JSON.parse(text));
    }
  }

  return registry;
}
