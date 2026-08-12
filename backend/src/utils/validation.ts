/**
 * Shared request-validation helpers for the route modules.
 */

/**
 * Flattens a zod failure into the single string the global error handler puts
 * on `{ error }` — `AppError` carries a message, not a payload, so the field
 * errors are joined rather than nested.
 */
export function validationMessage(flattened: {
  formErrors: string[];
  fieldErrors: Record<string, string[] | undefined>;
}): string {
  const fieldMessages = Object.entries(flattened.fieldErrors).flatMap(([field, messages]) =>
    (messages ?? []).map((message) => `${field}: ${message}`),
  );

  return [...flattened.formErrors, ...fieldMessages].join('; ') || 'Invalid request payload';
}

/**
 * Express 5 types every param as `string | string[]`, because a wildcard can
 * match repeatedly. A plain `:id` never does, so this narrows it back down.
 */
export function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}
