const QR_VERSION = 5
const QR_SIZE = 37
const QR_DATA_CODEWORDS = 108
const QR_ECC_CODEWORDS = 26
const QR_ALIGNMENT_CENTERS = [6, 30]
const QR_EC_LEVEL_BITS = 1 // L
const QR_GALOIS = 0x11d
const QR_FORMAT_POLY = 0x537
const QR_FORMAT_MASK = 0x5412

const gfExp = new Array(512).fill(0)
const gfLog = new Array(256).fill(0)
let gfReady = false

function initGf() {
  if (gfReady) return

  let value = 1
  for (let i = 0; i < 255; i++) {
    gfExp[i] = value
    gfLog[value] = i
    value <<= 1
    if (value & 0x100) {
      value ^= QR_GALOIS
    }
  }
  for (let i = 255; i < gfExp.length; i++) {
    gfExp[i] = gfExp[i - 255]
  }
  gfReady = true
}

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0
  return gfExp[gfLog[a] + gfLog[b]]
}

function gfPow(power) {
  initGf()
  return gfExp[power % 255]
}

function polyMultiply(left, right) {
  const product = new Array(left.length + right.length - 1).fill(0)
  for (let i = 0; i < left.length; i++) {
    for (let j = 0; j < right.length; j++) {
      product[i + j] ^= gfMul(left[i], right[j])
    }
  }
  return product
}

function buildGenerator(degree) {
  initGf()
  let polynomial = [1]
  for (let i = 0; i < degree; i++) {
    polynomial = polyMultiply(polynomial, [1, gfPow(i)])
  }
  return polynomial
}

const generator = buildGenerator(QR_ECC_CODEWORDS)

class BitBuffer {
  constructor() {
    this.bits = []
  }

  put(value, length) {
    for (let i = length - 1; i >= 0; i--) {
      this.bits.push((value >>> i) & 1)
    }
  }

  putBytes(bytes) {
    for (const byte of bytes) {
      this.put(byte, 8)
    }
  }

  padToByte() {
    while (this.bits.length % 8 !== 0) {
      this.bits.push(0)
    }
  }

  toBytes() {
    const bytes = []
    for (let i = 0; i < this.bits.length; i += 8) {
      let value = 0
      for (let j = 0; j < 8; j++) {
        value = (value << 1) | this.bits[i + j]
      }
      bytes.push(value)
    }
    return bytes
  }
}

function toUtf8Bytes(value) {
  return Array.from(new TextEncoder().encode(value))
}

function encodeDataCodewords(text) {
  const bytes = toUtf8Bytes(text)
  if (bytes.length > 106) {
    throw new Error('QR payload is too long for the local encoder.')
  }

  const buffer = new BitBuffer()
  buffer.put(0b0100, 4)
  buffer.put(bytes.length, 8)
  buffer.putBytes(bytes)

  const capacityBits = QR_DATA_CODEWORDS * 8
  const remainingForTerminator = capacityBits - buffer.bits.length
  if (remainingForTerminator < 0) {
    throw new Error('QR payload is too long for the local encoder.')
  }

  buffer.put(0, Math.min(4, remainingForTerminator))
  buffer.padToByte()

  let padByte = 0xec
  while (buffer.bits.length < capacityBits) {
    buffer.put(padByte, 8)
    padByte = padByte === 0xec ? 0x11 : 0xec
  }

  return buffer.toBytes()
}

function encodeEcc(dataCodewords) {
  const buffer = dataCodewords.concat(new Array(QR_ECC_CODEWORDS).fill(0))
  for (let i = 0; i < dataCodewords.length; i++) {
    const factor = buffer[i]
    if (factor === 0) continue
    for (let j = 0; j < generator.length; j++) {
      buffer[i + j] ^= gfMul(generator[j], factor)
    }
  }
  return buffer.slice(dataCodewords.length)
}

