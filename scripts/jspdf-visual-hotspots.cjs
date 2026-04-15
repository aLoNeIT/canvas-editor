const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

function paethPredictor(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

function decodePng(filePath) {
  const data = fs.readFileSync(filePath)
  const signature = '89504e470d0a1a0a'
  if (data.subarray(0, 8).toString('hex') !== signature) {
    throw new Error(`Invalid PNG signature: ${filePath}`)
  }

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idatParts = []

  while (offset < data.length) {
    const length = data.readUInt32BE(offset)
    offset += 4
    const type = data.subarray(offset, offset + 4).toString('ascii')
    offset += 4
    const chunk = data.subarray(offset, offset + length)
    offset += length
    offset += 4

    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0)
      height = chunk.readUInt32BE(4)
      bitDepth = chunk[8]
      colorType = chunk[9]
    } else if (type === 'IDAT') {
      idatParts.push(chunk)
    } else if (type === 'IEND') {
      break
    }
  }

  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(
      `Unsupported PNG format in ${filePath}: bitDepth=${bitDepth}, colorType=${colorType}`
    )
  }

  const compressed = Buffer.concat(idatParts)
  const raw = zlib.inflateSync(compressed)
  const stride = width * 4
  const bytes = Buffer.alloc(width * height * 4)

  let rawOffset = 0
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOffset++]
    const rowStart = y * stride
    for (let x = 0; x < stride; x++) {
      const current = raw[rawOffset++]
      const left = x >= 4 ? bytes[rowStart + x - 4] : 0
      const up = y > 0 ? bytes[rowStart + x - stride] : 0
      const upLeft = y > 0 && x >= 4 ? bytes[rowStart + x - stride - 4] : 0
      let value = 0
      switch (filterType) {
        case 0:
          value = current
          break
        case 1:
          value = (current + left) & 0xff
          break
        case 2:
          value = (current + up) & 0xff
          break
        case 3:
          value = (current + Math.floor((left + up) / 2)) & 0xff
          break
        case 4:
          value = (current + paethPredictor(left, up, upLeft)) & 0xff
          break
        default:
          throw new Error(`Unsupported PNG filter type ${filterType}`)
      }
      bytes[rowStart + x] = value
    }
  }

  return { width, height, data: bytes }
}

function computeHotspots(left, right, blockSize = 64, limit = 15) {
  const width = Math.min(left.width, right.width)
  const height = Math.min(left.height, right.height)
  const blockList = []

  for (let y = 0; y < height; y += blockSize) {
    for (let x = 0; x < width; x += blockSize) {
      const blockWidth = Math.min(blockSize, width - x)
      const blockHeight = Math.min(blockSize, height - y)
      let total = 0
      let gt30 = 0
      const pixelCount = blockWidth * blockHeight

      for (let yy = 0; yy < blockHeight; yy++) {
        for (let xx = 0; xx < blockWidth; xx++) {
          const index = ((y + yy) * left.width + (x + xx)) * 4
          const channelDiff = (
            Math.abs(left.data[index] - right.data[index]) +
            Math.abs(left.data[index + 1] - right.data[index + 1]) +
            Math.abs(left.data[index + 2] - right.data[index + 2])
          ) / 3
          total += channelDiff
          if (channelDiff > 30) {
            gt30 += 1
          }
        }
      }

      blockList.push({
        x,
        y,
        width: blockWidth,
        height: blockHeight,
        avg: total / pixelCount,
        pct_gt30: gt30 / pixelCount
      })
    }
  }

  return blockList.sort((a, b) => b.avg - a.avg).slice(0, limit)
}

function main() {
  const root = process.cwd()
  const artifactDir = path.join(root, 'cypress', 'artifacts', 'jspdf-visual')
  const domMetaPath = path.join(artifactDir, 'dom-meta.json')
  if (!fs.existsSync(domMetaPath)) {
    throw new Error('Missing dom-meta.json, run visual-export-check first')
  }

  const domMeta = JSON.parse(fs.readFileSync(domMetaPath, 'utf8'))
  const hotspotList = domMeta.pageList.map(page => {
    const pageNo = page.index + 1
    const canvasPath = path.join(artifactDir, `page-${pageNo}-canvas.png`)
    const pdfPath = path.join(
      artifactDir,
      'pdfjs-pages',
      `page-${pageNo}.png`
    )
    const left = decodePng(canvasPath)
    const right = decodePng(pdfPath)
    return {
      pageNo,
      topBlocks: computeHotspots(left, right)
    }
  })

  fs.writeFileSync(
    path.join(artifactDir, 'diff-hotspots.json'),
    JSON.stringify(hotspotList, null, 2)
  )
}

main()
