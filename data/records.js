const { get, post, patch, del, buildUrl } = require('../utils/request')
const { ensureToken } = require('../utils/auth')

const RECORDS_CACHE_KEY = 'moneybook_records'
const CONTACT_RECORD_NAME_STORAGE_KEY = 'moneybook_contact_record_names'
const RECORD_OVERRIDES_STORAGE_KEY = 'moneybook_record_overrides'
const PERMANENTLY_DELETED_RECORD_IDS_STORAGE_KEY = 'moneybook_permanently_deleted_record_ids'

// 内存记录数组，所有页面共享此引用
const records = []

// ── 记录类型配置（edit 页面与格式转换共用）────────────────────────────────

// receive = 收/income，send = 送/expense
const recordTypes = {
  cash: {
    type: '礼金',
    amountLabel: { receive: '收礼金额', send: '送礼金额' },
    valueField: 'amount'
  },
  gift: {
    type: '礼物',
    amountLabel: { receive: '礼物内容', send: '礼物内容' },
    valueField: 'gift'
  },
  meal: {
    type: '请客',
    amountLabel: { receive: '请客', send: '请客' },
    valueField: 'mealContent'
  }
}

function contactIdFromName(name) {
  const normalized = `${name || ''}`.trim()
  return encodeURIComponent(normalized || 'unknown')
}

function contactIdFromRecord(record) {
  return record && record.contactId ? String(record.contactId) : contactIdFromName(record && (record.rawName || record.name))
}

function readContactRecordNameMap() {
  if (typeof wx === 'undefined' || !wx.getStorageSync) return {}

  try {
    const storedNames = wx.getStorageSync(CONTACT_RECORD_NAME_STORAGE_KEY)
    return storedNames && typeof storedNames === 'object' ? storedNames : {}
  } catch (error) {
    return {}
  }
}

function saveContactRecordNameMap(nameMap) {
  if (typeof wx === 'undefined' || !wx.setStorageSync) return

  try {
    wx.setStorageSync(CONTACT_RECORD_NAME_STORAGE_KEY, nameMap)
  } catch (error) {}
}

function removeRecordIdsFromContactNameMap(ids) {
  const recordIds = (ids || []).map((id) => String(id)).filter(Boolean)
  if (!recordIds.length) return

  const nameMap = readContactRecordNameMap()
  let changed = false

  Object.keys(nameMap).forEach((contactId) => {
    const rename = nameMap[contactId]
    const renamedRecordIds = Array.isArray(rename && rename.recordIds)
      ? rename.recordIds.map((id) => String(id))
      : []
    const nextRecordIds = renamedRecordIds.filter((id) => !recordIds.includes(id))

    if (nextRecordIds.length !== renamedRecordIds.length) {
      changed = true
      if (nextRecordIds.length) {
        nameMap[contactId] = {
          ...rename,
          recordIds: nextRecordIds
        }
      } else {
        delete nameMap[contactId]
      }
    }
  })

  if (changed) saveContactRecordNameMap(nameMap)
}

function saveRecordsCache() {
  try { wx.setStorageSync(RECORDS_CACHE_KEY, records) } catch (e) {}
}

function readRecordOverrides() {
  if (typeof wx === 'undefined' || !wx.getStorageSync) return {}

  try {
    const overrides = wx.getStorageSync(RECORD_OVERRIDES_STORAGE_KEY)
    return overrides && typeof overrides === 'object' ? overrides : {}
  } catch (error) {
    return {}
  }
}

function saveRecordOverrides(overrides) {
  if (typeof wx === 'undefined' || !wx.setStorageSync) return

  try {
    wx.setStorageSync(RECORD_OVERRIDES_STORAGE_KEY, overrides)
  } catch (error) {}
}

function removeRecordOverrides(ids) {
  const recordIds = (ids || []).map((id) => String(id))
  if (!recordIds.length) return

  const overrides = readRecordOverrides()
  let changed = false
  recordIds.forEach((id) => {
    if (overrides[id]) {
      delete overrides[id]
      changed = true
    }
  })

  if (changed) saveRecordOverrides(overrides)
}

