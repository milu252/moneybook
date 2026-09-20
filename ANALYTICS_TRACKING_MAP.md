# 埋点清单

本文档整理当前前端项目中所有 `track(...)` 埋点调用位置、触发时机和上报字段。埋点统一由 `utils/analytics.js` 封装。

## 1. 当前上报状态

当前埋点接口已开启：

```js
const ANALYTICS_ENDPOINT = '/analytics/events'
```

埋点会通过 `utils/request.js` 自动拼接 `BASE_URL`，上报到：

```text
POST /analytics/events
```

当接口地址为空时才会退回控制台输出：

```text
[analytics] payload
```

## 2. 公共字段

每个事件都会组装成如下结构：

```json
{
  "event_name": "事件名",
  "timestamp": 1788286400000,
  "page_path": "当前页面路径",
  "properties": {
    "user_id": "当前本地 profile.id",
    "device_id": "本地生成并缓存的匿名设备 ID",
    "os_type": "系统类型",
    "network_type": "网络类型"
  }
}
```

公共字段说明：

- `event_name`：事件名。
- `timestamp`：触发时间，毫秒时间戳。
- `page_path`：当前页面路由，由 `getCurrentPages()` 获取；如果没有页面上下文则为空。
- `user_id`：来自 `data/profile.js` 的本地用户 ID。
- `device_id`：首次埋点时生成，存入 `analytics_device_id`。
- `os_type`：来自 `wx.getDeviceInfo()` 或 `wx.getSystemInfoSync()`。
- `network_type`：来自 `wx.getNetworkType()`。

注意：`user_id` 是前端本地资料中的 ID，不一定等于后端真实用户 ID。后端落库时应优先使用 token 解析出来的用户身份。

## 3. 全局生命周期埋点

| 位置 | 事件名 | 触发时机 | 额外字段 |
| --- | --- | --- | --- |
| `app.js` | `mini_program_launch_uv` | 小程序 `onLaunch` | `scene`：启动场景值 |
| `app.js` | `mini_program_end` | 小程序 `onHide` | 无 |

## 4. 首页埋点

| 位置 | 事件名 | 触发时机 | 额外字段 |
| --- | --- | --- | --- |
| `pages/index/index.js` | `home_page_view` | 首页 `onShow` | 无 |
| `pages/index/index.js` | `home_all_records_click` | 点击首页“全部记录”入口 | 无 |

首页进入记录详情时，会给详情页 URL 带上：

```text
from=home
```

该来源会在记录详情页的 `record_detail_view` 中上报。

## 5. 全部记录页埋点

| 位置 | 事件名 | 触发时机 | 额外字段 |
| --- | --- | --- | --- |
| `pages/records/records.js` | `records_page_view` | 全部记录页 `onShow` | 无 |

全部记录页进入记录详情时，会给详情页 URL 带上：

```text
from=records
```

## 6. 记录详情页埋点

| 位置 | 事件名 | 触发时机 | 额外字段 |
| --- | --- | --- | --- |
| `pages/records/detail/detail.js` | `record_detail_view` | 记录详情页 `onShow`，记录加载成功后 | `record_id`、`record_type`、`from` |
| `pages/records/detail/detail.js` | `record_edit_click` | 点击“编辑记录” | `record_id`、`record_type` |
| `pages/records/detail/detail.js` | `record_delete_click` | 点击删除按钮并打开删除弹窗前 | `record_id`、`record_type` |
| `pages/records/detail/detail.js` | `record_delete_dialog_view` | 删除确认弹窗曝光 | `record_id`、`record_type` |
| `pages/records/detail/detail.js` | `record_delete_success` | 记录成功移入回收站后 | `record_id`、`record_type` |

字段说明：

- `record_id`：记录 ID。
- `record_type`：记录类型，值为 `cash`、`gift`、`meal`。
- `from`：来源页面，例如 `home`、`records`、`stats_records`、`contact_detail`。

进入编辑页时会带上：

```text
from=record_detail
```

## 7. 记录编辑页埋点

| 位置 | 事件名 | 触发时机 | 额外字段 |
| --- | --- | --- | --- |
| `pages/records/edit/edit.js` | `record_edit_page_view` | 编辑页展示且记录加载成功后 | `record_id`、`record_type`、`from` |
| `pages/records/edit/edit.js` | `record_edit_save_click` | 点击保存按钮，进入表单校验前 | `record_id`、`record_type` |
| `pages/records/edit/edit.js` | `record_edit_success` | 编辑接口保存成功后 | `record_id`、`record_type` |

