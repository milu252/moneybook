function getErrorMessage(error) {
  return `${(error && (error.errMsg || error.message)) || ''}`.toLowerCase()
}

function isUserCancel(error) {
  return /cancel|cancelled|canceled/.test(getErrorMessage(error))
}

function isPermissionDenied(error) {
  return /auth deny|auth denied|permission deny|permission denied|no permission|authorize no response/.test(getErrorMessage(error))
}

function guideToPhotoPermission() {
  wx.showModal({
    title: '需要图片访问权限',
    content: '若之前点了拒绝，请在微信授权设置中开启相册或相机权限后再试。',
    confirmText: '去设置',
    success(res) {
      if (res.confirm) {
        wx.openSetting({})
      }
    }
  })
}

module.exports = {
  isUserCancel,
  isPermissionDenied,
  guideToPhotoPermission
}
