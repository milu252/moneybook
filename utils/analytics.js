const { post } = require('./request')
const { getProfile } = require('../data/profile')

const ANALYTICS_ENDPOINT = '/analytics/events'
const DEVICE_ID_STORAGE_KEY = 'analytics_device_id'

function getCurrentPagePath() {
  if (typeof getCurrentPages !== 'function') return ''

  const pages = getCurrentPages()
  const currentPage = pages && pages[pages.length - 1]
  return currentPage && currentPage.route ? currentPage.route : ''
}

function getUserId() {
  const profile = getProfile()
  return profile && profile.id ? profile.id : ''
}

function createDeviceId() {
  return `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function getDeviceId() {
  if (typeof wx === 'undefined') return ''

  try {
    let deviceId = wx.getStorageSync(DEVICE_ID_STORAGE_KEY)
    if (!deviceId) {
      deviceId = createDeviceId()
      wx.setStorageSync(DEVICE_ID_STORAGE_KEY, deviceId)
    }
    return deviceId
  } catch (error) {
    return ''
  }
}

function getOsType() {
  if (typeof wx === 'undefined') return ''

  try {
    if (typeof wx.getDeviceInfo === 'function') {
      const deviceInfo = wx.getDeviceInfo()
      return deviceInfo.platform || deviceInfo.osName || ''
    }

    if (typeof wx.getSystemInfoSync === 'function') {
      const systemInfo = wx.getSystemInfoSync()
      return systemInfo.platform || systemInfo.system || ''
    }
  } catch (error) {
    return ''
  }

  return ''
}

function getNetworkType() {
  if (typeof wx === 'undefined' || typeof wx.getNetworkType !== 'function') {
    return Promise.resolve('')
  }

  return new Promise((resolve) => {
    wx.getNetworkType({
      success: (res) => resolve(res.networkType || ''),
      fail: () => resolve('')
    })
  })
}

async function buildPayload(eventName, properties) {
  const eventProperties = properties || {}
  const pagePath = eventProperties.page_path || getCurrentPagePath()
  const networkType = await getNetworkType()

  const payload = {
    event_name: eventName,
    timestamp: Date.now(),
    properties: {
      user_id: getUserId(),
      device_id: getDeviceId(),
      os_type: getOsType(),
      network_type: networkType,
      ip: '',
      ...eventProperties
    }
  }

  if (pagePath) payload.page_path = pagePath

  return payload
}

function track(eventName, properties) {
  return buildPayload(eventName, properties).then((payload) => {
    if (!ANALYTICS_ENDPOINT) {
      console.log('[analytics]', payload)
      return payload
    }

    return post(ANALYTICS_ENDPOINT, payload).catch((error) => {
      console.error('[analytics] report failed', error)
      return payload
    })
  }).catch((error) => {
    console.error('[analytics] build payload failed', error)
    const payload = {
      event_name: eventName,
      timestamp: Date.now(),
      properties: {
        user_id: getUserId(),
        ip: '',
        ...(properties || {})
      }
    }
    return payload
  })
}

module.exports = {
  track
}
