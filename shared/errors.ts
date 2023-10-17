/**
 * An error that is thrown when input validation fails
 *
 * @extends Error
 */
export class InputValidationError extends Error {}

export class TopicValidationError extends Error {}

export class JSONError extends Error {}

export class ConfigurationMissingError extends Error {}

/**
 * An error that is thrown when attempting to delete a role
 * that is currently in use by a user
 *
 * @extends Error
 */
export class RoleInUseError extends Error {}
