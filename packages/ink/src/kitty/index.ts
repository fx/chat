/**
 * `@fx/chat-ink/kitty` — an opt-in image provider for terminals implementing
 * the kitty graphics protocol. Hosts that do not draw images never load it.
 */
export { DIACRITICS } from './diacritics'
export {
  CELL_SIZE_QUERY,
  type KittyOptions,
  type KittyProvider,
  MAX_CELLS,
  MAX_IMAGES,
  MAX_IMAGE_SIDE,
  createKittyProvider,
  detectKitty,
  fitCells,
  forget,
  isPng,
  place,
  placeholderRows,
  pngSize,
  transmit,
} from './provider'
