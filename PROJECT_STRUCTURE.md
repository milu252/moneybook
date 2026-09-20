# 项目结构说明

这个项目是一个微信小程序，定位是“礼金/礼物/请客往来记录本”。当前代码主要是小程序原生页面、组件、样式、本地 JS 数据层和自建后端接口。用户新建、编辑、删除记录会优先同步到后端，并通过微信本地缓存做页面快速展示和失败兜底。

后续 AI 或开发者接手任务前，建议先读本文件，再按需查看对应页面、组件和数据文件。

## 技术栈与运行形态

- 平台：微信小程序
- 框架：原生 `Page` / `Component`
- 视图：WXML
- 样式：WXSS
- 数据：本地 JS 数据层 + 微信本地缓存
- 渲染器：Skyline
- 组件框架：Glass-easel
- 自定义导航：已开启，`navigationStyle: "custom"`
- 组件懒加载：`lazyCodeLoading: "requiredComponents"`

核心配置在 `app.json`，项目配置在 `project.config.json`。

`ANALYTICS_TRACKING_MAP.md` 记录当前前端所有埋点位置、触发时机和上报字段。

`BACKEND_ADAPTATION_FROM_LAST_COMMIT.md` 记录最近一次前端提交后，后端需要适配的接口、字段和账号注销/埋点事项，方便交接后端开发。

## 顶层目录

```text
.
├─ app.js
├─ app.json
├─ app.wxss
├─ ANALYTICS_TRACKING_MAP.md
├─ BACKEND_ADAPTATION_FROM_LAST_COMMIT.md
├─ project.config.json
├─ project.private.config.json
├─ sitemap.json
├─ assets/
│  └─ icons/
├─ data/
│  ├─ records.js
│  └─ contacts.js
├─ utils/
│  ├─ analytics.js
│  ├─ auth.js
│  ├─ export-records.js
│  ├─ logger.js
│  ├─ pinyin.js
│  └─ request.js
├─ pages/
│  ├─ index/
│  ├─ stats/
│  │  └─ records/
│  ├─ create/
│  │  └─ edit/
│  ├─ contacts/
│  │  ├─ detail/
│  │  └─ edit/
│  ├─ mine/
│  ├─ records/
│  │  ├─ detail/
│  │  └─ edit/
└─ components/
   ├─ navigation-bar/
   ├─ app-tabbar/
   ├─ record-type-filter/
   └─ record-group-list/
```

## 页面路由

页面注册顺序来自 `app.json`：

1. `pages/index/index`：首页
2. `pages/stats/stats`：统计页
3. `pages/create/create`：新建记录入口页
4. `pages/create/edit/edit`：新建记录编辑页
5. `pages/contacts/contacts`：联系人列表页
6. `pages/contacts/detail/detail`：联系人详情页
7. `pages/contacts/edit/edit`：联系人编辑页
8. `pages/mine/mine`：我的页
9. `pages/records/records`：全部记录页
10. `pages/records/detail/detail`：记录详情页
11. `pages/records/edit/edit`：记录编辑页
12. `pages/stats/records/records`：统计页来往记录明细页
13. `pages/mine/about/about`：关于我们页
14. `pages/mine/about/version/version`：版本号页
15. `pages/mine/about/help`：使用帮助页
16. `pages/mine/data/data`：数据管理页
17. `pages/mine/data/trash`：回收站页
18. `pages/mine/feedback/feedback`：意见反馈页
19. `pages/mine/profile/edit/edit`：个人信息编辑页
20. `pages/mine/settings/settings`：系统设置页
21. `pages/mine/settings/agreement/agreement`：用户协议页
22. `pages/mine/settings/privacy/privacy`：隐私政策页

## 数据层

### `data/records.js`

维护礼金、礼物、请客记录列表。运行时会清空原型占位记录，只展示用户通过新建页保存到本地缓存的记录，以及当前会话中新建的记录。

主要导出：

