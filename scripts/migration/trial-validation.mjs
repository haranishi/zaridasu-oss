// Bounded operation inputs for this local reference API, never SQL identifiers from callers.
export function failure(code, message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code })
}
export function invalid(message = 'Invalid or protected operation input') {
  throw failure('INVALID_INPUT', message)
}
export function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) invalid('A UUID is required')
  return value
}
export function fields(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![null, Object.prototype].includes(Object.getPrototypeOf(value))) invalid()
  const keys = Reflect.ownKeys(value)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (keys.length === 0 || keys.length > allowed.length
    || keys.some(key => !allowed.includes(key) || !Object.hasOwn(descriptors[key], 'value'))) invalid()
  return value
}
export function text(value, maximum) {
  if (typeof value !== 'string' || value.length > maximum * 2
    || [...value].length > maximum || !value.trim()) invalid('A bounded nonblank name is required')
  return value.trim()
}