function saveRecordOverride(id, record) {
  const recordId = String(id || '')
  if (!recordId) return

  const overrides = readRecordOverrides()
  overrides[recordId] = {
    rawName: record.name,
    contactId: record.contactId || '',
    name: record.name,
    typeKey: record.typeKey,
    valueClass: record.valueClass,
    value: record.value,
    amountLabel: record.amountLabel,
    estimatedValue: record.estimatedValue || '',
    cost: record.cost || '',
    remark: record.remark || ''
  }
  saveRecordOverrides(overrides)
}

function readPermanentlyDeletedRecordIds() {
  if (typeof wx === 'undefined' || !wx.getStorageSync) return []

  try {
    const ids = wx.getStorageSync(PERMANENTLY_DELETED_RECORD_IDS_STORAGE_KEY)
    return Array.isArray(ids) ? ids.map((id) => String(id)) : []
  } catch (error) {
    return []
  }
}

function savePermanentlyDeletedRecordIds(ids) {
  if (typeof wx === 'undefined' || !wx.setStorageSync) return

  try {
    wx.setStorageSync(PERMANENTLY_DELETED_RECORD_IDS_STORAGE_KEY, Array.from(new Set(ids.map((id) => String(id)))))
  } catch (error) {}
}

function addPermanentlyDeletedRecordIds(ids) {
  const recordIds = (ids || []).map((id) => String(id)).filter(Boolean)
  if (!recordIds.length) return

  savePermanentlyDeletedRecordIds(readPermanentlyDeletedRecordIds().concat(recordIds))
}

function removePermanentlyDeletedRecordIds(ids) {
  const recordIds = (ids || []).map((id) => String(id))
  if (!recordIds.length) return

  const nextIds = readPermanentlyDeletedRecordIds().filter((id) => !recordIds.includes(id))
  savePermanentlyDeletedRecordIds(nextIds)
}

function formatMonthDay(month, day) {
  return `${Number(month)}.${Number(day)}`
}

function formatFullDate(fullDate) {
  const [year, month = '01', day = '01'] = `${fullDate || ''}`.split('-')
  return year ? `${year}.${Number(month)}.${Number(day)}` : ''
}

function applyContactDisplayName(record, recordNameMap = readContactRecordNameMap(), ignoredContactIds = []) {
  const rawName = `${record.rawName || record.name || ''}`.trim()
  const contactId = contactIdFromRecord(record)
  const recordRename = recordNameMap[contactId]
  const displayName = ignoredContactIds.includes(contactId)
    ? rawName
    : recordRename && recordRename.name
    ? recordRename.name
    : (record.name || rawName)

  return {
    ...record,
    contactId,
    rawName,
    name: displayName,
    date: record.fullDate ? formatMonthDay(...`${record.fullDate}`.split('-').slice(1)) : record.date,
    dateLabel: record.fullDate ? formatMonthDay(...`${record.fullDate}`.split('-').slice(1)) : record.dateLabel,
    fullDateText: record.fullDate ? formatFullDate(record.fullDate) : record.fullDateText
  }
}

function applyRecordOverride(record, recordOverrides = readRecordOverrides()) {
  const override = recordOverrides[String(record.id)]
  if (!override) return record

  const rawName = override.rawName || override.name || record.rawName
  const contactId = override.contactId || record.contactId
  const typeKey = override.typeKey || record.typeKey
  const valueClass = override.valueClass || record.valueClass
  const typeConfig = recordTypes[typeKey] || recordTypes[record.typeKey] || {}
  const dir = valueClass === 'expense' ? 'send' : 'receive'

  return {
    ...record,
    ...override,
    contactId,
    rawName,
    name: override.name || rawName || record.name,
    typeKey,
    valueClass,
    type: typeConfig.type || record.type,
    amountLabel: override.amountLabel || (typeConfig.amountLabel || {})[dir] || record.amountLabel
  }
}

// ── 格式转换 ──────────────────────────────────────────────────────────────