- `records`：记录数组
- `addRecord(record)`：新增一条记录，写入运行时记录数组和微信本地缓存
- `findRecordById(id)`：按记录 ID 查找详情，找不到时返回 `undefined`
- `getRecordById(id)`：按记录 ID 查找详情，找不到时返回第一条记录
- `getYearGroups(sourceRecords = records)`：把记录按年份和日期分组，供全部记录页展示
- `moveRecordToTrash(id)`：把指定记录移入回收站并写入本地缓存
- `getTrashRecords()`：读取回收站记录
- `restoreRecordsFromTrash(ids)`：从回收站恢复指定记录
- `deleteTrashRecords(ids)`：从回收站永久删除指定记录

记录对象大致字段：

```js
{
  id,
  type,
  typeKey,      // cash | gift | meal
  name,
  date,
  fullDate,
  dateLabel,
  year,
  scene,
  value,
  valueClass,   // income | expense
  amountLabel,
  remark
}
```

### `data/contacts.js`

根据 `data/records.js` 中的当前记录动态派生联系人分组和联系人详情；后端已新增独立联系人表，前端优先使用记录返回的 `contact_id` 作为联系人唯一标识。联系人改名会调用后端 `PATCH /contacts/{id}` 持久化显示名，同时更新本地记录缓存用于即时刷新。旧本地缓存记录没有 `contact_id` 时，会继续按姓名生成兼容 ID。

主要导出：

- `getContactGroups()`：按字母分组生成联系人列表
- `getContacts()`：生成扁平联系人列表
- `getContactDetail(id)`：按联系人 ID 查详情，找不到时返回 `null`
- `getContactRecordById(id)`：按联系人详情里的来往条目 ID 查找并转换成记录详情页可用的数据
- `updateContactName(id, name)`：更新联系人姓名；数字型联系人 ID 会同步调用后端联系人接口，随后写入微信本地缓存

联系人详情中有 `total` 汇总和 `records` 往来条目。联系人 ID 优先来自后端 `contact_id`，兼容旧数据时才由原始姓名编码生成。

## 工具层

### `utils/export-records.js`

负责把当前未删除记录导出为 CSV 文件。

主要导出：

- `buildRecordsCsv(sourceRecords)`：把记录数组转换为带 UTF-8 BOM 的 CSV 字符串
- `createRecordsCsvFile()`：刷新当前记录后生成 `moneybook-records-YYYY-MM-DD.csv`，写入小程序本地用户目录并返回文件信息

### `utils/analytics.js`

统一埋点封装。当前后端统一上报接口尚未确认，`ANALYTICS_ENDPOINT` 为空时会在控制台输出埋点 JSON，不发起网络请求；后续只需要补充接口路径即可统一上报。

全局公共属性：

- `event_name`：事件名
- `timestamp`：事件触发时间，毫秒时间戳
- `page_path`：当前页面路径，有页面上下文时自动携带
- `user_id`：当前用户 ID，自动放在 `properties` 中
- `device_id`：匿名设备 ID，首次上报时本地生成并缓存，自动放在 `properties` 中
- `os_type`：系统类型，例如 iOS、Android、devtools，自动放在 `properties` 中
- `network_type`：当前网络类型，例如 wifi、4g、5g、none、unknown，自动放在 `properties` 中

### `utils/logger.js`

客户端本地日志工具。用于记录关键流程的结构化诊断日志，同时保留控制台输出。

主要导出：

- `init()`：小程序启动时初始化日志目录，并清理过期日志
- `debug(event, data)` / `info(event, data)` / `warn(event, data)` / `error(event, data)`：写入结构化日志
- `getLogFilePath()`：获取当日日志文件路径
- `listLogFiles()`：列出本地日志文件
- `readTodayLog()`：读取当日日志内容
- `clearOldLogs()`：清理过期日志

实现规则：