注意：

- `record_edit_save_click` 在表单校验前触发，所以即使后续校验失败，也会计入一次保存点击。
- 当前没有编辑失败埋点。

## 8. 新建入口页埋点

| 位置 | 事件名 | 触发时机 | 额外字段 |
| --- | --- | --- | --- |
| `pages/create/create.js` | `create_page_view` | 新建入口页 `onShow` | 无 |
| `pages/create/create.js` | `record_create_type_click` | 点击礼金/礼物/请客入口 | `record_type` |

字段说明：

- `record_type`：点击的新建类型，值为 `cash`、`gift`、`meal`。

点击新建类型时会记录开始时间到本地缓存 `record_create_start_time`，后续用于计算 `create_duration_ms`。

进入新建表单时会带上：

```text
from=create
```

## 9. 新建记录表单页埋点

| 位置 | 事件名 | 触发时机 | 额外字段 |
| --- | --- | --- | --- |
| `pages/create/edit/edit.js` | `record_create_form_view` | 新建表单页 `onShow` | `record_type`、`from` |
| `pages/create/edit/edit.js` | `record_create_success` | 新建记录接口保存成功后 | `record_id`、`record_type`、`value_class`、`record_scene`、`has_images`、`from`、`create_duration_ms` |
| `pages/create/edit/edit.js` | `record_create_fail` | 新建记录接口保存失败后 | `record_type`、`fail_reason`、`from` |

字段说明：

- `record_id`：后端返回或前端生成的记录 ID。
- `record_type`：记录类型，值为 `cash`、`gift`、`meal`。
- `value_class`：收支方向，值为 `income` 或 `expense`。
- `record_scene`：事由。
- `has_images`：是否包含图片。
- `from`：来源，例如 `create` 或 `contact`。
- `create_duration_ms`：从点击新建入口或联系人详情新增入口，到保存成功的耗时。
- `fail_reason`：失败归因，可能值为 `network_error`、`unauthorized`、`server_error`、`request_error`、`unknown`。

注意：

- `record_create_fail` 只在接口保存失败时触发，表单校验失败不会触发。
- 从联系人详情新增记录时，`from=contact`。

## 10. 统计页埋点

| 位置 | 事件名 | 触发时机 | 额外字段 |
| --- | --- | --- | --- |
| `pages/stats/stats.js` | `stats_page_view` | 统计页 `onShow` | 无 |
| `pages/stats/stats.js` | `stats_year_filter_click` | 打开年份筛选弹窗时 | `record_type` |
| `pages/stats/stats.js` | `stats_year_filter_dialog_view` | 年份筛选弹窗曝光 | `record_type` |
| `pages/stats/stats.js` | `stats_year_filter_option_click` | 点击年份筛选选项 | `record_type`、`year` |
| `pages/stats/stats.js` | `stats_records_click` | 点击来往记录模块的年份或月份行 | `record_type` |
| `pages/stats/stats.js` | `stats_type_switch_click` | 切换礼金/礼物/请客统计分类 | `record_type` |

字段说明：

- `record_type`：当前或切换后的统计类型，值为 `cash`、`gift`、`meal`。
- `year`：筛选项值，可能是 `all` 或具体年份。

## 11. 统计记录明细页埋点

| 位置 | 事件名 | 触发时机 | 额外字段 |
| --- | --- | --- | --- |
| `pages/stats/records/records.js` | `stats_records_page_view` | 统计记录明细页 `onLoad` | `record_type` |

统计记录明细页进入记录详情时，会给详情页 URL 带上：

```text
from=stats_records
```

## 12. 联系人列表页埋点

| 位置 | 事件名 | 触发时机 | 额外字段 |
| --- | --- | --- | --- |
| `pages/contacts/contacts.js` | `contacts_page_view` | 联系人列表页 `onShow` | 无 |
| `pages/contacts/contacts.js` | `contacts_search` | 搜索框输入关键词 500ms 后 | `has_result` |
| `pages/contacts/contacts.js` | `contact_detail_click` | 点击联系人列表中的联系人 | 无 |

字段说明：

- `has_result`：搜索结果是否非空。

注意：

- 清空关键词不会上报 `contacts_search`。
- 搜索建议项点击会直接进入联系人详情，但当前不会触发 `contact_detail_click`。

## 13. 联系人详情页埋点

