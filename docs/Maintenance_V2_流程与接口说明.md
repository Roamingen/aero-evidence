# Maintenance V2 流程与接口说明

最后更新: 2026-03-08

## 1. 这套前后端是怎么分工的

### 前端职责
- 负责登录、录入检修表单、展示记录详情和 revision 时间线。
- 在提交或签名前，先根据当前表单生成 `recordId` 或 `nextRecordId`。
- 根据当前待签动作，拼出待签摘要原文，再由钱包或本地签名模块完成签名。
- 将业务数据、`signedDigest`、`signature` 一起提交给后端。

### 后端职责
- 验证 JWT，确认当前地址对应的是已激活内部用户。
- 按固定规则归一化业务数据，重新计算摘要。
- 校验客户端传来的 `signedDigest` 是否与服务端计算结果一致。
- 校验签名恢复出的地址是否与当前登录用户地址一致。
- 将链下业务数据写入 MySQL，再调用合约把关键摘要写上链。
- 返回记录详情、签名历史、revision 链路等数据给前端。

### 智能合约职责
- 不保存完整大表单，也不保存附件文件本体。
- 只保存检修记录 ID、关键摘要、附件 manifest 摘要、状态、签名证明和计数。
- 控制多人签名门槛，例如技术签名数、审核签名数达到要求后才能进入下一状态。

## 2. 签名逻辑是怎么工作的

### 登录签名
- 用户先请求 challenge。
- 后端生成带 nonce 的消息。
- 用户钱包对 challenge 签名。
- 后端恢复签名地址，确认和已绑定地址一致后签发 JWT。

### 业务签名
- 业务签名不是直接对整份 JSON 原文签名，而是对服务端约定的摘要签名。
- 当前摘要包含以下关键信息：
  - `recordId`
  - `action`
  - `formHash`
  - `attachmentManifestHash`
  - `signerEmployeeNo`
- 当前采用的是 EIP-191 `Ethereum Signed Message` 方式。

### 为什么必须先有 `recordId`
- 因为 `recordId` 本身就在待签摘要里。
- 所以首次提交前，前端必须先生成 `recordId`。
- 驳回后重提前，前端必须先生成 `nextRecordId`。
- 否则客户端无法在请求发送前算出正确的 `signedDigest`。

## 3. 上链逻辑是怎么设计的

### 不上链的内容
- 草稿
- 自动保存
- 录入过程中的错误中间态
- 附件文件本体

### 上链的时机
- 正式提交检修记录时上链。
- 技术会签时追加签名上链。
- 审核会签时追加签名上链。
- RII 批准时追加签名上链。
- 最终放行时追加签名上链。
- 驳回和作废也会作为关键状态动作上链留痕。

### 为什么这样设计
- 避免把草稿、错填、反复修改都写到链上，浪费链上空间。
- 保留真正关键的业务里程碑和签名证据。
- 链下数据库负责承载完整业务内容，链上负责证明“这份内容在某个时间点确实存在且被某些角色签过”。

## 4. 驳回后为什么要走新 revision

- 驳回说明旧版本没有通过。
- 如果直接覆盖旧版本，就会破坏历史证据链。
- 因此当前设计是：
  - revision 1 被驳回后仍然保留
  - revision 2 作为新记录重新提交
  - revision 2 的 `previous_record_id` 指向 revision 1
  - revision 1 的 `superseded_by_record_id` 指向 revision 2
  - 两者共享同一个 `root_record_id`

这样可以清楚看到“哪个版本被驳回、后来是哪个版本替代了它”。

## 5. SQL 里几个核心表分别做什么

### `maintenance_records`
- 主表。
- 一条记录代表一个 revision。
- 保存基础字段、状态、摘要字段、签名门槛、当前签名计数、链上交易信息、驳回原因、revision 关系。

### `maintenance_record_payloads`
- 保存正文类字段。
- 例如工作描述、参考手册、故障代码、故障描述、原始表单 JSON、归一化表单 JSON。

### `maintenance_record_parts`
- 保存部件清单。
- 例如使用件、拆下件、安装件。

### `maintenance_record_measurements`
- 保存测量和测试数据。
- 例如压强、电压、偏转角、是否通过。

### `maintenance_record_replacements`
- 保存替换信息。
- 例如拆下件和安装件之间的对应关系。

### `maintenance_record_signatures`
- 保存链下签名元数据。
- 每条记录对应一次业务签名动作。
- 字段里包含 `signer_role`、`action`、签名地址、摘要、签名哈希、链上交易哈希、签名时间。

### `maintenance_attachment_manifests`
- 保存附件清单摘要。
- 一条记录对应一个 manifest。
- 里面有附件数量、文档数、图片数、视频数、总大小和完整 manifest JSON。

### `maintenance_attachments`
- 保存每个附件的元数据。
- 例如附件类型、文件名、大小、哈希、存储路径、上传状态。
- 当前唯一约束是 `(record_id, attachment_id)`，允许不同 revision 复用同一个附件 ID。

### `maintenance_attachment_upload_jobs`
- 预留给上传后处理任务。
- 例如病毒扫描、缩略图生成、转码、重新计算哈希。

## 6. 后端接口分别做什么

### 认证相关

#### `POST /api/auth/admin/preregister`
- 管理员预注册员工。
- 当前通过 `x-admin-bootstrap-key` 保护。

#### `POST /api/auth/activate/challenge`
- 激活前获取 challenge。

#### `POST /api/auth/activate/verify`
- 验证激活签名并绑定地址。

#### `POST /api/auth/nonce`
- 获取登录 challenge。

#### `POST /api/auth/verify`
- 验证登录签名，签发 JWT。

#### `GET /api/auth/me`
- 返回当前登录用户信息。

### maintenance 相关

#### `POST /api/maintenance/records`
- 创建新记录并正式提交。
- 后端会：
  - 校验 JWT
  - 归一化业务数据
  - 校验 `signedDigest`
  - 验签
  - 写 MySQL
  - 调合约 `submitRecord`

#### `POST /api/maintenance/records/:recordId/signatures`
- 对已有记录追加业务签名。
- 支持 `technician_sign`、`reviewer_sign`、`rii_approve`、`release`、`reject`、`revoke`。

#### `POST /api/maintenance/records/:recordId/resubmit`
- 对已驳回记录生成新 revision 并重新提交。
- 不覆盖旧记录。

#### `GET /api/maintenance/records/:recordId`
- 查询单条记录详情。
- 返回主记录、payload、parts、measurements、replacements、signatures、manifest、attachments、revisions。

#### `GET /api/maintenance/records/:recordId/revisions`
- 查询该记录所在整条 revision 链。

## 7. 当前已落地到什么程度

- 认证接口已可用。
- maintenance 提交接口已可用。
- maintenance 追加签名接口已可用。
- maintenance 驳回后新 revision 重提接口已可用。
- maintenance 详情和 revision 查询接口已可用。
- 本地已完成“激活 -> 提交 -> 驳回 -> 重提 -> 查询 revision”的端到端验证。

## 8. 当前还没做完的部分

- maintenance 列表与筛选接口。
- 前端正式接入 `recordId` 生成和摘要预览。
- 将 `signerRole` / `action` 与 RBAC 权限严格绑定。
- 链下摘要重算与链上防篡改校验接口。
- 正式管理员维护接口。