- 日志文件存放在 `wx.env.USER_DATA_PATH/logs/`
- 按天写入 `YYYY-MM-DD.log`
- 单文件超过 512KB 时轮转为 `.log.1`
- 默认清理 7 天前日志
- `token`、`authorization`、`openid`、`session_key`、`password`、图片 base64 `data` 等字段会脱敏或省略
- `warn` 和 `error` 会尝试同步写入微信实时日志
- 当前重点覆盖请求失败/写接口成功、记录新建和编辑、记录图片上传、个人资料拉取和保存、头像上传和头像加载失败等仅靠后端日志难以定位的前端问题

当前已接入事件：

- `mini_program_launch_uv`：小程序访问人数（UV），小程序启动时触发，携带 `user_id`、`scene`
- `mini_program_end`：小程序退出，用户关闭小程序或切到后台时触发，携带 `user_id`
- `home_page_view`：首页访问，用于统计首页 PV 和首页 UV，首页每次展示时触发，携带 `user_id`
- `home_all_records_click`：点击首页“全部记录”入口时触发，携带 `user_id`
- `records_page_view`：全部记录页访问，用于统计全部记录页 PV 和 UV，全部记录页每次展示时触发，携带 `user_id`
- `record_detail_view`：记录详情页访问，用于统计记录详情页 PV 和 UV，进入记录详情页时触发，携带 `user_id`、`record_id`、`record_type`、`from`
- `record_delete_click`：点击删除记录按钮，点击记录详情页删除记录按钮时触发，携带 `user_id`、`record_id`、`record_type`
- `record_delete_dialog_view`：删除记录弹窗曝光，用于统计删除记录弹窗 PV 和 UV，删除确认弹窗展示时触发，携带 `user_id`、`record_id`、`record_type`
- `record_delete_success`：记录删除成功，后端删除记录成功后触发，携带 `user_id`、`record_id`、`record_type`
- `record_edit_click`：点击编辑记录按钮，点击记录详情页编辑记录按钮时触发，携带 `user_id`、`record_id`、`record_type`
- `record_edit_page_view`：记录编辑页访问，用于统计记录编辑页 PV 和 UV，进入记录编辑页时触发，携带 `user_id`、`record_id`、`record_type`、`from`
- `record_edit_save_click`：点击编辑保存按钮，点击记录编辑页保存按钮时触发，携带 `user_id`、`record_id`、`record_type`
- `record_edit_success`：记录编辑保存成功，后端更新记录成功后触发，携带 `user_id`、`record_id`、`record_type`
- `record_create_success`：新建记录保存成功，后端创建记录成功后触发，携带 `user_id`、`record_id`、`record_type`、`value_class`、`record_scene`、`has_images`、`from`、`create_duration_ms`
- `record_create_fail`：新建记录保存失败，点击保存且后端返回失败时触发，携带 `user_id`、`record_type`、`fail_reason`、`from`
- `record_create_type_click`：点击新建类型入口，点击礼金/礼物/请客入口时触发，携带 `user_id`、`record_type`
- `record_create_form_view`：新建表单页访问，用于统计新建表单页 PV 和 UV，进入新建表单页时触发，携带 `user_id`、`record_type`、`from`
- `stats_page_view`：统计页访问，用于统计统计页 PV 和 UV，统计页每次展示时触发，携带 `user_id`
- `stats_type_switch_click`：点击类型标签切换组件，点击统计页顶部礼金/礼物/请客切换组件时触发，携带 `user_id`、`record_type`
- `stats_year_filter_click`：点击筛选按钮，点击统计图右上角筛选按钮时触发，携带 `user_id`、`record_type`
- `stats_year_filter_dialog_view`：筛选弹窗曝光，用于统计筛选弹窗 PV 和 UV，筛选弹窗展示时触发，携带 `user_id`、`record_type`
- `stats_year_filter_option_click`：点击筛选弹窗选项，点击全部年份或具体年份选项时触发，携带 `user_id`、`record_type`、`year`
- `stats_records_click`：点击来往记录模块时间行，点击某个年份或月份时间行时触发，携带 `user_id`、`record_type`
- `stats_records_page_view`：统计记录列表页访问，用于统计记录列表页 PV 和 UV，从统计页进入来往记录列表页时触发，携带 `user_id`、`record_type`
- `create_page_view`：新建页访问，用于统计新建页 PV 和 UV，新建页每次展示时触发，携带 `user_id`
- `contacts_page_view`：联系人页访问，用于统计联系人页 PV 和 UV，联系人页每次展示时触发，携带 `user_id`
- `contacts_search`：联系人搜索，用户在搜索框输入内容后触发，携带 `user_id`、`has_result`
- `contact_detail_click`：点击联系人，点击联系人列表模块中的联系人时触发，携带 `user_id`
- `contact_detail_view`：联系人详情页访问，用于统计联系人详情页 PV 和 UV，进入联系人详情页时触发，携带 `user_id`
- `mine_page_view`：我的页访问，用于统计我的页 PV 和 UV，我的页每次展示时触发，携带 `user_id`
- `profile_entry_click`：点击个人信息卡片，点击我的页顶部个人信息卡片时触发，携带 `user_id`
- `mine_menu_click`：点击功能菜单卡片，点击分享给好友/关于我们/数据管理/意见反馈/系统设置时触发，携带 `user_id`、`menu_key`
- `data_export_click`：点击导出数据，点击数据管理页导出数据入口时触发，携带 `user_id`
- `data_export_action_click`：点击导出数据后操作，点击本地下载或分享给好友时触发，携带 `user_id`、`action_type`
- `trash_entry_click`：点击回收站，点击数据管理页回收站入口时触发，携带 `user_id`
- `trash_page_view`：回收站访问，用于统计回收站 PV 和 UV，进入回收站页时触发，携带 `user_id`
- `trash_manage_click`：回收站管理按钮点击，用于统计管理按钮点击 PV 和 UV，点击回收站页管理按钮时触发，携带 `user_id`
- `trash_restore_click`：回收站恢复按钮点击，用于统计恢复按钮点击 PV 和 UV，点击回收站页恢复按钮时触发，携带 `user_id`
- `trash_delete_click`：回收站删除按钮点击，用于统计删除按钮点击 PV 和 UV，点击回收站页删除按钮时触发，携带 `user_id`
- `trash_restore_success`：回收站恢复成功，点击恢复按钮且后端返回成功时触发，携带 `user_id`、`record_count`
- `trash_delete_success`：回收站删除成功，点击删除按钮且后端返回成功时触发，携带 `user_id`、`record_count`
- `feedback_page_view`：意见反馈页访问，用于统计意见反馈页 PV 和 UV，意见反馈页每次展示时触发，携带 `user_id`
- `account_delete_click`：点击注销账号按钮，点击系统设置页注销账号入口时触发，携带 `user_id`
- `account_delete_first_confirm_click`：点击首次弹窗确定按钮，在首次注销确认弹窗中点击确定时触发，携带 `user_id`
- `account_delete_second_confirm_click`：点击二次弹窗确定按钮，在二次注销确认弹窗中点击确定时触发，携带 `user_id`
- `account_delete_success`：注销账号成功，后端注销账号成功返回后触发，携带 `user_id`

