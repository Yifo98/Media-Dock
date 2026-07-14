export type SchedulingProfile = 'safe' | 'balanced' | 'fast'

export type ScheduledTask = Readonly<{
  id: string
  sourceKind: 'local-file' | 'local-av-pair' | 'network-url'
  serviceName?: string
  authenticationProfileId?: string
}>

function maximumConcurrentTasks(profile: SchedulingProfile): number {
  if (profile === 'safe') return 1
  if (profile === 'fast') return 3
  return 2
}

function resourceLimits(task: ScheduledTask, profile: SchedulingProfile): readonly Readonly<{ key: string; limit: number }>[] {
  const taskLimit = maximumConcurrentTasks(profile)
  if (task.sourceKind !== 'network-url') {
    return Object.freeze([{ key: 'processing', limit: taskLimit }])
  }
  const service = task.serviceName?.trim().toLocaleLowerCase('en-US') || 'unknown'
  return Object.freeze([
    { key: `network-service:${service}`, limit: taskLimit },
    ...(task.authenticationProfileId
      ? [{ key: `authentication-profile:${task.authenticationProfileId}`, limit: taskLimit }]
      : []),
  ])
}

export async function runScheduledTaskBatch(
  tasks: readonly ScheduledTask[],
  profile: SchedulingProfile,
  runTask: (taskId: string) => Promise<unknown>,
): Promise<void> {
  const pending = [...tasks]
  const active = new Set<Promise<void>>()
  const resourceUse = new Map<string, number>()
  const maximumActive = maximumConcurrentTasks(profile)

  function canStart(task: ScheduledTask): boolean {
    return resourceLimits(task, profile).every((resource) => (resourceUse.get(resource.key) ?? 0) < resource.limit)
  }

  function reserve(task: ScheduledTask, delta: 1 | -1): void {
    for (const resource of resourceLimits(task, profile)) {
      const next = (resourceUse.get(resource.key) ?? 0) + delta
      if (next === 0) resourceUse.delete(resource.key)
      else resourceUse.set(resource.key, next)
    }
  }

  while (pending.length > 0 || active.size > 0) {
    while (active.size < maximumActive) {
      const nextIndex = pending.findIndex(canStart)
      if (nextIndex < 0) break
      const [task] = pending.splice(nextIndex, 1)
      reserve(task, 1)
      const operation: Promise<void> = runTask(task.id)
        .then(() => undefined)
        .catch(() => undefined)
        .finally(() => {
          reserve(task, -1)
          active.delete(operation)
        })
      active.add(operation)
    }
    if (active.size === 0) break
    await Promise.race(active)
  }
}
