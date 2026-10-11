/**
 * An optional decoder for the kitty provider: JPEG in, PNG out, downscaled
 * to a bound first so a camera photo does not cross the terminal at full
 * size. Its codecs (`jpeg-js`, `fast-png`) are optional peer dependencies,
 * loaded only by hosts that import this subpath.
 */
import { encode as encodePng } from 'fast-png'
import { decode as decodeJpeg } from 'jpeg-js'

export interface JpegDecoderOptions {
  /** Largest width and height in pixels after downscaling (default 1600 × 1600). */
  maxWidth?: number
  maxHeight?: number
  /** Refuse images above this many megapixels before decoding (default 50). */
  maxMegapixels?: number
}

/** Whether bytes start with the JPEG signature. */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

/** The size that fits `width` × `height` into the bounds, keeping aspect, never upscaling. */
export function fitSize(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Downscale RGBA pixels by averaging the source area under each target pixel. */
export function downscale(
  data: Uint8Array,
  width: number,
  height: number,
  toWidth: number,
  toHeight: number,
): Uint8Array {
  if (toWidth === width && toHeight === height) return data
  const out = new Uint8Array(toWidth * toHeight * 4)
  const sx = width / toWidth
  const sy = height / toHeight
  for (let y = 0; y < toHeight; y++) {
    const y0 = Math.floor(y * sy)
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy))
    for (let x = 0; x < toWidth; x++) {
      const x0 = Math.floor(x * sx)
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx))
      const sum = [0, 0, 0, 0]
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * width + xx) * 4
          for (let c = 0; c < 4; c++) sum[c] = (sum[c] as number) + (data[i + c] as number)
        }
      }
      const n = (y1 - y0) * (x1 - x0)
      const o = (y * toWidth + x) * 4
      for (let c = 0; c < 4; c++) out[o + c] = Math.round((sum[c] as number) / n)
    }
  }
  return out
}

/**
 * A decoder for `createKittyProvider({ decode })`: JPEG bytes become a
 * downscaled PNG; anything else is declined (`undefined`), as is a JPEG that
 * fails to decode or is too large.
 */
export function createJpegDecoder(options: JpegDecoderOptions = {}) {
  const { maxWidth = 1600, maxHeight = 1600, maxMegapixels = 50 } = options
  for (const [name, value] of Object.entries({ maxWidth, maxHeight, maxMegapixels }))
    if (!(value > 0 && Number.isFinite(value)))
      throw new RangeError(`${name} must be a positive finite number, got ${value}`)
  return async (bytes: Uint8Array, _mediaType: string): Promise<Uint8Array | undefined> => {
    if (!isJpeg(bytes)) return undefined
    let image: { width: number; height: number; data: Uint8Array }
    try {
      image = decodeJpeg(bytes, {
        useTArray: true,
        formatAsRGBA: true,
        maxResolutionInMP: maxMegapixels,
        maxMemoryUsageInMB: 1024,
      })
    } catch {
      return undefined
    }
    const size = fitSize(image.width, image.height, maxWidth, maxHeight)
    const data = downscale(image.data, image.width, image.height, size.width, size.height)
    return encodePng({ width: size.width, height: size.height, data, channels: 4, depth: 8 })
  }
}