## 页面职责

### `pages/index`

首页。展示来往统计卡片和最近记录。

依赖：

- `data/records.js`
- `components/navigation-bar`
- `components/app-tabbar`
- `components/record-group-list`

主要跳转：

- `goAllRecords()` 跳到全部记录页
- `goRecordDetail(event)` 跳到记录详情页

注意：首页会在 `onShow()` 重新读取 `records`，所以新建记录、删除记录或恢复记录后返回首页会刷新统计和最近记录。首页 PV/UV 通过 `home_page_view` 统计；PV 统计事件次数，UV 按 `user_id` 去重。

### `pages/records`

全部记录页。支持按类型筛选记录、按时间正序/倒序排序，并按年份、日期分组展示。

依赖：

- `data/records.js`
- `components/navigation-bar`
- `components/record-type-filter`
- `components/record-group-list`

核心逻辑：

- `selectedType` 控制筛选类型
- `selectedSort` 控制时间排序方向，默认倒序
- `refreshRecords()` 根据类型过滤记录，再按 `fullDate` 排序
- `getYearGroups()` 生成页面展示结构

### `pages/records/detail`

记录详情页。通过 URL 参数 `id` 查询本地记录并展示。

依赖：

- `data/records.js`
- `components/navigation-bar`

注意：

- `editRecord()` 跳到记录编辑页，并通过 URL 参数传递当前记录 ID
- 删除记录确认后会调用 `moveRecordToTrash(id)`，把记录移入回收站并返回上一页。