function _normalizeRecord(r) {
  const parts = `${r.full_date || ''}`.split('-')
  const year = parts[0] || ''
  const month = parts[1] || '01'
  const day = parts[2] || '01'
  const typeConfig = recordTypes[r.type_key] || {}
  const dir = r.value_class === 'income' ? 'receive' : 'send'
  return applyContactDisplayName(applyRecordOverride({
    id: String(r.id),
    contactId: r.contact_id ? String(r.contact_id) : '',
    type: typeConfig.type || r.type_key,
    typeKey: r.type_key,
    rawName: r.contact_original_name || r.name,
    name: r.contact_name || r.name,
    date: formatMonthDay(month, day),
    fullDate: r.full_date,
    dateLabel: formatMonthDay(month, day),
    fullDateText: formatFullDate(r.full_date),
    year,
    createdAt: r.created_at || r.createdAt || r.create_time || r.createTime || '',
    updatedAt: r.updated_at || r.updatedAt || r.update_time || r.updateTime || '',
    scene: r.scene,
    value: r.value,
    valueClass: r.value_class,
    amountLabel: (typeConfig.amountLabel || {})[dir] || '',
    remark: r.remark || '',
    estimatedValue: r.estimated_value || '',
    cost: r.cost || '',
    images: r.images || [],
    custom: true,
    deletedAt: r.deleted_at || ''
  }))
}

// ── API 操作 ──────────────────────────────────────────────────────────────

async function fetchRecords() {
  try {
    const data = await requestWithAuthRetry(() => get('/records'))
    const deletedIds = readPermanentlyDeletedRecordIds()
    records.splice(0, records.length, ...data
      .filter((record) => !deletedIds.includes(String(record.id)))
      .map(_normalizeRecord))
    refreshRecordDisplayNames()
  } catch (e) {
    console.error('fetchRecords failed', e)
  }
}

function loadCachedRecords() {
  if (records.length > 0) return
  try {
    const cached = wx.getStorageSync(RECORDS_CACHE_KEY)
    if (Array.isArray(cached) && cached.length > 0) {
      const recordNameMap = readContactRecordNameMap()
      const recordOverrides = readRecordOverrides()
      const deletedIds = readPermanentlyDeletedRecordIds()
      records.splice(0, records.length, ...cached
        .filter((record) => !deletedIds.includes(String(record.id)))
        .map((record) => applyContactDisplayName(applyRecordOverride(record, recordOverrides), recordNameMap)))
      refreshRecordDisplayNames()
    }
  } catch (e) {}
}

function clearRecordsCache() {
  try { wx.removeStorageSync(RECORDS_CACHE_KEY) } catch (e) {}
}

function isUnauthorizedError(error) {
  return error && (error.statusCode === 401 || error.statusCode === 403)
}

