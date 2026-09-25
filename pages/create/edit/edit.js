const { getContacts } = require('../../../data/contacts')
const { addRecord, loadCachedRecords, recordTypes } = require('../../../data/records')
const { track } = require('../../../utils/analytics')
const { processRecordImages } = require('../../../utils/record-image')
const logger = require('../../../utils/logger')

const weekLabels = ['日', '一', '二', '三', '四', '五', '六']
// yearOptions: 当前年份前后各10年，共21个选项
const yearOptions = Array.from({ length: 21 }, (_, index) => new Date().getFullYear() - 10 + index)
const monthOptions = Array.from({ length: 12 }, (_, index) => index + 1)

// 需要做数字格式过滤的表单字段
const numericFields = ['amount', 'estimatedValue', 'cost']
const remarkMaxLength = 200

// 事由快捷标签选项
const sceneOptions = ['结婚', '乔迁', '生日', '生娃', '节日']
const CREATE_START_TIME_STORAGE_KEY = 'record_create_start_time'

// 表单各字段的初始值
const defaultForm = {
  name: '',
  date: '',
  amount: '',
  gift: '',
  estimatedValue: '',
  mealContent: '',
  cost: '',
  scene: '',
  remark: ''
}

// 数字补零，确保月/日始终是两位数，如 1 → "01"
function pad(value) {
  return `${value}`.padStart(2, '0')
}