### `pages/records/edit`

记录编辑页。由记录详情页“编辑记录”按钮进入，自动填充当前记录内容。

依赖：

- `data/records.js`

核心逻辑：

- URL 参数 `id` 查询记录详情并填充表单
- `activeType` 固定当前记录大类：`cash`、`gift`、`meal`
- `giftType` 根据 `valueClass` 映射为收礼或送礼
- 礼金记录填充金额，礼物记录填充礼物，请客记录填充请客内容
- 保留日期选择器和最多 3 张图片选择

注意：`saveRecord()` 目前只弹出“记录修改待接入”的 toast，没有真实写入 `data/records.js`，也没有本地缓存或后端提交。

### `pages/stats`

统计页。按礼金、礼物、请客三个分类展示统计摘要、柱状图和年度表格。

依赖：

- `data/records.js`
- `components/navigation-bar`
- `components/app-tabbar`

核心逻辑：

- `categories` 定义三个统计类别
- `selectedYear` 控制统计图和来往记录按全部年份或指定年份筛选，默认全部年份
- `buildStats(activeKey, selectedYear)` 根据 `records` 计算统计数据
- 金额类按数值正负计算收到/送出
- 礼物和请客类按 `valueClass` 计算收到/送出次数

注意：`switchCategory()` 使用 `wx.redirectTo` 重新进入统计页，并带上 `type` 参数。

### `pages/stats/records`

统计页来往记录明细页。由统计页“来往记录”模块点击年份或月份进入，按当前统计分类和时间范围展示记录条目。

依赖：

- `data/records.js`
- `components/navigation-bar`
- `components/record-group-list`

核心逻辑：

- URL 参数 `type` 控制记录类型：`cash`、`gift`、`meal`
- URL 参数 `period` 控制时间范围：年份如 `2025`，月份如 `2025-11`
- 记录按 `fullDate` 时间倒序排序
- 点击记录条目跳转到 `pages/records/detail/detail`

### `pages/create`

新建记录入口页。展示礼金、礼物、请客三个入口卡片，点击后进入新建记录编辑页，并通过 URL 参数 `type` 指定初始类型。

依赖：

- `components/navigation-bar`
- `components/app-tabbar`

核心逻辑：

- `goCreateEdit(event)` 读取入口卡片的 `data-type`
- 跳转到 `pages/create/edit/edit?type=cash|gift|meal`

### `pages/create/edit`

新建记录编辑页。支持礼金、礼物、请客三种类型的表单切换，内置日期选择器和图片选择。

核心逻辑：

- `activeType` 控制当前表单类型
- `giftType` 控制收礼/送礼
- `form` 保存输入字段
- `calendarDays` 生成 6 行日历网格
- `chooseImage()` 最多选择 3 张图片

注意：`saveRecord()` 会调用 `addRecord()` 写入运行时记录和微信本地缓存，显示“保存成功”toast 后返回新建入口页。当前仍未接入后端或云开发。

### `pages/contacts`