function createBaseMatrix() {
  const matrix = Array.from({ length: QR_SIZE }, () => Array(QR_SIZE).fill(null))
  const reserved = Array.from({ length: QR_SIZE }, () => Array(QR_SIZE).fill(false))

  const reserve = (row, col, value) => {
    if (row < 0 || col < 0 || row >= QR_SIZE || col >= QR_SIZE) return
    matrix[row][col] = value ? 1 : 0
    reserved[row][col] = true
  }

  const placeFinder = (top, left) => {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const row = top + dy
        const col = left + dx
        if (row < 0 || col < 0 || row >= QR_SIZE || col >= QR_SIZE) continue

        let dark = false
        if (dy >= 0 && dy <= 6 && dx >= 0 && dx <= 6) {
          dark =
            dy === 0 ||
            dy === 6 ||
            dx === 0 ||
            dx === 6 ||
            (dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4)
        }

        reserve(row, col, dark)
      }
    }
  }

  const placeAlignment = (centerRow, centerCol) => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const row = centerRow + dy
        const col = centerCol + dx
        if (row < 0 || col < 0 || row >= QR_SIZE || col >= QR_SIZE) continue
        const dark = Math.max(Math.abs(dx), Math.abs(dy)) === 2 || (dx === 0 && dy === 0)
        reserve(row, col, dark)
      }
    }
  }

  placeFinder(0, 0)
  placeFinder(0, QR_SIZE - 7)
  placeFinder(QR_SIZE - 7, 0)

  for (let i = 8; i < QR_SIZE - 8; i++) {
    const dark = i % 2 === 0
    reserve(6, i, dark)
    reserve(i, 6, dark)
  }

  QR_ALIGNMENT_CENTERS.forEach((row) => {
    QR_ALIGNMENT_CENTERS.forEach((col) => {
      if (
        (row === 6 && col === 6) ||
        (row === 6 && col === QR_SIZE - 7) ||
        (row === QR_SIZE - 7 && col === 6)
      ) {
        return
      }
      placeAlignment(row, col)
    })
  })

  reserve(QR_VERSION * 4 + 9, 8, true)

  // Reserve the format information locations before data placement.
  for (let i = 0; i < 15; i++) {
    if (i < 6) {
      reserve(i, 8, 0)
    } else if (i < 8) {
      reserve(i + 1, 8, 0)
    } else {
      reserve(QR_SIZE - 15 + i, 8, 0)
    }

    if (i < 8) {
      reserve(8, QR_SIZE - i - 1, 0)
    } else if (i < 9) {
      reserve(8, 15 - i - 1 + 1, 0)
    } else {
      reserve(8, 15 - i - 1, 0)
    }
  }

  return { matrix, reserved }
}

function buildDataPositions(reserved) {
  const positions = []
  let upward = true

  for (let col = QR_SIZE - 1; col > 0; col -= 2) {
    if (col === 6) {
      col -= 1
    }

    for (let i = 0; i < QR_SIZE; i++) {
      const row = upward ? QR_SIZE - 1 - i : i
      for (let offset = 0; offset < 2; offset++) {
        const currentCol = col - offset
        if (currentCol < 0 || reserved[row][currentCol]) continue
        positions.push([row, currentCol])
      }
    }

    upward = !upward
  }

  return positions
}

function maskApplies(mask, row, col) {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0
    case 1:
      return row % 2 === 0
    case 2:
      return col % 3 === 0
    case 3:
      return (row + col) % 3 === 0
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0
    case 5:
      return ((row * col) % 2 + (row * col) % 3) === 0
    case 6:
      return (((row * col) % 2 + (row * col) % 3) % 2) === 0
    case 7:
      return (((row + col) % 2 + (row * col) % 3) % 2) === 0
    default:
      return false
  }
}

function formatBits(mask) {
  let value = ((QR_EC_LEVEL_BITS << 3) | mask) << 10
  for (let i = 14; i >= 10; i--) {
    if (((value >>> i) & 1) !== 0) {
      value ^= QR_FORMAT_POLY << (i - 10)
    }
  }
  return ((((QR_EC_LEVEL_BITS << 3) | mask) << 10) | value) ^ QR_FORMAT_MASK
}

function applyFormatBits(matrix, mask) {
  const bits = formatBits(mask)
  for (let i = 0; i < 15; i++) {
    const bit = (bits >>> i) & 1

    if (i < 6) {
      matrix[i][8] = bit
    } else if (i < 8) {
      matrix[i + 1][8] = bit
    } else {
      matrix[QR_SIZE - 15 + i][8] = bit
    }

    if (i < 8) {
      matrix[8][QR_SIZE - i - 1] = bit
    } else if (i < 9) {
      matrix[8][15 - i - 1 + 1] = bit
    } else {
      matrix[8][15 - i - 1] = bit
    }
  }
}