function isPersistableImage(image) {
  const value = `${image || ''}`
  if (/^https?:\/\/tmp\//.test(value)) return false
  return /^https?:\/\//.test(value) || value.indexOf('/moneybook/api/v1/records/images/') === 0
}

function getPersistableImages(images) {
  if (!Array.isArray(images)) return []

  return images.filter(isPersistableImage).map((image) => {
    const value = `${image || ''}`
    return value.indexOf('/moneybook/api/v1/records/images/') === 0 ? buildUrl(value) : value
  })
}

function getImageContentType(filePath) {
  const lowerPath = `${filePath || ''}`.toLowerCase()
  if (lowerPath.endsWith('.png')) return 'image/png'
  if (lowerPath.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

async function uploadRecordImage(filePath) {
  console.log('[record image] start upload', {
    filePath,
    contentType: getImageContentType(filePath)
  })

  const fileSystem = wx.getFileSystemManager()
  const data = fileSystem.readFileSync(filePath, 'base64')
  const result = await requestWithAuthRetry(() => post('/records/images', {
    filename: filePath.split('/').pop() || 'record.jpg',
    content_type: getImageContentType(filePath),
    data
  }))

  const imageUrl = result && result.image_url ? buildUrl(result.image_url) : ''
  console.log('[record image] upload result', {
    filePath,
    imageUrl,
    response: result
  })

  return imageUrl
}

async function resolvePersistableImages(images) {
  if (!Array.isArray(images)) {
    console.log('[record image] skip resolve, images is not array', { images })
    return []
  }

  console.log('[record image] resolve start', {
    count: images.length,
    images
  })

  const resolvedImages = []
  for (const [index, image] of images.slice(0, 9).entries()) {
    if (isPersistableImage(image)) {
      const imageUrl = buildUrl(`${image || ''}`)
      console.log('[record image] skip upload, already persistable', {
        index,
        image,
        imageUrl
      })
      resolvedImages.push(imageUrl)
      continue
    }

    console.log('[record image] need upload, local image detected', {
      index,
      image
    })

    try {
      const imageUrl = await uploadRecordImage(image)
      if (imageUrl) {
        resolvedImages.push(imageUrl)
      } else {
        console.log('[record image] upload returned empty image_url', {
          index,
          image
        })
      }
    } catch (error) {
      console.error('[record image] upload failed', {
        index,
        image,
        error
      })
      throw error
    }
  }

  console.log('[record image] resolve done', {
    count: resolvedImages.length,
    images: resolvedImages
  })

  return resolvedImages
}

function buildRecordPayload(record, images) {
  return {
    type_key: record.typeKey,
    value_class: record.valueClass,
    name: record.name,
    scene: record.scene,
    value: record.value,
    full_date: record.fullDate,
    remark: record.remark || '',
    estimated_value: record.estimatedValue || '',
    cost: record.cost || '',
    images
  }
}

async function requestWithAuthRetry(requester) {
  await ensureToken()

  try {
    return await requester()
  } catch (error) {
    if (!isUnauthorizedError(error)) throw error

    await ensureToken(true)
    return requester()
  }
}

async function addRecord(record) {
  const images = await resolvePersistableImages(record.images)
  const result = await requestWithAuthRetry(() => post('/records', buildRecordPayload(record, images)))
  const recordId = String(result.id || record.id || Date.now())
  removePermanentlyDeletedRecordIds([recordId])
  removeRecordOverrides([recordId])
  removeRecordIdsFromContactNameMap([recordId])

  const normalized = _normalizeRecord({
    ...result,
    id: recordId,
    type_key: record.typeKey,
    value_class: record.valueClass,
    name: record.name,
    scene: record.scene,
    value: record.value,
    full_date: record.fullDate,
    remark: record.remark || '',
    estimated_value: record.estimatedValue || '',
    cost: record.cost || '',
    images
  })
  normalized.rawName = result.contact_original_name || record.name
  normalized.name = result.contact_name || record.name

  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (String(records[index].id) === recordId) {
      records.splice(index, 1)
    }
  }

  records.unshift(normalized)
  refreshRecordDisplayNames()
  saveRecordsCache()
  return normalized
}

async function updateRecord(id, record) {
  const recordId = String(id || '')
  if (!recordId) throw new Error('记录不存在')

  const images = await resolvePersistableImages(record.images)
  const result = await requestWithAuthRetry(() => patch(`/records/${recordId}`, buildRecordPayload(record, images)))
  saveRecordOverride(recordId, record)
  const normalized = _normalizeRecord({
    ...result,
    id: result.id || recordId,
    type_key: record.typeKey,
    value_class: record.valueClass,
    name: record.name,
    scene: record.scene,
    value: record.value,
    full_date: record.fullDate,
    remark: record.remark || '',
    estimated_value: record.estimatedValue || '',
    cost: record.cost || '',
    images
  })
  const index = records.findIndex((item) => item.id === recordId)
  if (index !== -1) {
    records.splice(index, 1, normalized)
  } else {
    records.unshift(normalized)
  }
  refreshRecordDisplayNames()
  saveRecordsCache()
  return normalized
}

async function moveRecordToTrash(id) {
  await requestWithAuthRetry(() => del(`/records/${id}`))
  const index = records.findIndex((r) => r.id === String(id))
  if (index !== -1) records.splice(index, 1)
  refreshRecordDisplayNames()
}

async function moveRecordsToTrash(ids) {
  const recordIds = Array.from(new Set((ids || []).map((id) => String(id)).filter(Boolean)))
  if (!recordIds.length) return

  await requestWithAuthRetry(() => Promise.all(recordIds.map((id) => del(`/records/${id}`))))

  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (recordIds.includes(String(records[index].id))) {
      records.splice(index, 1)
    }
  }

  refreshRecordDisplayNames()
}

function updateRecordNamesForContact(contactId, name) {
  const nextName = `${name || ''}`.trim()
  if (!contactId || !nextName) return 0

  let updatedCount = 0
  const updatedRecordIds = []
  records.forEach((record) => {
    const rawName = `${record.rawName || record.name || ''}`.trim()
    if (contactIdFromRecord(record) !== String(contactId)) return

    record.rawName = rawName
    record.name = nextName
    updatedRecordIds.push(String(record.id))
    updatedCount += 1
  })

  if (updatedCount > 0) {
    const recordNameMap = readContactRecordNameMap()
    recordNameMap[contactId] = {
      name: nextName,
      recordIds: updatedRecordIds
    }
    saveContactRecordNameMap(recordNameMap)
    saveRecordsCache()
  }
  return updatedCount
}

function refreshRecordDisplayNames() {
  const recordNameMap = readContactRecordNameMap()

  records.forEach((record) => {
    const nextRecord = applyContactDisplayName(record, recordNameMap)
    Object.assign(record, nextRecord)
  })

  saveRecordsCache()
}

async function fetchTrashRecords() {
  try {
    const data = await requestWithAuthRetry(() => get('/records', { include_deleted: true }))
    const deletedIds = readPermanentlyDeletedRecordIds()
    return data
      .filter((r) => r.is_deleted && !deletedIds.includes(String(r.id)))
      .map((r) => ({ ..._normalizeRecord(r), deletedAt: r.deleted_at }))
  } catch (e) {
    console.error('fetchTrashRecords failed', e)
    return []
  }
}

async function restoreRecordsFromTrash(ids) {
  await requestWithAuthRetry(() => Promise.all(ids.map((id) => post(`/records/${id}/restore`))))
  await fetchRecords()
}

async function deleteTrashRecords(ids) {
  const recordIds = (ids || []).map((id) => String(id)).filter(Boolean)
  await requestWithAuthRetry(() => Promise.all(recordIds.map((id) => del(`/records/${id}/permanent`))))
  addPermanentlyDeletedRecordIds(recordIds)
  removeRecordOverrides(recordIds)
  removeRecordIdsFromContactNameMap(recordIds)

  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (recordIds.includes(String(records[index].id))) {
      records.splice(index, 1)
    }
  }

  saveRecordsCache()
}