联系人列表页。根据当前记录动态展示按字母分组的联系人，支持按姓名、往来次数、金额搜索。

依赖：

- `data/contacts.js`
- `components/navigation-bar`
- `components/app-tabbar`

核心逻辑：

- `keyword` 保存搜索词
- `suggestions` 保存最多 6 条搜索建议
- `onShow()` 会重新从 `data/records.js` 派生联系人分组和联系人数量
- 点击联系人跳到联系人详情页

### `pages/contacts/detail`

联系人详情页。展示联系人汇总、来往条目和删除确认弹窗。

依赖：

- `data/contacts.js`
- `components/navigation-bar`

注意：

- `editContact()` 跳转到 `pages/contacts/edit/edit`
- `confirmDelete()` 只是跳回联系人列表页，没有真实删除数据
- 往来条目跳转到 `pages/records/detail/detail`；详情页会先查 `data/records.js`，找不到时再用 `getContactRecordById()` 从联系人数据中转换记录

### `pages/contacts/edit`

联系人编辑页。当前只支持修改联系人姓名。

依赖：

- `data/contacts.js`
- `components/navigation-bar`

核心逻辑：

- URL 参数 `id` 查询联系人并填充当前姓名
- `updateName()` 更新输入框状态
- `saveContact()` 校验姓名不能为空，调用 `updateContactName(id, name)` 同步后端联系人显示名，并写入内存数据和微信本地缓存
- 保存后 `wx.navigateBack()` 返回联系人详情页
- 联系人详情页在 `onShow()` 重新读取联系人并刷新后端记录，因此返回后姓名会刷新

### `pages/mine`

我的页。展示用户信息卡片、功能入口列表和退出登录入口。

依赖：

- `components/navigation-bar`
- `components/app-tabbar`

核心逻辑：

- `user` 保存用户名、用户 ID 和头像
- `onShow()` 会先展示本地缓存资料，再从后端刷新账号资料
- `menuItems` 渲染分享给好友、关于我们、数据管理、意见反馈、系统设置
- “关于我们”跳转到 `pages/mine/about/about`
- “分享给好友”使用 `open-type="share"` 拉起微信转发面板
- “数据管理”跳转到 `pages/mine/data/data`
- “意见反馈”跳转到 `pages/mine/feedback/feedback`
- “系统设置”跳转到 `pages/mine/settings/settings`
- 点击顶部个人信息卡片跳转到 `pages/mine/profile/edit/edit`
- 其他功能入口和退出登录均为 toast 占位，业务逻辑待接入

### `pages/mine/profile/edit`

个人信息编辑页。展示头像、昵称输入和保存修改按钮。

依赖：

- `components/navigation-bar`

核心逻辑：

- 点击头像通过微信原生 `open-type="chooseAvatar"` 选择微信头像、拍摄或从相册选择
- 昵称输入框使用 `type="nickname"`，支持键盘上方“使用微信昵称”
- 保存时会先上传本地临时头像，再调用后端账号资料接口同步昵称和头像 URL

### `pages/mine/about`

关于我们页。展示版本号和使用帮助两个入口。

依赖：

- `components/navigation-bar`

核心逻辑：

- 点击“版本号”跳转到 `pages/mine/about/version/version`
- 点击“使用帮助”跳转到 `pages/mine/about/help`

### `pages/mine/about/version`

版本号页。展示当前版本号。

依赖：

- `components/navigation-bar`

核心逻辑：

- `version` 保存当前展示版本，当前为 `V.1.1.0`

### `pages/mine/about/help`

使用帮助页。展示使用帮助说明卡片。

依赖：

- `components/navigation-bar`

核心逻辑：

- 页面使用米白色背景和白色卡片承接帮助内容
- 当前已接入第一张卡片：`一款帮你记录人情来往的小工具`
- 当前已接入第二张卡片：`基础操作`，包含快速添加记录、查找历史记录、查看记录详情、重新编辑记录、恢复删除记录五个说明小卡片
- 当前已接入第三张卡片：`常见问题`，包含收费、数据丢失、离线使用、多设备同步、意见反馈五个 QA 小卡片

