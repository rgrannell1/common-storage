/**
 * An error that is thrown when input validation fails
 *
 * @extends Error
 */
export class InputValidationError extends Error {}

/**
 * An error that is thrown when attempting to submit
 * schema-invalid entries to the database
 *
 * @extends Error
 */
export class TopicValidationError extends Error {}

/**
 * An error that is thrown when attempting to parse invalid JSON
 *
 * @extends Error
 */
export class JSONError extends Error {}

/**
 * An error that is thrown when configuration is missing
 *
 * @extends Error
 */
export class ConfigurationMissingError extends Error {}

/**
 * An error that is thrown when attempting to delete a role
 * that is currently in use by a user
 *
 * @extends Error
 */
export class RoleInUseError extends Error {}

/**
 * An error that is thrown when an invalid URL is encountered
 *
 * @extends Error
 */
export class InvalidUrlError extends Error {}
