const COS = require('cos-wx-sdk-v5')

const IMAGE_CONTENT_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
}

function getExtension(filePath) {
  const path = `${filePath || ''}`.split('?')[0]
  const matched = path.match(/\.([a-zA-Z0-9]+)$/)
  return matched ? matched[1].toLowerCase() : ''
}

function getImageInfo(filePath) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src: filePath,
      success: resolve,
      fail: reject
    })
  })
}

async function getRecordImageContentType(filePath) {
  try {
    const info = await getImageInfo(filePath)
    const contentType = IMAGE_CONTENT_TYPES[`${info.type || ''}`.toLowerCase()]
    if (contentType) return contentType
  } catch (error) {}

  const contentType = IMAGE_CONTENT_TYPES[getExtension(filePath)]
  if (contentType) return contentType

  throw new Error('仅支持 JPG、PNG 或 WebP 图片')
}

function assertCredentials(credentials) {
  const requiredFields = [
    'bucket',
    'region',
    'object_key',
    'image_url',
    'start_time',
    'expired_time'
  ]
  const missingField = requiredFields.find((field) => !credentials || !credentials[field])
  const token = credentials && credentials.credentials
  if (missingField || !token || !token.tmpSecretId || !token.tmpSecretKey || !token.sessionToken) {
    throw new Error('图片上传凭证无效，请重试')
  }

  if (!/^https:\/\//.test(credentials.image_url)) {
    throw new Error('图片访问地址无效，请重试')
  }
}

function uploadRecordImageToCos(filePath, contentType, credentials) {
  assertCredentials(credentials)

  return new Promise((resolve, reject) => {
    const token = credentials.credentials
    const cos = new COS({
      SecretId: token.tmpSecretId,
      SecretKey: token.tmpSecretKey,
      SecurityToken: token.sessionToken,
      StartTime: credentials.start_time,
      ExpiredTime: credentials.expired_time
    })

    cos.putObject({
      Bucket: credentials.bucket,
      Region: credentials.region,
      Key: credentials.object_key,
      FilePath: filePath,
      ContentType: contentType
    }, (error) => {
      if (error) {
        reject(new Error('图片上传失败，请检查网络后重试'))
        return
      }
      resolve(credentials.image_url)
    })
  })
}

module.exports = {
  getRecordImageContentType,
  uploadRecordImageToCos
}