### `pages/mine/data`

数据管理页。展示导出数据、回收站两个入口。

依赖：

- `components/navigation-bar`

核心逻辑：

- `actions` 渲染导出数据和回收站入口
- 点击“回收站”跳转到 `pages/mine/data/trash`
- 点击“导出数据”会生成当前未删除记录的 CSV 文件
- “本地下载”会尝试打开生成的 CSV 文件并显示系统菜单
- “发送给好友”会通过 `wx.shareFileMessage` 分享生成的 CSV 文件
- 点击“诊断日志”会通过 `wx.shareFileMessage` 分享当日本地日志文件，便于排查用户反馈的前端问题

### `pages/mine/data/trash`

回收站页。展示已删除的记录。

依赖：

- `data/records.js`
- `components/navigation-bar`
- `components/record-group-list`

核心逻辑：

- `onShow()` 读取 `getTrashRecords()` 并按日期倒序展示
- 使用 `getYearGroups()` 按年份和日期分组
- 点击右上角“管理”进入批量管理模式，支持全选、恢复、删除
- 非管理模式点击回收站条目当前仍为提示占位

### `pages/mine/feedback`

意见反馈页。展示邮箱、反馈类型、反馈内容和提交按钮。

依赖：

- `components/navigation-bar`

核心逻辑：

- 邮箱为 `2523369515@qq,com`，点击邮箱卡片复制邮箱
- `feedbackTypes` 渲染四个反馈类型按钮，点击后按钮变绿，再次点击取消
- 反馈类型必填，未选择时提交会显示居中弹窗占位
- 反馈内容必填，且限制 500 字以内，超过时 toast 提示“请将内容控制在500字以内哦~”
- 居中弹窗目前为临时样式，等待正式弹窗设计替换

### `pages/mine/settings`

系统设置页。按缓存管理、法律条款、账号管理分组展示设置入口。

依赖：

- `components/navigation-bar`

核心逻辑：

- `sections` 渲染清除缓存、用户协议、隐私政策、注销账号
- 点击“用户协议”跳转到 `pages/mine/settings/agreement/agreement`
- 点击“隐私政策”跳转到 `pages/mine/settings/privacy/privacy`
- 点击“清除缓存”展示确认弹窗，确认后清空本地缓存
- 点击“注销账号”展示两次确认弹窗，最终调用 `DELETE /account`，后端成功后清空本地缓存、token 和内存记录，再展示注销成功弹窗

### `pages/mine/settings/agreement`

用户协议页。展示用户协议正文。

依赖：

- `components/navigation-bar`

核心逻辑：

- 页面使用米白色背景和白色卡片承接协议内容
- 当前协议更新日期为 `2026年6月18日`

### `pages/mine/settings/privacy`

隐私政策页。展示隐私政策正文。

依赖：

- `components/navigation-bar`

核心逻辑：

- 页面使用米白色背景和白色卡片承接隐私政策内容
- 当前隐私政策更新日期为 `2026年6月18日`

## 组件职责

### `components/navigation-bar`

自定义顶部导航栏。

特性：

- 支持标题、背景色、文字色、返回按钮、homeButton、loading、显示隐藏动画等属性
- 在 `attached` 生命周期中读取胶囊按钮和窗口信息，适配安全区和右侧胶囊区域
- `back()` 默认调用 `wx.navigateBack`

### `components/app-tabbar`

自定义底部导航栏。

Tab：

- 首页：`index`
- 统计：`stats`
- 新建：`create`
- 联系人：`contacts`
- 我的：`mine`

切换方式：`wx.redirectTo({ url: /pages/${page}/${page} })`

注意：