// 将 Date 对象格式化为表单显示用的字符串，如 "2026.06.21"
function formatDate(date) {
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`
}

// 将 Date 对象转为唯一标识用的字符串，如 "2026-06-21"，用于比较两个日期是否同一天
function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// 将 Date 对象格式化为记录列表展示用的标签，如 "6月21日"
function dateLabel(date) {
  return `${date.getMonth() + 1}.${date.getDate()}`
}

// 将多种格式的日期值（Date 对象、时间戳、"2026.06.21" 或 "2026-06-21" 字符串）统一转为 Date 对象，解析失败时返回今天
function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value
  }

  if (typeof value === 'number') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
    }
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/\./g, '-')
    const matched = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (matched) {
      const [, year, month, day] = matched
      return new Date(Number(year), Number(month) - 1, Number(day))
    }

    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
    }
  }

  return new Date()
}

// 保存时决定最终使用哪个日期：优先用手动输入的 form.date（格式合法则采用），否则兜底用日历选中的 selectedDate
function resolveSelectedDate(formDate, selectedDate) {
  if (formDate) {
    const normalized = `${formDate}`.replace(/\./g, '-')
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
      return normalizeDate(formDate)
    }
  }

  return normalizeDate(selectedDate)
}

// 生成记录的唯一 ID，格式：日期-姓名-类型-时间戳
function buildRecordId(date, name, typeKey) {
  const normalizedName = `${name || 'unknown'}`
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '')

  return `${dateKey(date)}-${normalizedName || 'record'}-${typeKey}-${Date.now()}`
}

// 根据记录类型和收/送方向，将表单原始值组装为带符号的最终 value 字符串（如 "+100.00" 或 "-50.00"）
function buildValue(typeKey, giftType, form) {
  const config = recordTypes[typeKey] || recordTypes.cash
  const rawValue = `${form[config.valueField] || ''}`.trim()

  if (typeKey !== 'cash') {
    return rawValue
  }

  if (!rawValue) return ''

  const sign = giftType === 'send' ? '-' : '+'
  const amount = Number.parseFloat(rawValue)
  const amountText = Number.isNaN(amount) ? rawValue : amount.toFixed(2)
  return `${sign}${amountText}`
}

function getEmptyValueToast(typeKey) {
  if (typeKey === 'gift') return '请输入礼物'
  if (typeKey === 'meal') return '请输入请客'
  return '请输入金额'
}

// 清理金额输入：去除非数字/小数点字符、合并多余小数点，防止用户输入 "12..3" 或 "12abc" 之类的脏数据
function normalizeAmountInput(value) {
  const normalized = `${value || ''}`
    .replace(/[^\d.]/g, '')
    .replace(/\.{2,}/g, '.')
  const parts = normalized.split('.')

  if (parts.length <= 1) {
    return normalized
  }

  return `${parts[0]}.${parts.slice(1).join('')}`
}

function getSaveErrorMessage(error) {
  if (!error) return '保存失败，请重试'
  if (error.statusCode === 0) return '网络异常，请稍后重试'
  if (error.statusCode === 401 || error.statusCode === 403) return '登录过期，请重试'
  if (error.statusCode >= 500) return '服务器开小差了'
  if (error.message && !/^request:/.test(error.message)) return error.message
  return '保存失败，请重试'
}

function getSaveFailReason(error) {
  if (!error) return 'unknown'
  if (error.statusCode === 0) return 'network_error'
  if (error.statusCode === 401 || error.statusCode === 403) return 'unauthorized'
  if (error.statusCode >= 500) return 'server_error'
  if (error.statusCode >= 400) return 'request_error'
  return 'unknown'
}

function getStoredCreateStartTime() {
  try {
    const createStartTime = Number(wx.getStorageSync(CREATE_START_TIME_STORAGE_KEY))
    return Number.isFinite(createStartTime) && createStartTime > 0 ? createStartTime : 0
  } catch (error) {
    return 0
  }
}

function clearStoredCreateStartTime() {
  try {
    wx.removeStorageSync(CREATE_START_TIME_STORAGE_KEY)
  } catch (error) {}
}

function backToCreateEntry() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    wx.navigateBack()
    return
  }

  wx.redirectTo({
    url: '/pages/create/create'
  })
}

function buildNameSuggestions(keyword) {
  const value = `${keyword || ''}`.trim()
  if (!value) return []

  return getContacts()
    .filter((contact) => contact.name.includes(value))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'))
}

function getNameSuggestionHeight(suggestions) {
  return Math.min(suggestions.length, 5) * 72
}

// 生成指定年月的日历格网数据（共 42 格，6行×7列），每格包含日期、是否当月、是否选中、是否今天等标志
function buildCalendar(year, month, selectedDate) {
  const firstDay = new Date(year, month, 1)
  const startOffset = firstDay.getDay()
  const gridStart = new Date(year, month, 1 - startOffset)
  const today = new Date()
  const todayKey = dateKey(today)
  const selectedKey = dateKey(selectedDate)
  const days = []

  for (let index = 0; index < 42; index += 1) {
    const current = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index)
    const key = dateKey(current)
    days.push({
      key,
      day: current.getDate(),
      muted: current.getMonth() !== month,
      selected: key === selectedKey,
      today: key === todayKey,
      year: current.getFullYear(),
      month: current.getMonth(),
      date: current.getDate()
    })
  }

  return days
}

// 将年份和月份（0-based）转换为年月选择器所需的 [yearIndex, monthIndex] 格式
function buildCalendarPickerValue(year, month) {
  const yearIndex = Math.max(0, yearOptions.indexOf(year))
  return [yearIndex, month]
}

// 将年月切换到 (year, month)，保留原来的日；若当月没有该日则取最后一天
function clampDateToMonth(year, month, prevDate) {
    const lastDay = new Date(year, month + 1, 0).getDate()
    const day = Math.min(prevDate.getDate(), lastDay)
    return new Date(year, month, day)
  }

Page({
  data: {
    tabs: [
      { key: 'cash', name: '礼金' },
      { key: 'gift', name: '礼物' },
      { key: 'meal', name: '请客' }
    ],
    sceneOptions,
    activeType: 'cash',
    giftType: 'receive',
    selectedSceneTag: '',
    form: {
      ...defaultForm,
      date: formatDate(new Date())
    },
    saving: false,
    choosingImage: false,
    images: [],
    calendarVisible: false,
    calendarPickerVisible: false,
    calendarPickerValue: buildCalendarPickerValue(new Date().getFullYear(), new Date().getMonth()),
    pendingCalendarPickerValue: buildCalendarPickerValue(new Date().getFullYear(), new Date().getMonth()),
    pickerYearIntoView: `year-option-${buildCalendarPickerValue(new Date().getFullYear(), new Date().getMonth())[0]}`,
    pickerMonthIntoView: `month-option-${buildCalendarPickerValue(new Date().getFullYear(), new Date().getMonth())[1]}`,
    yearOptions,
    monthOptions,
    weekLabels,
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth(),
    selectedDate: new Date(),
    calendarDays: buildCalendar(new Date().getFullYear(), new Date().getMonth(), new Date()),
    from: '',
    nameSuggestions: [],
    nameSuggestionHeight: 0
  },

  // 页面加载时，若 URL 参数指定了记录类型则切换到对应 tab
  onLoad(options) {
    loadCachedRecords()
    this.createStartTime = getStoredCreateStartTime() || Date.now()
    const nextData = {}

    if (options.type === 'gift' || options.type === 'meal' || options.type === 'cash') {
      nextData.activeType = options.type
    }

    if (options.name) {
      nextData['form.name'] = decodeURIComponent(options.name)
    }

    if (options.from) {
      nextData.from = options.from
    }

    if (Object.keys(nextData).length) {
      this.setData(nextData)
    }
  },

  onShow() {
    track('record_create_form_view', {
      record_type: this.data.activeType,
      from: this.data.from || ''
    })
  },

  // 切换顶部 tab（礼金/礼物/请客）
  switchType(event) {
    const type = event.currentTarget.dataset.type
    if (!type || type === this.data.activeType) return
    this.setData({ activeType: type })
  },

  // 切换收/送方向
  chooseGiftType(event) {
    this.setData({ giftType: event.currentTarget.dataset.type })
  },

  // 点击场景快捷标签，同步更新表单 scene 字段
  chooseSceneTag(event) {
    const scene = event.currentTarget.dataset.scene
    if (!scene) return

    this.setData({
      selectedSceneTag: scene,
      'form.scene': scene
    })
  },

  // 通用表单字段更新；金额类字段额外做格式过滤；scene 字段变化时同步清除快捷标签高亮
  updateField(event) {
    const field = event.currentTarget.dataset.field
    let value = numericFields.includes(field) ? normalizeAmountInput(event.detail.value) : event.detail.value
    if (field === 'remark' && `${value || ''}`.length > remarkMaxLength) {
      wx.showToast({
        title: '请将内容控制在200字以内哦~',
        icon: 'none'
      })
      value = `${value || ''}`.slice(0, remarkMaxLength)
    }

    const nextData = {
      [`form.${field}`]: value
    }

    if (field === 'scene') {
      nextData.selectedSceneTag = value === this.data.selectedSceneTag ? this.data.selectedSceneTag : ''
    }

    if (field === 'name') {
      const suggestions = buildNameSuggestions(value)
      nextData.nameSuggestions = suggestions
      nextData.nameSuggestionHeight = getNameSuggestionHeight(suggestions)
    } else {
      nextData.nameSuggestions = []
      nextData.nameSuggestionHeight = 0
    }

    this.setData(nextData)
    return value
  },

  chooseNameSuggestion(event) {
    const name = event.currentTarget.dataset.name
    if (!name) return

    this.setData({
      'form.name': name,
      nameSuggestions: [],
      nameSuggestionHeight: 0
    })
  },

  // 返回上一页，若无历史栈则跳转到创建首页
  goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
      return
    }

    wx.redirectTo({
      url: '/pages/create/create'
    })
  },

  // 打开日历弹层，从 form.date 重新初始化日历状态，确保显示与表单一致
  openCalendar() {
    const date = normalizeDate(this.data.form.date)
    const year = date.getFullYear()
    const month = date.getMonth()
    const pickerValue = buildCalendarPickerValue(year, month)
    this.setData({
      calendarVisible: true,
      calendarPickerVisible: false,
      calendarYear: year,
      calendarMonth: month,
      selectedDate: date,
      calendarDays: buildCalendar(year, month, date),
      calendarPickerValue: pickerValue,
      pendingCalendarPickerValue: pickerValue
    })
  },

  // 关闭日历弹层（不保存选择）
  closeCalendar() {
    this.setData({
      calendarVisible: false,
      calendarPickerVisible: false
    })
  },

  // 更新日历的年月和选中日期，并重新生成格网数据；各导航操作的统一入口
  refreshCalendar(year, month, selectedDate = this.data.selectedDate) {
    this.setData({
      calendarYear: year,
      calendarMonth: month,
      calendarPickerValue: buildCalendarPickerValue(year, month),
      selectedDate,
      calendarDays: buildCalendar(year, month, selectedDate)
    })
  },

  // 展开日历内嵌的年月选择器，并将滚动位置定位到当前年月
  toggleCalendarPicker() {
    const pickerValue = buildCalendarPickerValue(this.data.calendarYear, this.data.calendarMonth)
    this.setData({
      calendarPickerVisible: true,
      calendarPickerValue: pickerValue,
      pendingCalendarPickerValue: pickerValue,
      pickerYearIntoView: `year-option-${pickerValue[0]}`,
      pickerMonthIntoView: `month-option-${pickerValue[1]}`
    })
  },

  // scroll-picker 滚动时同步暂存值（用于取消时还原，不直接生效）
  changeCalendarPicker(event) {
    this.setData({
      pendingCalendarPickerValue: event.detail.value
    })
  },

  // 点击年份列表某一项，更新暂存的年份索引，保留当前月份
  chooseCalendarYear(event) {
    const index = Number(event.currentTarget.dataset.index)
    const [, monthIndex = 0] = this.data.pendingCalendarPickerValue

    this.setData({
      pendingCalendarPickerValue: [index, monthIndex],
      pickerYearIntoView: `year-option-${index}`
    })
  },

  // 点击月份列表某一项，更新暂存的月份索引，保留当前年份
  chooseCalendarMonth(event) {
    const index = Number(event.currentTarget.dataset.index)
    const [yearIndex = 0] = this.data.pendingCalendarPickerValue

    this.setData({
      pendingCalendarPickerValue: [yearIndex, index],
      pickerMonthIntoView: `month-option-${index}`
    })
  },

  // 确认年月选择器，将暂存值应用到日历并关闭选择器；保留原来的日，超出当月最大天数时取最后一天
  confirmCalendarPicker() {
    const [yearIndex = 0, monthIndex = 0] = this.data.pendingCalendarPickerValue
    const year = yearOptions[yearIndex] || this.data.calendarYear
    const month = monthIndex
    const selectedDate = clampDateToMonth(year, month, this.data.selectedDate)
    this.refreshCalendar(year, month, selectedDate)
    this.setData({ calendarPickerVisible: false })
  },

  // 取消年月选择器，还原到选择前的年月状态
  cancelCalendarPicker() {
    this.setData({
      calendarPickerVisible: false,
      calendarPickerValue: buildCalendarPickerValue(this.data.calendarYear, this.data.calendarMonth),
      pendingCalendarPickerValue: buildCalendarPickerValue(this.data.calendarYear, this.data.calendarMonth)
    })
  },

  // 日历切换到上一个月
  prevMonth() {
    const year = this.data.calendarMonth === 0 ? this.data.calendarYear - 1 : this.data.calendarYear
    const month = this.data.calendarMonth === 0 ? 11 : this.data.calendarMonth - 1
    const selectedDate = clampDateToMonth(year, month, this.data.selectedDate)
    this.setData({ calendarPickerVisible: false })
    this.refreshCalendar(year, month, selectedDate)
  },

  // 日历切换到下一个月
  nextMonth() {
    const year = this.data.calendarMonth === 11 ? this.data.calendarYear + 1 : this.data.calendarYear
    const month = this.data.calendarMonth === 11 ? 0 : this.data.calendarMonth + 1
    const selectedDate = clampDateToMonth(year, month, this.data.selectedDate)
    this.setData({ calendarPickerVisible: false })
    this.refreshCalendar(year, month, selectedDate)
  },

  // 点击日历某一天，将其设为选中日期并刷新格网
  chooseDate(event) {
    const { year, month, date } = event.currentTarget.dataset
    const selectedDate = new Date(Number(year), Number(month), Number(date))
    this.refreshCalendar(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate)
  },

  // 快速跳转到今天并选中
  goToday() {
    const today = new Date()
    this.refreshCalendar(today.getFullYear(), today.getMonth(), today)
  },

  // 确认日期选择，将 selectedDate 写入 form.date 并关闭日历
  confirmDate() {
    this.setData({
      'form.date': formatDate(this.data.selectedDate),
      calendarVisible: false
    })
  },

  // 空操作，用于阻止弹层内部点击事件冒泡到遮罩层
  noop() {},

  // 选择图片，最多 3 张，兼容新旧 wx API（chooseMedia / chooseImage）
  chooseImage() {
    if (this.data.choosingImage) return

    const remain = 3 - this.data.images.length
    if (remain <= 0) return

    this.setData({ choosingImage: true })

    const onSuccess = async (files) => {
      try {
        const result = await processRecordImages(files)
        if (result.rejectedCount > 0) {
          wx.showToast({
            title: '图片不能超过5MB',
            icon: 'none'
          })
        } else if (result.compressFailedCount > 0) {
          wx.showToast({
            title: '部分图片压缩失败，已使用原图',
            icon: 'none'
          })
        }

        this.setData({
          images: this.data.images.concat(result.paths).slice(0, 3)
        })
      } finally {
        this.setData({ choosingImage: false })
      }
    }

    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: remain,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => onSuccess(res.tempFiles),
        fail: () => this.setData({ choosingImage: false })
      })
      return
    }

    wx.chooseImage({
      count: remain,
      sourceType: ['album', 'camera'],
      success: (res) => onSuccess(res.tempFilePaths),
      fail: () => this.setData({ choosingImage: false })
    })
  },

  // 删除已选图片
  removeImage(event) {
    const index = event.currentTarget.dataset.index
    this.setData({
      images: this.data.images.filter((_, itemIndex) => itemIndex !== index)
    })
  },

  // 校验表单并保存记录，saving 标志防止重复提交；保存成功后跳转回创建首页
  async saveRecord() {
    if (this.data.saving) return

    const scene = this.data.selectedSceneTag || this.data.form.scene.trim()
    const typeConfig = recordTypes[this.data.activeType] || recordTypes.cash
    const value = buildValue(this.data.activeType, this.data.giftType, this.data.form)
    const selectedDate = resolveSelectedDate(this.data.form.date, this.data.selectedDate)
    logger.info('record_create:save_click', {
      recordType: this.data.activeType,
      valueClass: this.data.giftType === 'send' ? 'expense' : 'income',
      fullDate: dateKey(selectedDate),
      hasScene: !!scene,
      hasName: !!this.data.form.name.trim(),
      hasValue: !!value,
      imageCount: this.data.images.length,
      remarkLength: `${this.data.form.remark || ''}`.length,
      from: this.data.from || ''
    })

    if (!scene) {
      logger.warn('record_create:validation_blocked', {
        reason: 'missing_scene',
        recordType: this.data.activeType
      })
      wx.showToast({
        title: '请选择或输入事由',
        icon: 'none'
      })
      return
    }

    if (!this.data.form.name.trim()) {
      logger.warn('record_create:validation_blocked', {
        reason: 'missing_name',
        recordType: this.data.activeType
      })
      wx.showToast({
        title: '请输入对方姓名',
        icon: 'none'
      })
      return
    }

    if (!value) {
      logger.warn('record_create:validation_blocked', {
        reason: 'missing_value',
        recordType: this.data.activeType
      })
      wx.showToast({
        title: getEmptyValueToast(this.data.activeType),
        icon: 'none'
      })
      return
    }

    if (`${this.data.form.remark || ''}`.length > remarkMaxLength) {
      logger.warn('record_create:validation_blocked', {
        reason: 'remark_too_long',
        recordType: this.data.activeType
      })
      wx.showToast({
        title: '请将内容控制在200字以内哦~',
        icon: 'none'
      })
      return
    }

    this.setData({ saving: true })

    try {
      const savedRecord = await addRecord({
        id: buildRecordId(selectedDate, this.data.form.name, this.data.activeType),
        type: typeConfig.type,
        typeKey: this.data.activeType,
        name: this.data.form.name.trim(),
        date: `${selectedDate.getMonth() + 1}.${selectedDate.getDate()}`,
        fullDate: dateKey(selectedDate),
        dateLabel: dateLabel(selectedDate),
        year: `${selectedDate.getFullYear()}`,
        scene,
        value,
        valueClass: this.data.giftType === 'send' ? 'expense' : 'income',
        amountLabel: typeConfig.amountLabel[this.data.giftType],
        estimatedValue: this.data.form.estimatedValue.trim(),
        cost: this.data.form.cost.trim(),
        remark: this.data.form.remark.trim(),
        images: this.data.images
      })
      logger.info('record_create:save_success', {
        recordId: savedRecord.id,
        recordType: savedRecord.typeKey,
        imageCount: Array.isArray(savedRecord.images) ? savedRecord.images.length : 0
      })

      track('record_create_success', {
        record_id: savedRecord.id,
        record_type: savedRecord.typeKey,
        value_class: savedRecord.valueClass,
        record_scene: savedRecord.scene,
        has_images: Array.isArray(savedRecord.images) && savedRecord.images.length > 0,
        from: this.data.from || '',
        create_duration_ms: Date.now() - this.createStartTime
      })
      clearStoredCreateStartTime()
    } catch (error) {
      logger.error('record_create:save_failed', {
        recordType: this.data.activeType,
        imageCount: this.data.images.length,
        failReason: getSaveFailReason(error),
        error
      })
      console.error('save record failed', error)
      track('record_create_fail', {
        record_type: this.data.activeType,
        fail_reason: getSaveFailReason(error),
        from: this.data.from || ''
      })
      this.setData({ saving: false })
      wx.showToast({
        title: getSaveErrorMessage(error),
        icon: 'none'
      })
      return
    }

    wx.showToast({
      title: '保存成功',
      icon: 'success'
    })

    setTimeout(() => {
      if (this.data.from === 'contact') {
        wx.navigateBack()
        return
      }

      backToCreateEntry()
    }, 800)
  }
})
