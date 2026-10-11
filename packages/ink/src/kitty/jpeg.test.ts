// @vitest-environment node
import { decode as decodePng } from 'fast-png'
import { encode as encodeJpeg } from 'jpeg-js'
import { describe, expect, it } from 'vitest'
import { createJpegDecoder, downscale, fitSize, isJpeg } from '../kitty-jpeg'
import { pngSize } from './provider'

function jpeg(width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height * 4).fill(200)
  return new Uint8Array(encodeJpeg({ data, width, height }, 90).data)
}

describe('JPEG decoder', () => {
  it('turns a JPEG into a PNG within the bounds', async () => {
    const decode = createJpegDecoder({ maxWidth: 40, maxHeight: 40 })
    const png = (await decode(jpeg(100, 50), 'image/jpeg')) as Uint8Array
    expect(pngSize(png)).toEqual({ width: 40, height: 20 })
    const pixels = decodePng(png)
    expect(pixels.channels).toBe(4)
    expect(Math.abs((pixels.data[0] as number) - 200)).toBeLessThan(8)
  })

  it('keeps small images at their size and declines other formats or broken data', async () => {
    const decode = createJpegDecoder()
    expect(pngSize((await decode(jpeg(8, 4), 'image/jpeg')) as Uint8Array)).toEqual({
      width: 8,
      height: 4,
    })
    expect(await decode(new Uint8Array([0x89, 0x50]), 'image/png')).toBeUndefined()
    expect(await decode(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg')).toBeUndefined()
    expect(isJpeg(jpeg(2, 2))).toBe(true)
  })

  it('fits sizes and averages pixels when downscaling', () => {
    expect(fitSize(1000, 500, 100, 100)).toEqual({ width: 100, height: 50 })
    expect(fitSize(10, 10, 100, 100)).toEqual({ width: 10, height: 10 })
    expect(fitSize(10000, 1, 10, 10)).toEqual({ width: 10, height: 1 })
    const data = new Uint8Array([0, 0, 0, 255, 100, 100, 100, 255])
    expect(downscale(data, 2, 1, 1, 1)).toEqual(new Uint8Array([50, 50, 50, 255]))
    expect(downscale(data, 2, 1, 2, 1)).toBe(data)
  })

  it('refuses a JPEG above the megapixel bound and bad options', async () => {
    const decode = createJpegDecoder({ maxMegapixels: 0.001 })
    expect(await decode(jpeg(40, 40), 'image/jpeg')).toBeUndefined()
    expect(await decode(jpeg(20, 20), 'image/jpeg')).toBeDefined()
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createJpegDecoder({ maxWidth: bad })).toThrow(RangeError)
      expect(() => createJpegDecoder({ maxHeight: bad })).toThrow(RangeError)
      expect(() => createJpegDecoder({ maxMegapixels: bad })).toThrow(RangeError)
    }
  })
})
