/** Record failures around the actual native binding before OpenNext can swallow them. */
export function guardD1Binding(database, failure) {
  const seen = new WeakMap()
  const failed = error => { failure.failed = true; throw error }
  function wrap(target) {
    if (!target || typeof target !== 'object') return target
    if (seen.has(target)) return seen.get(target)
    // SDKs assign instrumented methods to bindings, sessions and statements. Keep
    // those assignments on a request-local facade, never on the durable native object.
    const methods = Object.create(null)
    const facade = new Proxy(methods, {
      has: (object, name) => Reflect.has(object, name) || Reflect.has(target, name),
      get(object, name, receiver) {
        if (Object.hasOwn(object, name)) return Reflect.get(object, name, receiver)
        const value = Reflect.get(target, name, target)
        if (typeof value !== 'function') return value
        const method = (...args) => {
          try {
            if (failure.failed) throw new Error('D1 cache request is already unavailable')
            const result = Reflect.apply(value, target, args)
            return result && typeof result.then === 'function' ? result.then(value => value, failed)
              : result && typeof result === 'object' && (result.prepare || result.bind || result.run) ? wrap(result) : result
          } catch (error) { return failed(error) }
        }
        Reflect.set(object, name, method)
        return method
      },
    })
    seen.set(target, facade)
    return facade
  }
  return wrap(database)
}
