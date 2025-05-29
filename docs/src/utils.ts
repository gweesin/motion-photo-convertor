export function findPatternInUint8ArrayReverse(array: Uint8Array<ArrayBufferLike>, pattern: number[]) {
  const patternLength = pattern.length
  const arrayLength = array.length

  for (let i = arrayLength - patternLength; i >= 0; i--) {
    let match = true
    for (let j = 0; j < patternLength; j++) {
      if (array[i + j] !== pattern[j]) {
        match = false
        break
      }
    }
    if (match) {
      return i
    }
  }
  return -1
}

export function indexOfSubarrayOptimized(array: Uint8Array<ArrayBufferLike>, subarray: Uint8Array<ArrayBufferLike>, skipFirst: boolean = false) {
  const firstByte = subarray[0]
  const subLength = subarray.length

  let startIndex = array.indexOf(firstByte)
  while (startIndex !== -1) {
    if (array.subarray(startIndex, startIndex + subLength).every((value, index) => value === subarray[index])) {
      if (skipFirst) {
        skipFirst = false
      }
      else {
        return startIndex
      }
    }
    startIndex = array.indexOf(firstByte, startIndex + 1)
  }
  return -1
}

export function embedXMP(xmpData: string): Uint8Array<ArrayBuffer> {
  const xmpPayload = stringToUTF8Bytes(`${xmpData}\x0A`)
  const xmpMarker = new Uint8Array([0xFF, 0xE1])
  const xmpHeader = stringToUTF8Bytes('http://ns.adobe.com/xap/1.0/\x00')
  const xmpLength = xmpPayload.length + xmpHeader.length + 2

  const xmpSegment = new Uint8Array(xmpLength + 2)
  xmpSegment.set(xmpMarker, 0)
  xmpSegment.set([(xmpLength >> 8) & 0xFF, xmpLength & 0xFF], 2)
  xmpSegment.set(xmpHeader, 4)
  xmpSegment.set(xmpPayload, 4 + xmpHeader.length)

  return xmpSegment
}

export function stringToUTF8Bytes(str: string): Uint8Array<ArrayBufferLike> {
  const encoder = new TextEncoder()
  return encoder.encode(str)
}

// export function
