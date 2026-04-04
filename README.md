# 民航检修记录存证系统

<div align="center">

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Vue 3](https://img.shields.io/badge/Vue.js-3-blue?style=for-the-badge&logo=vue.js&logoColor=white)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-5-purple?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Express](https://img.shields.io/badge/Express-4-black?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![MySQL](https://img.shields.io/badge/MySQL-8-blue?style=for-the-badge&logo=mysql&logoColor=white)](https://mysql.com/)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-lightblue?style=for-the-badge&logo=ethereum&logoColor=white)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-3-yellow?style=for-the-badge&logo=ethereum&logoColor=white)](https://hardhat.org/)
[![Hyperledger Besu](https://img.shields.io/badge/Hyperledger-Besu-green?style=for-the-badge&logo=hyperledger&logoColor=white)](https://hyperledger.org/use/besu)
[![MetaMask](https://img.shields.io/badge/MetaMask-钱包签名-orange?style=for-the-badge&logo=ethereum&logoColor=white)](https://metamask.io/)

基于区块链技术的民航客机检修记录存证系统，采用"链下业务数据 + 链上关键摘要存证"架构，支持检修记录提交、多人签名审核、防篡改校验和权限化访问。

</div>

## 项目概览

<div align="center">

[![项目状态](https://img.shields.io/badge/状态-开发中-brightgreen?style=flat-square&logo=github)](https://github.com)
[![项目进度](https://img.shields.io/badge/进度-95%25-green?style=flat-square&logo=chart-line)](https://github.com)
[![最后更新](https://img.shields.io/badge/更新-2026--04--03-blue?style=flat-square&logo=clock)](https://github.com)

</div>

- **当前进度**: 95% 完成
- **项目阶段**: 核心功能全部完成，UI 打磨准备中
- **最新进展**:
  - ✅ 公开验证门户（无需登录，6项哈希逐一比对，签名链展示）
  - ✅ 篡改检测演示模块（管理员可模拟篡改/恢复，答辩现场演示）
  - ✅ 检修报告 PDF 导出（含验证二维码，手机扫码直达验证页）
  - ✅ MetaMask 钱包集成（登录/注册/签名全流程）
  - ✅ 远程访问支持（手机扫码验证）
- **技术栈**:
  - 前端: Vue 3 + Vite + Element Plus
  - 后端: Node.js + Express + ethers
  - 区块链: Hardhat (开发) / Hyperledger Besu QBFT (生产)
  - 数据库: MySQL
  - 智能合约: Solidity 0.8.24

## 系统架构

### 整体架构
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Vue 3 前端     │────│  Node.js 后端   │────│   MySQL 数据库   │
│  - 认证页面      │    │  - 认证模块     │    │  - 用户管理     │
│  - 业务后台      │    │  - 检修模块     │    │  - 检修记录     │
│  - 审批工作台    │    │  - 区块链服务   │    │  - 签名管理     │
│  - 公开验证门户  │    │  - 验证服务     │    └─────────────────┘
└─────────────────┘    └─────────┬───────┘
                                   │
                         ┌─────────▼───────┐
                         │   区块链网络     │
                         │  - Hardhat 本地  │
                         │  - Besu QBFT    │
                         │  - 存证合约     │
                         └─────────────────┘
```

### 核心特性

- ✅ **链下链上分离**: 完整业务数据存于 MySQL，关键摘要哈希上链存证
- ✅ **多人签名流程**: 支持技术会签、审核会签、RII批准、最终放行等多阶段签名
- ✅ **版本化管理**: 驳回后生成新 revision，不覆盖历史记录，保留完整审计链路
- ✅ **公开验证门户**: 任何人无需登录即可验证记录完整性，6项哈希逐一比对
- ✅ **防篡改演示**: 管理员可模拟篡改数据库字段，验证门户立即检测到不一致
- ✅ **PDF 报告导出**: 含验证二维码，扫码直达公开验证页面
- ✅ **MetaMask 钱包集成**: 登录、注册、提交签名、审批签名全部通过 MetaMask 弹窗完成，私钥永远不暴露给应用
- ✅ **权限控制**: RBAC 权限模型，支持角色、权限、用户映射管理
- ✅ **图片检测**: 集成 Python 图像检测服务，支持附件图片质量检测

## 快速开始

### 环境要求

- Node.js 18+
- MySQL 8.x
- **MetaMask 浏览器扩展**（用于钱包签名）
- Windows PowerShell 或 PowerShell 7

### 安装依赖

```bash
# 后端依赖
cd backend
npm install

# 前端依赖
cd ../frontend
npm install
```

### 环境配置

1. 复制后端环境配置模板：
```bash
cd backend
cp .env.example .env
```

2. 编辑 `.env` 文件，配置数据库连接和其他参数：
```env
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=aviation_maintenance
DB_USER=your_username
DB_PASSWORD=your_password
JWT_SECRET=your_jwt_secret

# 局域网访问时配置（用于 PDF 二维码地址）
FRONTEND_BASE_URL=http://your_local_ip:5173
```

### 数据库初始化

1. 创建数据库：
```sql
CREATE DATABASE aviation_maintenance CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. 导入初始化脚本：
```bash
# 认证相关表
mysql -h 127.0.0.1 -P 3306 -u root -p aviation_maintenance < backend/sql/init_auth.sql

# 检修业务表
mysql -h 127.0.0.1 -P 3306 -u root -p aviation_maintenance < backend/sql/init_maintenance_v2.sql
```

### 启动服务

#### 方式一：一键启动（推荐）

```bash
# Windows
startall.bat

# 或 PowerShell
.\startall.ps1
```

#### 方式二：手动启动

1. 启动本地区块链：
```bash
cd backend
npm run chain:node
```

2. 编译并部署合约：
```bash
cd backend
npm run chain:compile
npm run chain:deploy:v2
```

3. 启动后端服务：
```bash
cd backend
npm run dev
```

4. 启动前端服务：
```bash
cd frontend
npm run dev
```

### 访问系统

- 前端页面: http://127.0.0.1:5173
- 后端 API: http://127.0.0.1:3000
- 区块链 RPC: http://127.0.0.1:18545
- 公开验证门户: http://127.0.0.1:5173/verify

## 项目结构

```
project/
├── backend/                    # Node.js 后端
│   ├── hardhat-local/          # Hardhat 本地链子项目
│   │   ├── contracts/          # Solidity 合约
│   │   ├── deployments/        # 合约部署信息
│   │   └── hardhat.config.ts   # Hardhat 配置
│   ├── python-services/        # Python 微服务
│   │   └── image-detector/     # 图片检测服务
│   ├── src/
│   │   ├── controllers/        # 控制器层
│   │   ├── services/           # 业务服务层
│   │   ├── models/             # 数据访问层
│   │   ├── routes/             # 路由定义
│   │   ├── middlewares/        # 中间件
│   │   └── config/             # 配置文件
│   ├── scripts/                # 部署和测试脚本
│   ├── sql/                    # 数据库初始化脚本
│   └── storage/                # 文件存储目录
├── frontend/                   # Vue 3 前端
│   ├── src/
│   │   ├── pages/              # 页面组件
│   │   ├── router/             # 路由配置
│   │   ├── stores/             # 状态管理
│   │   └── utils/              # 工具函数
│   └── vite.config.js          # Vite 配置
├── docs/                       # 项目文档
├── startall.bat                # Windows 一键启动脚本
└── startall.ps1                # PowerShell 一键启动脚本
```

## 核心模块

### 认证模块
- 管理员预注册员工账号，生成激活码
- 激活码 + MetaMask 签名地址绑定
- Challenge-Response 登录机制（MetaMask 弹窗签名）
- JWT 令牌认证

### 检修记录模块
- 草稿保存、定稿、MetaMask 签名提交
- 多人多阶段签名流程（技术/审核/RII/放行）
- 驳回与 revision 重提，保留完整历史链路
- 记录查询、筛选、附件上传

### 区块链存证模块
- 6项摘要哈希上链（表单/故障/部件/测量/更换/附件清单）
- 签名证明链上存储（EIP-191，ecrecover 验证）
- AviationMaintenanceV2 智能合约

### 公开验证模块
- 无需登录的公开验证门户 `/verify`
- 6项哈希逐一比对（链上 vs 离链重算）
- 完整签名链展示（含地址绑定状态）
- 管理员篡改演示：模拟篡改 → 检测 → 恢复
- PDF 报告导出（含验证二维码）

### 权限管理模块
- RBAC 权限模型
- 角色与权限配置、单独权限覆盖
- 用户状态管理（激活/禁用/注销）

## 业务流程

### 用户注册流程

```mermaid
flowchart TD
    A[管理员预注册] --> B[员工获取激活码]
    B --> C[连接 MetaMask]
    C --> D[签名绑定地址]
    D --> E[激活完成]
    E --> F[MetaMask 签名登录]
```

### 检修记录流程

```mermaid
flowchart TD
    A[创建草稿] --> B[填写表单 / 上传附件]
    B --> C[定稿]
    C --> D[MetaMask 签名提交上链]
    D --> E[技术会签]
    E --> F{审核通过?}
    F -->|否| G[驳回]
    G --> A
    F -->|是| H[审核会签]
    H --> I{需要 RII?}
    I -->|是| J[RII 批准]
    I -->|否| K[最终放行]
    J --> K
    K --> L[记录已放行]
```

### 公开验证流程

```mermaid
flowchart TD
    A[输入 recordId 或扫描二维码] --> B[从链上读取 6 个哈希]
    B --> C[从数据库读取离链原始数据]
    C --> D[重新计算 6 个哈希]
    D --> E{逐项比对}
    E -->|全部一致| F[验证通过 ✅]
    E -->|存在不一致| G[检测到篡改 ❌]
    G --> H[精确定位被篡改的字段]
```

## 测试账号

系统启动时会自动创建以下测试账号，需将对应私钥导入 MetaMask 使用：

| 角色 | 工号 | 私钥（导入 MetaMask） | 权限 |
|------|------|------|------|
| 提交工程师 | E1001 | 0xac0974... | 提交检修记录 |
| 审批工程师 | E2001 | 0x59c699... | 审核签名 |
| 放行工程师 | E2002 | 0x5de411... | 最终放行 |
| 系统管理员 | A9001 | 0x7c8521... | 用户管理 |

> 在 MetaMask 中点击"导入账户" → 粘贴私钥即可使用对应测试账号。

## 开发指南

### 合约开发
- 合约位于 `backend/hardhat-local/contracts/`
- 使用 `npm run chain:compile` 编译合约
- 使用 `npm run chain:deploy:v2` 部署合约
- 部署信息保存在 `backend/hardhat-local/deployments/`

### 后端开发
- 控制器层: `backend/src/controllers/`
- 服务层: `backend/src/services/`
- 数据访问: `backend/src/models/`

### 前端开发
- 页面组件: `frontend/src/pages/`
- 路由配置: `frontend/src/router/`
- 状态管理: `frontend/src/stores/`
- MetaMask 工具: `frontend/src/utils/metamask.js`

## 部署说明

### 生产环境部署
- 区块链: Hyperledger Besu QBFT 集群
- 后端: Node.js + PM2
- 前端: Nginx 静态托管（`npm run build`）
- 数据库: MySQL

### 配置文件
- 后端配置: `backend/.env`（参考 `backend/.env.example`）
- 合约部署: `backend/hardhat-local/deployments/`

## 常见问题

### 后端启动失败
- 检查 `.env` 文件是否存在
- 确认 MySQL 服务是否启动
- 验证数据库连接参数是否正确
- 确认 Node.js 版本是否为 18+

### 前端接口调用失败
- 确认后端服务是否正常运行（端口 3000）
- 清除浏览器缓存重新登录

### 区块链相关错误
- 确认 Hardhat 本地链是否启动（端口 18545）
- 检查合约是否已正确部署
- 使用 `npm run chain:compile` 重新编译合约

### PDF 中文乱码（Linux 服务器）
- 安装中文字体：`apt-get install -y fonts-noto-cjk`
- 或手动下载单体 OTF 到 `/usr/share/fonts/`

### 手机扫码无法访问
- 确认手机与电脑在同一局域网
- 在 `.env` 中配置 `FRONTEND_BASE_URL=http://本机IP:5173`
- 前端 vite 已配置 `host: 0.0.0.0`，无需额外设置

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

---

**最后更新**: 2026年4月3日
**版本**: v2.1.0
**状态**: 开发中 (95% 完成)
