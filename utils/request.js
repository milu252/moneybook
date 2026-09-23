const logger = require('./logger')

// 本地开发使用这个：
// const BASE_URL = 'http://127.0.0.1:3000/moneybook/api/v1'
// 上线使用这个：
const BASE_URL = 'https://api.shyren.xyz/moneybook/api/v1'
// 图片接口如果使用独立端口，可以把这里改成对应地址，例如：
// const IMAGE_BASE_URL = 'http://127.0.0.1:2524/moneybook/api/v1'
const IMAGE_BASE_URL = BASE_URL

function getToken() {
  try {
    return wx.getStorageSync('moneybook_token') || ''
  } catch (e) {
    return ''
  }
}

function getPayloadSummary(data) {
  if (!data || typeof data !== 'object') return data || {}

  const summary = {}
  Object.keys(data).forEach((key) => {
    const value = data[key]
    if (key === 'data') {
      summary[key] = typeof value === 'string' ? `[omitted:${value.length}]` : '[omitted]'
    } else if (Array.isArray(value)) {
      summary[key] = {
        type: 'array',
        length: value.length
      }
    } else if (value && typeof value === 'object') {
      summary[key] = {
        type: 'object',
        keys: Object.keys(value)
      }
    } else {
      summary[key] = value
    }
  })
  return summary
}

function getResponseSummary(data) {
  if (!data || typeof data !== 'object') return data || {}
  if (Array.isArray(data)) {
    return {
      type: 'array',
      length: data.length
    }
  }

  return {
    keys: Object.keys(data),
    id: data.id ? String(data.id) : '',
    image_url: data.image_url || '',
    avatar_url: data.avatar_url || '',
    images_count: Array.isArray(data.images) ? data.images.length : undefined
  }
}

function request(method, path, data) {
  return new Promise((resolve, reject) => {
    const header = { 'Content-Type': 'application/json' }
    const token = getToken()
    if (token) header.Authorization = `Bearer ${token}`

    wx.request({
      url: BASE_URL + path,
      method,
      data: data || {},
      header,
      timeout: 15000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (method !== 'GET') {
            logger.info('request:success', {
              method,
              path,
              statusCode: res.statusCode,
              request: getPayloadSummary(data),
              response: getResponseSummary(res.data)
            })
          }
          resolve(res.data)
          return
        }

        logger.warn('request:bad_status', {
          method,
          path,
          statusCode: res.statusCode,
          request: getPayloadSummary(data),
          response: getResponseSummary(res.data)
        })

        reject({
          statusCode: res.statusCode,
          data: res.data,
          message: (res.data && (res.data.message || res.data.error)) || '请求失败'
        })
      },
      fail(error) {
        logger.error('request:network_fail', {
          method,
          path,
          request: getPayloadSummary(data),
          error
        })

        reject({
          statusCode: 0,
          data: error,
          message: error && error.errMsg ? error.errMsg : '网络异常'
        })
      }
    })
  })
}

function parseUploadResponse(data) {
  if (!data) return {}
  if (typeof data === 'object') return data

  try {
    return JSON.parse(data)
  } catch (error) {
    return {}
  }
}

function uploadFile(path, filePath, name = 'file', formData) {
  return new Promise((resolve, reject) => {
    const header = {}
    const token = getToken()
    if (token) header.Authorization = `Bearer ${token}`

    wx.uploadFile({
      url: IMAGE_BASE_URL + path,
      filePath,
      name,
      formData: formData || {},
      header,
      timeout: 30000,
      success(res) {
        const data = parseUploadResponse(res.data)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          logger.info('upload:success', {
            path,
            statusCode: res.statusCode,
            filePath,
            response: getResponseSummary(data)
          })
          resolve(data)
          return
        }

        logger.warn('upload:bad_status', {
          path,
          statusCode: res.statusCode,
          filePath,
          response: getResponseSummary(data)
        })

        reject({
          statusCode: res.statusCode,
          data,
          message: (data && (data.message || data.error)) || '上传失败'
        })
      },
      fail(error) {
        logger.error('upload:network_fail', {
          path,
          filePath,
          error
        })

        reject({
          statusCode: 0,
          data: error,
          message: error && error.errMsg ? error.errMsg : '网络异常'
        })
      }
    })
  })
}

function buildUrl(path) {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  if (path[0] !== '/') return `${BASE_URL}/${path}`
  if (path.indexOf('/moneybook/api/v1') === 0) {
    const baseUrl = path.indexOf('/moneybook/api/v1/records/images/') === 0 ? IMAGE_BASE_URL : BASE_URL
    return baseUrl.replace('/moneybook/api/v1', '') + path
  }
  return BASE_URL + path
}

module.exports = {
  BASE_URL,
  IMAGE_BASE_URL,
  buildUrl,
  uploadFile,
  get: (path, params) => request('GET', path, params),
  post: (path, data) => request('POST', path, data),
  patch: (path, data) => request('PATCH', path, data),
  del: (path) => request('DELETE', path)
}
