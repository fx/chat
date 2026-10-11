/**
 * `@fx/chat-ink/kitty-jpeg` — an optional JPEG decoder for the kitty image
 * provider (`createKittyProvider({ decode: createJpegDecoder() })`). Needs the
 * optional peer dependencies `jpeg-js` and `fast-png`.
 */
export {
  type JpegDecoderOptions,
  createJpegDecoder,
  downscale,
  fitSize,
  isJpeg,
} from './kitty/jpeg'