| 位置 | 事件名 | 触发时机 | 额外字段 |
| --- | --- | --- | --- |
| `pages/contacts/detail/detail.js` | `contact_detail_view` | 联系人详情页 `onShow`，联系人刷新后 | 无 |

联系人详情页进入记录详情时，会给详情页 URL 带上：

```text
from=contact_detail
```

联系人详情页点击“新增记录”进入新建表单时，会：

- 写入 `record_create_start_time`。
- 给新建表单带上 `from=contact`。
- 给新建表单带上联系人姓名 `name`。

## 14. 我的页埋点

| 位置 | 事件名 | 触发时机 | 额外字段 |
| --- | --- | --- | --- |
| `pages/mine/mine.js` | `mine_page_view` | 我的页 `onShow` | 无 |
| `pages/mine/mine.js` | `profile_entry_click` | 点击个人信息卡片 | 无 |
| `pages/mine/mine.js` | `mine_menu_click` | 点击我的页功能菜单 | `menu_key` |

字段说明：

- `menu_key`：菜单 key，可能值为 `share`、`about`、`data`、`feedback`、`settings`。

## 15. 数据管理页埋点

| 位置 | 事件名 | 触发时机 | 额外字段 |
| --- | --- | --- | --- |
| `pages/mine/data/data.js` | `trash_entry_click` | 点击“回收站”入口 | 无 |
| `pages/mine/data/data.js` | `data_export_click` | 点击“导出数据”入口 | 无 |
| `pages/mine/data/data.js` | `data_export_action_click` | 点击导出弹窗中的操作 | `action_type` |

字段说明：

- `action_type`：导出动作，当前为 `download_local` 或 `share_friend`。

## 16. 回收站页埋点

| 位置 | 事件名 | 触发时机 | 额外字段 |
| --- | --- | --- | --- |
| `pages/mine/data/trash.js` | `trash_page_view` | 回收站页 `onShow` | 无 |
| `pages/mine/data/trash.js` | `trash_manage_click` | 点击“管理”进入管理模式 | 无 |
| `pages/mine/data/trash.js` | `trash_restore_click` | 点击“恢复”按钮 | 无 |
| `pages/mine/data/trash.js` | `trash_restore_success` | 恢复选中记录成功后 | `record_count` |
| `pages/mine/data/trash.js` | `trash_delete_click` | 点击“删除”按钮 | 无 |
| `pages/mine/data/trash.js` | `trash_delete_success` | 永久删除选中记录成功后 | `record_count` |

字段说明：

- `record_count`：本次恢复或永久删除的记录数量。

注意：

- `trash_restore_click` 和 `trash_delete_click` 在检查是否已选择记录前触发，所以未选择记录也会计入点击。
- 当前没有恢复失败或永久删除失败埋点。

## 17. 意见反馈页埋点

| 位置 | 事件名 | 触发时机 | 额外字段 |
| --- | --- | --- | --- |
| `pages/mine/feedback/feedback.js` | `feedback_page_view` | 意见反馈页 `onShow` | 无 |

注意：反馈提交成功/失败当前没有埋点，只调用 `POST /feedback`。

## 18. 系统设置页和注销账号埋点

| 位置 | 事件名 | 触发时机 | 额外字段 |
| --- | --- | --- | --- |
| `pages/mine/settings/settings.js` | `account_delete_click` | 点击“注销账号”入口 | 无 |
| `pages/mine/settings/settings.js` | `account_delete_first_confirm_click` | 第一次确认弹窗点击“确定” | 无 |
| `pages/mine/settings/settings.js` | `account_delete_second_confirm_click` | 第二次确认弹窗点击“确定” | 无 |
| `pages/mine/settings/settings.js` | `account_delete_success` | 账号注销接口成功、本地数据清理成功后 | 无 |

注意：

- 当前没有系统设置页曝光埋点。
- 当前没有清除缓存埋点。
- 当前没有注销失败埋点。

## 19. 当前未覆盖但可考虑补充的埋点

- 记录编辑失败：`record_edit_fail`。
- 反馈提交成功/失败：`feedback_submit_success`、`feedback_submit_fail`。
- 清除缓存点击/成功：`cache_clear_click`、`cache_clear_success`。
- 图片预览、保存图片成功/失败。
- 联系人详情点击来源字段，例如 `contact_id`。
- 搜索关键词长度或搜索来源，但不建议直接上传完整关键词，避免隐私风险。
