/**
 * Database and API constants.
 * Centralized constants for better maintainability.
 */

/** PostgreSQL duplicate key error code */
export const DUPLICATE_KEY_ERROR_CODE = '23505';

/** Maximum number of top casts to return */
export const MAX_TOP_CASTS = 5;

/** Maximum photos per cat profile */
export const MAX_CAT_PROFILE_PHOTOS = 10;

/** Delay in milliseconds to wait for DB writes to commit before querying */
export const DB_COMMIT_DELAY_MS = 100;

/** Delay in milliseconds between API requests to avoid rate limiting */
export const RATE_LIMIT_DELAY_MS = 100;

/** Maximum number of casts per API request */
export const CASTS_PER_PAGE = 100;

/** Maximum number of pages to fetch (safety limit for pagination) */
export const MAX_PAGES = 5000;

/** Catwalk account FID (used for engagement stats) */
export const CATWALK_VIEWER_FID = 318447;

