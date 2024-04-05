/**
 * An error that is thrown when input validation fails
 *
 * @extends Error
 */
export class InputValidationError extends Error {}

/**
 * An error that is thrown when a topic is not found
 *
 * @extends Error
 */
export class TopicNotFoundError extends Error {}

/*
 * An error that is thrown when a topic is not empty
 */
export class TopicNotEmptyError extends Error {}

/**
 * An error that is thrown when a user is not found
 *
 * @extends Error
 */
export class UserNotFound extends Error {}

/**
 * An error that is thrown when a user is found to have
 * permissions that they should not have
 *
 * @extends Error
 */
export class UserHasPermissionsError extends Error {}

/*
 * An error that is thrown when a network error occurs
 *
 * @extends Error
 */
export class NetworkError extends Error {}

/**
 * An error that is thrown when attempting to submit
 * schema-invalid entries to the database
 *
 * @extends Error
 */
export class TopicValidationError extends Error {}

/**
 * An error that is thrown when attempting to submit
 * schema-invalid entries to the database
 *
 * @extends Error
 */
export class ContentInvalidError extends Error {}

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

/**
 * An error indicating that a batch is closed
 *
 * @extends Error
 */
export class BatchClosedError extends Error {}

/**
 * An error indicating that a subscription is already present
 *
 * @extends Error
 */
export class MultipleSubscriptionError extends Error {}

/**
 * An error indicating that a subscription is not authorised
 *
 * @extends Error
 */
export class SubscriptionAuthorisationError extends Error {}

/**
 * An environmental variable is missing
 *
 * @extends Error
 */
export class EnvironmentVariableMissingError extends Error {}

/**
 * A subscription is present
 *
 * @extends Error
 */
export class SubscriptionPresentError extends Error {}
