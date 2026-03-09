# 民航检修记录存证系统 - 当前架构方案

最后更新: 2026-03-08

## 1. 当前技术路线
- 联盟链/企业链主线: Hyperledger Besu QBFT，用于生产环境部署。
- 本地开发链: Hardhat 3，用于合约开发、后端联调和前端 demo 调试。
- 后端: Node.js + Express + mysql2 + ethers。
- 前端: Vue 3 + Vite + Element Plus + vue-router。
- 数据模型: 链下 MySQL 保存完整业务数据，链上只保存关键摘要与状态流转。

## 2. 系统分层

### 2.1 前端层
- 认证页单独存在，只负责预注册、激活、登录。
- 业务区采用产品化后台布局，包含左侧可收起导航栏和多模块工作区。
- 当前已落地的模块页:
  - 审批工作台
  - 提交中心
  - 查阅中心
  - 人员管理
- 浏览器端仍负责私钥签名，后端不持有用户私钥。

### 2.2 后端服务层
- `auth` 负责管理员预注册、激活 challenge、登录 nonce、JWT 发放和当前用户查询。
- `maintenance` 负责记录准备、正式提交、签名追加、revision 重提、记录查询、列表筛选和审批工作台汇总。
- 管理后台接口新增:
  - 用户列表和用户更新
  - 角色目录查询
  - 指定签名模板查询和保存

### 2.3 数据存储层
- `users`、`roles`、`permissions`、`user_roles` 等表负责认证和 RBAC。
- `maintenance_records` 及其 payload/parts/measurements/replacements/signatures/attachments 等表负责检修业务。
- `maintenance_record_specified_signers` 负责链下约束“指定签名人”。
- `maintenance_signer_templates` 负责预设模板级的默认指定签名人配置。

### 2.4 区块链层
- 合约使用 `AviationMaintenanceV2.sol`。
- 链上记录的重点是:
  - 记录 ID
  - 表单摘要 Hash
  - 附件 manifest Hash
  - 签名动作与状态推进
- 后端在调用链前会校验部署地址是否存在链上字节码，避免本地链重启后出现无意义的 BAD_DATA 错误。

## 3. 关键业务流

### 3.1 认证流
1. 管理员预注册员工账号。
2. 员工使用激活码 + 私钥签名完成地址绑定。
3. 登录时以后端 nonce 为 challenge，浏览器本地签名后换取 JWT。

### 3.2 提交流
1. 前端先请求 `POST /api/maintenance/records/prepare`。
2. 后端生成内部字段，例如 `recordId`、`jobCardNo`、执行人信息和 `signedDigest`。
3. 前端只对后端返回的 `signedDigest` 做本地签名。
4. 后端完成链下落库、链上提交和首个签名写入。

### 3.3 审批流
1. 审核、RII、放行等动作通过 `POST /api/maintenance/records/:recordId/signatures` 进入。
2. 若配置了指定签名人，后端会校验当前登录用户是否在对应名单中。
3. 驳回后使用 `POST /api/maintenance/records/:recordId/resubmit` 生成新 revision，而不是覆盖旧记录。

### 3.4 管理流
1. 人员管理页通过真实接口读取用户和角色目录。
2. 管理员可直接修改用户状态、部门和角色。
3. 签名模板页可维护默认指定签名人 JSON，作为后续工卡模板化配置入口。

## 4. 当前前端产品结构
- `/auth`: 独立认证页。
- `/workspace/approvals`: 审批工作台。
- `/workspace/submit`: 提交中心。
- `/workspace/records`: 查阅中心。
- `/workspace/users`: 人员管理。

## 5. 当前仍在推进的事项
- 把 `signerRole / action` 与正式 RBAC 权限矩阵进一步绑定。
- 把查阅中心从当前列表 + 详情抽屉，扩展到服务端分页、更多筛选和审批待办联动。
- 把签名模板与提交流程做更深整合，实现按机型/工卡模板自动带出默认签名人。