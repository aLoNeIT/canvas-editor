export interface IObjectBoxMetric {
  width: number
  height: number
}

export function createObjectBoxMetric(
  width = 0,
  height = 0
): IObjectBoxMetric {
  return {
    width,
    height
  }
}
