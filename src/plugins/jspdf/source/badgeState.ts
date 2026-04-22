import type Editor from '../../../editor'
import type { IAreaBadge, IBadge } from '../../../editor/interface/Badge'

export interface IJspdfBadgeStateSnapshot {
  main: IBadge | null
  areas: IAreaBadge[]
}

type ICommandWithBadgeSetter = Editor['command'] & {
  executeSetMainBadge(payload: IBadge | null): unknown
  executeSetAreaBadge(payload: IAreaBadge[]): unknown
}

const badgeStateMap = new WeakMap<object, IJspdfBadgeStateSnapshot>()
const trackedCommandSet = new WeakSet<object>()

function cloneBadge(badge: IBadge | null): IBadge | null {
  if (!badge) {
    return null
  }

  return {
    ...badge
  }
}

function cloneAreaBadge(areaBadge: IAreaBadge): IAreaBadge {
  return {
    areaId: areaBadge.areaId,
    badge: {
      ...areaBadge.badge
    }
  }
}

function createEmptySnapshot(): IJspdfBadgeStateSnapshot {
  return {
    main: null,
    areas: []
  }
}

export function installBadgeStateTracking(editor: Editor) {
  const command = editor.command as ICommandWithBadgeSetter
  if (trackedCommandSet.has(command)) {
    return
  }

  const state = createEmptySnapshot()
  badgeStateMap.set(command, state)
  trackedCommandSet.add(command)

  const originalSetMainBadge = command.executeSetMainBadge.bind(command)
  const originalSetAreaBadge = command.executeSetAreaBadge.bind(command)

  command.executeSetMainBadge = payload => {
    state.main = cloneBadge(payload)
    return originalSetMainBadge(payload)
  }

  command.executeSetAreaBadge = payload => {
    state.areas = payload.map(cloneAreaBadge)
    return originalSetAreaBadge(payload)
  }
}

export function getBadgeStateSnapshot(editor: Editor): IJspdfBadgeStateSnapshot {
  const state = badgeStateMap.get(editor.command)
  if (!state) {
    return createEmptySnapshot()
  }

  return {
    main: cloneBadge(state.main),
    areas: state.areas.map(cloneAreaBadge)
  }
}
