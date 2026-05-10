// Shared constants for common-storage — configuration paths and reserved names

// XDG config subdirectory name for common-storage
export const CONFIG_DIR_NAME = "common-storage";

// Filename of the JSON config file within the config directory
export const CONFIG_FILE_NAME = "config.json";

// Reserved topic name the server writes its own metrics into
export const METRICS_TOPIC = "common-storage";

// Default port the HTTP server listens on
export const DEFAULT_PORT = 2400;

// Default host address the server binds to
export const DEFAULT_HOST = "0.0.0.0";

// Name of the systemd user service unit
export const SYSTEMD_SERVICE_NAME = "common-storage";

// Default number of entries returned by paginated content endpoints
export const DEFAULT_PAGE_SIZE = 100;
