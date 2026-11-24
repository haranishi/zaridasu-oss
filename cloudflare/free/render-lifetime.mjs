/** Share only failure and render-completion metadata across coalesced requests. */
export class RenderLifetime {
  #groups = new Map()

  join(onDemandRevalidation) {
    let group = this.#groups.get(onDemandRevalidation)
    // Completed work can no longer acquire new coalesced waiters. A new scope
    // retries native storage even if old responses are still being returned.
    if (!group || [...group.members].every(member => member.complete)) {
      group = { failure: { failed: false }, members: new Set() }
      this.#groups.set(onDemandRevalidation, group)
    }
    const { promise: workDone, resolve } = Promise.withResolvers()
    const member = { workDone, complete: false }
    const pending = []
    group.members.add(member)
    return {
      failure: group.failure,
      track(promise) {
        const tracked = Promise.resolve(promise).catch(() => { group.failure.failed = true })
        pending.push(tracked)
        return tracked
      },
      async finish() {
        // Snapshot peer OWN work, whose completion never waits for peers. This
        // includes an owner's later waitUntil continuations without a wait cycle
        // or an unbounded wait for unrelated requests admitted in the future.
        const peers = [...group.members].map(peer => peer.workDone)
        try {
          for (let offset = 0; offset < pending.length;) {
            const batch = pending.slice(offset)
            offset += batch.length
            await Promise.all(batch)
          }
        } finally {
          member.complete = true
          resolve()
        }
        await Promise.all(peers)
      },
      close: () => {
        group.members.delete(member)
        if (group.members.size === 0 && this.#groups.get(onDemandRevalidation) === group) {
          this.#groups.delete(onDemandRevalidation)
        }
      },
    }
  }
}