- 这些页面没有使用微信原生 `tabBar` 配置，而是自定义组件模拟底部导航。
- 首页、统计、联系人、我的等底部图标使用 `assets/icons/` 下的 SVG 资源；未选中态为灰色 SVG，选中态切换为黑色 SVG，并通过组件内叠加新建按钮主色色块实现局部填充。
- 新建记录编辑页的日期图标使用 `assets/icons/create-date.svg`；日历弹窗年月选择下拉按钮使用 `assets/icons/calendar-dropdown.svg`；日历弹窗上/下月按钮使用 `assets/icons/calendar-prev.svg` 和 `assets/icons/calendar-next.svg`。
- 联系人页搜索框左侧放大镜图标使用 `assets/icons/contacts-search.svg`。
- 全部记录页顶部类型筛选图标使用 `assets/icons/filter-all-types.svg`，由 `components/record-type-filter` 引用。
- 意见反馈页邮箱卡片图标使用 `assets/icons/mine-feedback-email.svg`。
- 个人信息编辑页保存修改按钮图标使用 `assets/icons/profile-save.svg`。
- 使用帮助页第一张卡片图标使用 `assets/icons/help-wallet.svg`。

### `components/record-type-filter`

全部记录页顶部筛选组件。

输入属性：

- `options`
- `selectedType`
- `selectedLabel`
- `open`
- `sortOptions`
- `selectedSort`
- `sortOpen`
- `sortLabel`

输出事件：

- `toggle`
- `select`
- `sorttoggle`
- `sortselect`

### `components/record-group-list`

统一的记录列表组件。首页“最近记录”和统计/全部记录的分组条目都使用它，保证类型、姓名、时间、事由、金额/礼物内容/请客内容、箭头等条目结构和样式一致。

输入属性：

- `yearGroups`
- `records`
- `plain`：普通列表模式，不显示年份/日期分组标题
- `embedded`：嵌入卡片模式，不额外添加组件外层内边距
- `hideYear`：隐藏年份标题，回收站页使用
- `selectable`：选择模式，条目左侧显示选择圆点，回收站管理模式使用

输出事件：

- `recordtap`，携带 `{ id }`
- `selectrecord`，选择模式下点击条目触发，携带 `{ id }`

## 当前完成度

已经完成：

- 小程序页面和组件基本结构
- 首页、统计、全部记录、详情、联系人、新建等核心界面
- 本地 JS 数据模型和微信本地缓存写入
- 新建记录保存后同步首页、统计页、联系人页
- 记录筛选和统计计算
- 自定义导航栏和自定义底部 TabBar

尚未完成或仍是原型：

- 编辑记录真实保存
- 删除联系人
- 联系人删除的后端级联策略和交互确认
- 表单校验和错误提示

## 重要注意事项

- 项目文件是 UTF-8 编码。PowerShell 默认 `Get-Content` 可能显示中文乱码，读取时建议使用 `Get-Content -Encoding UTF8`。
- 当前目录不是 Git 仓库，无法通过 `git status` 或提交历史判断变更来源。
- 代码里没有 npm 依赖和构建脚本，主要应通过微信开发者工具打开项目。
- 如果要做数据写入功能，优先先决定数据源方案：本地缓存、云开发数据库、还是自建接口。
- 联系人数据由记录动态派生；如果后续接入云端联系人表，需要重新确认联系人 ID 与记录中姓名字段的关系。

## 接手建议

做功能前建议按这个顺序看：

1. `app.json`：确认页面、组件和渲染配置
2. `data/records.js`、`data/contacts.js`：确认数据模型
3. 目标页面的 `.js`：理解状态和事件
4. 目标页面的 `.wxml`：理解展示结构
5. 目标页面的 `.wxss`：理解布局和视觉约束
6. 相关组件目录：确认事件和属性边界

如果任务涉及业务闭环，优先检查该功能是否只是 UI 原型。例如新建记录已接入本地缓存，但编辑记录、删除联系人等仍没有完整数据层实现。
