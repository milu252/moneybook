const { post } = require('./request')

const TOKEN_KEY = 'moneybook_token'
let loginPromise = null

function getToken() {
  try {
    return wx.getStorageSync(TOKEN_KEY) || ''
  } catch (e) {
    return ''
  }
}

function setToken(token) {
  try {
    wx.setStorageSync(TOKEN_KEY, token)
  } catch (e) {}
}

function clearToken() {
  try {
    wx.removeStorageSync(TOKEN_KEY)
  } catch (e) {}
}

async function ensureToken(forceRefresh = false) {
  if (forceRefresh) clearToken()
  if (getToken()) return false
  if (loginPromise) return loginPromise

  loginPromise = new Promise((resolve, reject) => {
    wx.login({
      success: async (res) => {
        try {
          const result = await post('/auth/wx-login', {
            code: res.code,
            nickname: '',
            avatar_url: ''
          })
          setToken(result.access_token)
          resolve(true)
        } catch (e) {
          console.error('wx login failed', e)
          reject(e)
        } finally {
          loginPromise = null
        }
      },
      fail: (err) => {
        console.error('wx.login failed', err)
        loginPromise = null
        reject(err)
      }
    })
  })

  return loginPromise
}

module.exports = { getToken, setToken, clearToken, ensureToken }
