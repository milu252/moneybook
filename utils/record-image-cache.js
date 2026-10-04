const logger = require('./logger')

const CACHE_KEY = 'moneybook_record_image_cache_v1'
const MAX_CACHE_ENTRIES = 100

function isRemoteImage(url) {
  return /^https?:\/\//.test(`${url || ''}`)
}

function readCache() {
  try {
    const cache = wx.getStorageSync(CACHE_KEY)
    return cache && typeof cache === 'object' && !Array.isArray(cache) ? cache : {}
  } catch (error) {
    logger.warn('record_image_cache:read_failed', { error })
    return {}
  }
}

function writeCache(cache) {
  try {
    wx.setStorageSync(CACHE_KEY, cache)
  } catch (error) {
    logger.warn('record_image_cache:write_failed', { error })
  }
}

function removeUserFile(filePath) {
  if (!filePath) return Promise.resolve()

  return new Promise((resolve) => {
    wx.getFileSystemManager().unlink({
      filePath,
      complete: resolve
    })
  })
}

function getFileInfo(filePath) {
  return new Promise((resolve) => {
    wx.getFileInfo({
      filePath,
      success: () => resolve(true),
      fail: () => resolve(false)
    })
  })
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.tempFilePath) {
          resolve(res.tempFilePath)
          return
        }
        reject(new Error(`图片下载失败（${res.statusCode || '未知状态'}）`))
      },
      fail: reject
    })
  })
}

function getUrlHash(url) {
  let first = 5381
  let second = 52711
  for (let index = 0; index < url.length; index += 1) {
    const code = url.charCodeAt(index)
    first = ((first * 33) ^ code) >>> 0
    second = ((second * 31) ^ code) >>> 0
  }
  return `${first.toString(36)}${second.toString(36)}`
}

function getImageExtension(url) {
  const path = `${url || ''}`.split(/[?#]/)[0]
  const match = path.match(/\.([a-zA-Z0-9]{1,5})$/)
  const extension = match ? match[1].toLowerCase() : 'jpg'
  return /^(jpg|jpeg|png|webp|gif|bmp)$/.test(extension) ? extension : 'jpg'
}

function getUserFilePath(url) {
  return `${wx.env.USER_DATA_PATH}/moneybook-record-image-${getUrlHash(url)}.${getImageExtension(url)}`
}

function copyToUserFile(tempFilePath, targetFilePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().copyFile({
      srcPath: tempFilePath,
      destPath: targetFilePath,
      success(res) {
        resolve(res)
      },
      fail: reject
    })
  })
}

function getCachedRecordImagePath(url) {
  if (!isRemoteImage(url)) return ''
  const entry = readCache()[url]
  return entry && entry.filePath ? entry.filePath : ''
}

async function cleanCache(cache) {
  const entries = Object.keys(cache)
    .map((url) => ({ url, ...cache[url] }))
    .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))

  const expired = entries.slice(0, Math.max(0, entries.length - MAX_CACHE_ENTRIES))
  await Promise.all(expired.map(async ({ url, filePath }) => {
    delete cache[url]
    await removeUserFile(filePath)
  }))
}

const pendingDownloads = {}

async function cacheRecordImage(url) {
  if (!isRemoteImage(url)) return url || ''

  if (pendingDownloads[url]) return pendingDownloads[url]

  pendingDownloads[url] = (async () => {
    const cache = readCache()
    const existing = cache[url]
    if (existing && existing.filePath && await getFileInfo(existing.filePath)) {
      cache[url] = { ...existing, updatedAt: Date.now() }
      writeCache(cache)
      return existing.filePath
    }

    if (existing) {
      delete cache[url]
      await removeUserFile(existing.filePath)
      writeCache(cache)
    }

    try {
      const filePath = getUserFilePath(url)
      if (await getFileInfo(filePath)) {
        cache[url] = { filePath, updatedAt: Date.now() }
        await cleanCache(cache)
        writeCache(cache)
        return filePath
      }

      const tempFilePath = await downloadFile(url)
      await copyToUserFile(tempFilePath, filePath)
      cache[url] = { filePath, updatedAt: Date.now() }
      await cleanCache(cache)
      writeCache(cache)
      logger.info('record_image_cache:save_success', { url, filePath })
      return filePath
    } catch (error) {
      logger.warn('record_image_cache:save_failed', { url, error })
      return url
    }
  })()

  try {
    return await pendingDownloads[url]
  } finally {
    delete pendingDownloads[url]
  }
}

module.exports = {
  cacheRecordImage,
  getCachedRecordImagePath,
  isRemoteImage
}