function cloneMatrix(matrix) {
  return matrix.map((row) => row.slice())
}

function buildMatrix(text) {
  const dataCodewords = encodeDataCodewords(text)
  const eccCodewords = encodeEcc(dataCodewords)
  const codewords = dataCodewords.concat(eccCodewords)
  const dataBits = []
  codewords.forEach((codeword) => {
    for (let i = 7; i >= 0; i--) {
      dataBits.push((codeword >>> i) & 1)
    }
  })

  const { matrix: baseMatrix, reserved } = createBaseMatrix()
  const dataPositions = buildDataPositions(reserved)
  const results = []

  for (let mask = 0; mask < 8; mask++) {
    const matrix = cloneMatrix(baseMatrix)
    let dataIndex = 0

    for (const [row, col] of dataPositions) {
      let bit = dataIndex < dataBits.length ? dataBits[dataIndex] : 0
      if (maskApplies(mask, row, col)) {
        bit ^= 1
      }
      matrix[row][col] = bit
      dataIndex++
    }

    applyFormatBits(matrix, mask)
    results.push({ mask, matrix, score: scoreMatrix(matrix) })
  }

  results.sort((left, right) => left.score - right.score || left.mask - right.mask)
  return results[0].matrix
}

function scoreMatrix(matrix) {
  const size = matrix.length
  let penalty = 0

  for (let row = 0; row < size; row++) {
    let runColor = matrix[row][0]
    let runLength = 1
    for (let col = 1; col < size; col++) {
      const color = matrix[row][col]
      if (color === runColor) {
        runLength++
      } else {
        if (runLength >= 5) {
          penalty += 3 + (runLength - 5)
        }
        runColor = color
        runLength = 1
      }
    }
    if (runLength >= 5) {
      penalty += 3 + (runLength - 5)
    }
  }

  for (let col = 0; col < size; col++) {
    let runColor = matrix[0][col]
    let runLength = 1
    for (let row = 1; row < size; row++) {
      const color = matrix[row][col]
      if (color === runColor) {
        runLength++
      } else {
        if (runLength >= 5) {
          penalty += 3 + (runLength - 5)
        }
        runColor = color
        runLength = 1
      }
    }
    if (runLength >= 5) {
      penalty += 3 + (runLength - 5)
    }
  }

  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const color = matrix[row][col]
      if (
        color === matrix[row][col + 1] &&
        color === matrix[row + 1][col] &&
        color === matrix[row + 1][col + 1]
      ) {
        penalty += 3
      }
    }
  }

  const patterns = [
    [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1],
  ]

  const checkLine = (line) => {
    for (let i = 0; i <= line.length - 11; i++) {
      for (const pattern of patterns) {
        let match = true
        for (let j = 0; j < pattern.length; j++) {
          if (line[i + j] !== pattern[j]) {
            match = false
            break
          }
        }
        if (match) {
          penalty += 40
        }
      }
    }
  }

  for (let row = 0; row < size; row++) {
    checkLine(matrix[row])
  }

  for (let col = 0; col < size; col++) {
    const line = []
    for (let row = 0; row < size; row++) {
      line.push(matrix[row][col])
    }
    checkLine(line)
  }

  let darkCount = 0
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (matrix[row][col] === 1) {
        darkCount++
      }
    }
  }

  const total = size * size
  penalty += Math.floor(Math.abs((darkCount * 20) - total * 10) / total) * 10

  return penalty
}

function matrixToSvg(matrix) {
  const quietZone = 4
  const size = matrix.length + quietZone * 2
  let modules = ''

  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < matrix.length; col++) {
      if (matrix[row][col] === 1) {
        modules += `<rect x="${col + quietZone}" y="${row + quietZone}" width="1" height="1" />`
      }
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code">` +
    `<rect width="100%" height="100%" fill="#ffffff" />` +
    `<g fill="#111111">${modules}</g>` +
    `</svg>`
}

export function buildLocalQrSvg(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const matrix = buildMatrix(text)
  return matrixToSvg(matrix)
}

export function buildLocalQrDataUri(value) {
  const svg = buildLocalQrSvg(value)
  if (!svg) return ''
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export default buildLocalQrDataUri
