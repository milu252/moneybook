const logger = require('./logger')

const KB = 1024
const MB = 1024 * KB

const MAX_IMAGE_SIZE = 5 * MB
const SKIP_COMPRESS_SIZE = 500 * KB
const SMALL_TARGET_SIZE = 500 * KB
const LARGE_TARGET_SIZE = 1 * MB
const TARGET_TOLERANCE = 1.12

function getImagePath(file) {
  return file && (file.tempFilePath || file.path || file)
}

function getImageFileInfo(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileInfo({
      filePath,
      success: resolve,
      fail: reject
    })
  })
}

async function getImageSize(file) {
  const path = getImagePath(file)
  const knownSize = Number(file && file.size)
  if (Number.isFinite(knownSize) && knownSize > 0) {
    return knownSize
  }

  const info = await getImageFileInfo(path)
  return Number(info.size) || 0
}

function compressImage(filePath, quality) {
  return new Promise((resolve, reject) => {
    if (!wx.compressImage) {
      reject(new Error('当前微信版本暂不支持图片压缩'))
      return
    }

    wx.compressImage({
      src: filePath,
      quality,
      success: resolve,
      fail: reject
    })
  })
}

function getTargetSize(size) {
  if (size < SKIP_COMPRESS_SIZE) return 0
  if (size <= 2 * MB) return SMALL_TARGET_SIZE
  return LARGE_TARGET_SIZE
}

function getQualityOptions(size, targetSize) {
  const baseQuality = Math.max(20, Math.min(80, Math.round((targetSize / size) * 100)))
  return Array.from(new Set([
    baseQuality,
    Math.max(15, baseQuality - 15),
    Math.max(10, baseQuality - 30),
    20,
    10
  ]))
}

async function compressToTarget(filePath, originalSize, targetSize) {
  let bestPath = filePath
  let bestSize = originalSize

  for (const quality of getQualityOptions(originalSize, targetSize)) {
    const result = await compressImage(filePath, quality)
    const compressedPath = result.tempFilePath
    const compressedSize = await getImageSize(compressedPath)

    if (compressedSize > 0 && compressedSize < bestSize) {
      bestPath = compressedPath
      bestSize = compressedSize
    }

    if (compressedSize > 0 && compressedSize <= targetSize * TARGET_TOLERANCE) {
      break
    }
  }

  return {
    path: bestPath,
    size: bestSize
  }
}

async function processRecordImage(file) {
  const path = getImagePath(file)
  if (!path) {
    return { path: '', rejected: true, reason: 'invalid_path' }
  }

  let size = 0
  try {
    size = await getImageSize(file)
  } catch (error) {
    logger.warn('record_image:select_size_failed', {
      filePath: path,
      error
    })
    return { path, rejected: true, reason: 'read_failed' }
  }
  if (size > MAX_IMAGE_SIZE) {
    logger.warn('record_image:select_rejected_size', {
      filePath: path,
      size,
      maxSize: MAX_IMAGE_SIZE
    })
    return { path, size, rejected: true, reason: 'too_large' }
  }

  const targetSize = getTargetSize(size)
  if (!targetSize) {
    return { path, size, compressed: false }
  }

  try {
    const compressed = await compressToTarget(path, size, targetSize)
    logger.info('record_image:select_compressed', {
      filePath: path,
      originalSize: size,
      compressedPath: compressed.path,
      compressedSize: compressed.size,
      targetSize
    })
    return {
      path: compressed.path,
      size: compressed.size,
      originalSize: size,
      compressed: compressed.path !== path
    }
  } catch (error) {
    logger.warn('record_image:select_compress_failed', {
      filePath: path,
      size,
      targetSize,
      error
    })
    return { path, size, compressed: false, compressFailed: true }
  }
}

async function processRecordImages(files) {
  const results = []
  for (const file of files || []) {
    results.push(await processRecordImage(file))
  }

  return {
    paths: results.filter((item) => item.path && !item.rejected).map((item) => item.path),
    rejectedCount: results.filter((item) => item.rejected).length,
    compressFailedCount: results.filter((item) => item.compressFailed).length
  }
}

module.exports = {
  processRecordImages,
  MAX_IMAGE_SIZE,
  SKIP_COMPRESS_SIZE,
  SMALL_TARGET_SIZE,
  LARGE_TARGET_SIZE
}
