export interface IResolvedImageSize {
  width: number
  height: number
}

const imageSizeCache = new Map<string, Promise<IResolvedImageSize | null>>()

export function resolveImageSize(
  src: string
): Promise<IResolvedImageSize | null> {
  if (!src) {
    return Promise.resolve(null)
  }

  const cached = imageSizeCache.get(src)
  if (cached) {
    return cached
  }

  const task = new Promise<IResolvedImageSize | null>(resolve => {
    if (typeof Image === 'undefined') {
      resolve(null)
      return
    }

    const image = new Image()
    const finalize = (size: IResolvedImageSize | null) => {
      image.onload = null
      image.onerror = null
      resolve(size)
    }

    if (typeof image.setAttribute === 'function') {
      image.setAttribute('crossOrigin', 'Anonymous')
    }

    image.onload = () => {
      const width = image.naturalWidth || image.width
      const height = image.naturalHeight || image.height
      finalize(
        width > 0 && height > 0
          ? {
              width,
              height
            }
          : null
      )
    }
    image.onerror = () => finalize(null)
    image.src = src
  }).then(size => {
    if (!size) {
      imageSizeCache.delete(src)
    }
    return size
  })

  imageSizeCache.set(src, task)
  return task
}