// ── 同步工具函数 ──────────────────────────────────────────────────────────

function findRecordById(id) {
  return records.find((r) => r.id === String(id)) || null
}

function getRecordById(id) {
  return findRecordById(id) || records[0] || null
}

function getYearGroups(sourceRecords) {
  const src = sourceRecords || records
  const years = []

  src.forEach((record) => {
    let yearGroup = years.find((item) => item.year === record.year)
    if (!yearGroup) {
      yearGroup = { year: record.year, days: [] }
      years.push(yearGroup)
    }

    let dayGroup = yearGroup.days.find((item) => item.dateLabel === record.dateLabel)
    if (!dayGroup) {
      dayGroup = { dateLabel: record.dateLabel, records: [] }
      yearGroup.days.push(dayGroup)
    }

    dayGroup.records.push(record)
  })

  return years
}

module.exports = {
  recordTypes,
  records,
  fetchRecords,
  loadCachedRecords,
  clearRecordsCache,
  fetchTrashRecords,
  addRecord,
  updateRecord,
  findRecordById,
  getRecordById,
  getYearGroups,
  moveRecordToTrash,
  moveRecordsToTrash,
  updateRecordNamesForContact,
  refreshRecordDisplayNames,
  restoreRecordsFromTrash,
  deleteTrashRecords
}
