const { post } = require('./request')
const { getToken } = require('./auth')
const { getProfile } = require('../data/profile')

const ANALYTICS_ENDPOINT = '/analytics/events'
const DEVICE_ID_STORAGE_KEY = 'analytics_device_id'
const ANALYTICS_QUEUE_STORAGE_KEY = 'analytics_pending_events'
const MAX_PENDING_EVENTS = 100
let isFlushing = false

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

function getPendingEvents() {
  if (typeof wx === 'undefined') return []
  try {
    const events = wx.getStorageSync(ANALYTICS_QUEUE_STORAGE_KEY)
    return Array.isArray(events) ? events : []
  } catch (error) {
    return []
  }
}

function savePendingEvents(events) {
  if (typeof wx === 'undefined') return
  try {
    wx.setStorageSync(ANALYTICS_QUEUE_STORAGE_KEY, events.slice(-MAX_PENDING_EVENTS))
  } catch (error) {
    console.error('[analytics] save pending events failed', error)
  }
}

function removePendingEvent(eventId) {
  savePendingEvents(getPendingEvents().filter((event) => event.id !== eventId))
}

function buildPayload(eventName, properties) {
  const eventProperties = properties || {}
  const pagePath = eventProperties.page_path || getCurrentPagePath()
  const payload = {
    event_name: eventName,
    timestamp: Date.now(),
    properties: {
      user_id: getUserId(),
      device_id: getDeviceId(),
      os_type: getOsType(),
      // 关闭时必须先落盘，不能等待异步网络类型查询。
      network_type: 'unknown',
      ip: '',
      ...eventProperties
    }
  }
  if (pagePath) payload.page_path = pagePath
  return payload
}

async function flushAnalytics() {
  if (!ANALYTICS_ENDPOINT || isFlushing || !getToken()) return
  isFlushing = true
  try {
    const events = getPendingEvents()
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index]
      if (!event || !event.id || !event.payload) continue
      try {
        await post(ANALYTICS_ENDPOINT, event.payload)
        removePendingEvent(event.id)
      } catch (error) {
        // 保留当前及后续事件，等待下次登录成功或回到前台后重试。
        console.error('[analytics] report failed', error)
        break
      }
    }
  } finally {
    isFlushing = false
  }
}

function track(eventName, properties) {
  const payload = buildPayload(eventName, properties)
  const eventId = `analytics_${payload.timestamp}_${Math.random().toString(36).slice(2, 10)}`
  const event = {
    id: eventId,
    payload
  }
  // 先同步写入缓存，确保 onHide 期间即使请求未完成也不会丢失事件。
  const events = getPendingEvents()
  events.push(event)
  savePendingEvents(events)
  flushAnalytics()
  return Promise.resolve(payload)
}

module.exports = {
  track,
  flushAnalytics
}
