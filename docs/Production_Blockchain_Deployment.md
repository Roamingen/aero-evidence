# 云端联盟链部署指南 (Besu 26.x，单节点 QBFT，可稳定出块)

你当前的卡点不是网络不通，而是 `--network=dev` 在当前版本组合下出现“交易进 txpool 但不封块”。
为保证“最终可上线”，这里改为真正的联盟链共识：`QBFT`。

这份方案的目标是：
- 云服务器上稳定出块
- 你本地 `node test_besu.js` 可部署合约并拿到 receipt
- 后续可平滑扩展到 4 节点

## 1. 服务器准备
```bash
ssh root@你的服务器IP
mkdir -p /opt/besu-network/qbft
mkdir -p /opt/besu-network/data
cd /opt/besu-network
```

## 2. 生成 QBFT 网络配置
先说明一个关键点：`operator generate-blockchain-config` 要求 `--to` 输出目录不存在。
如果目录已存在，会报：`Output directory already exists.`。

建议把配置文件放在 `/opt/besu-network` 根目录，把输出目录单独给 `qbft`。

在服务器创建文件 `qbftConfigFile.json`：

```json
{
  "genesis": {
    "config": {
      "chainId": 1337,
      "berlinBlock": 0,
      "londonBlock": 0,
      "qbft": {
        "blockperiodseconds": 2,
        "epochlength": 30000,
        "requesttimeoutseconds": 10
      }
    },
    "nonce": "0x0",
    "timestamp": "0x0",
    "extraData": "0x",
    "gasLimit": "0x1fffffffffffff",
    "difficulty": "0x1",
    "mixHash": "0x63746963616c2062797a616e74696e65206661756c7420746f6c6572616e6365",
    "coinbase": "0x0000000000000000000000000000000000000000",
    "alloc": {
      "fe3b557e8fb62b89f4916b721be55ceb828dbd73": {
        "balance": "0xad78ebc5ac6200000"
      }
    },
    "number": "0x0",
    "gasUsed": "0x0",
    "parentHash": "0x0000000000000000000000000000000000000000000000000000000000000000"
  },
  "blockchain": {
    "nodes": {
      "generate": true,
      "count": 1
    }
  }
}
```

执行自动生成（先停容器，使用临时输出目录，避免目录冲突）：
```bash
# 如果之前有同名容器，先删掉，避免 restart=always 自动重建挂载目录
docker rm -f besu-production-rpc 2>/dev/null || true

# 清理旧目录
rm -rf /opt/besu-network/qbft /opt/besu-network/qbft-generated*

# 生成到唯一临时目录（彻底规避 already exists）
OUT_DIR=/opt/besu-network/qbft-generated-$(date +%s)
docker run --rm \
  -v /opt/besu-network:/opt/besu/network \
  hyperledger/besu:26.2.0 \
  operator generate-blockchain-config \
  --config-file=/opt/besu/network/qbftConfigFile.json \
  --to=${OUT_DIR} \
  --private-key-file-name=key

# 生成成功后再改名为 qbft
mv ${OUT_DIR} /opt/besu-network/qbft
```

如果终端偶发出现 `Output directory already exists`，但 `/opt/besu-network/qbft` 内已存在 `genesis.json` 和 `keys/`，可直接继续后续步骤。

确认生成结果：
```bash
ls -lah /opt/besu-network/qbft
ls -lah /opt/besu-network/qbft/keys
```

记录 validator 目录名（下一步要用）：
```bash
VALIDATOR_DIR=$(ls /opt/besu-network/qbft/keys | head -n 1)
echo $VALIDATOR_DIR
```

## 3. 写 docker-compose.yml
在 `/opt/besu-network/docker-compose.yml` 写入：

```yaml
services:
  rpc-node:
    image: hyperledger/besu:26.2.0
    container_name: besu-production-rpc
    restart: always
    ports:
      - "8545:8545"
    volumes:
      - ./qbft:/opt/besu/qbft
      - ./data:/opt/besu/data
    command:
      - --genesis-file=/opt/besu/qbft/genesis.json
      - --data-path=/opt/besu/data
      - --node-private-key-file=/opt/besu/qbft/keys/REPLACE_VALIDATOR_DIR/key
      - --rpc-http-enabled=true
      - --rpc-http-host=0.0.0.0
      - --rpc-http-port=8545
      - --rpc-http-api=ETH,NET,WEB3,TXPOOL,QBFT
      - --rpc-http-cors-origins=*
      - --host-allowlist=*
      - --min-gas-price=0
      - --sync-min-peers=0
```

将 `REPLACE_VALIDATOR_DIR` 替换为你上一步输出的目录名：
```bash
sed -i "s|REPLACE_VALIDATOR_DIR|${VALIDATOR_DIR}|g" /opt/besu-network/docker-compose.yml
```

## 4. 启动并验证
```bash
cd /opt/besu-network
docker-compose down
docker-compose up -d
```

查看日志：
```bash
docker logs --tail 120 besu-production-rpc
```

服务器内检查 RPC：
```bash
curl -X POST --data '{"jsonrpc":"2.0","method":"web3_clientVersion","params":[],"id":1}' http://127.0.0.1:8545
curl -X POST --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://127.0.0.1:8545
```

检查是否连续出块（连续执行两次，区块高度应增加）：
```bash
curl -X POST --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://127.0.0.1:8545
sleep 3
curl -X POST --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://127.0.0.1:8545
```

## 5. 云防火墙
在云控制台安全组放行 TCP `8545`，源 `0.0.0.0/0`（测试阶段）。

## 6. 本地联调
本地执行：
```bash
cd backend
node test_besu.js
```

如果脚本报“交易进入 txpool 但未出块”，说明节点状态异常，执行：
```bash
cd /opt/besu-network
docker-compose down
rm -rf ./data/*
docker-compose up -d
```

再次执行本地测试。

## 6.5 部署智能合约到 Besu 节点

> **重要**：这一步在 Besu 节点稳定出块之后、启动后端之前执行。

### 前置条件

- Besu 节点已启动并稳定出块（步骤 4 已验证）
- 本地项目中 `backend/.env` 已配置 Besu 连接信息

### 环境变量配置

确保 `backend/.env` 中包含以下变量：

```env
BESU_RPC_URL=http://你的服务器IP:8545
BESU_CHAIN_ID=1337
BESU_PRIVATE_KEY=0x8f2a55949038a9610f50fb23b5883af3b4ecb3c3bb792cbcefbd1542c692be63
```

> **注意**：部署脚本 `chain_helpers.js` 会优先读取 `BESU_*` 变量，也兼容 `CHAIN_*` 变量名。

### EVM 版本注意事项

⚠️ **关键**：如果 Besu genesis 只配置了 `londonBlock`/`berlinBlock` 而没有 `shanghaiTime`，合约必须使用 `paris` 或更低的 EVM 版本编译。

`shanghai` EVM 引入了 `PUSH0` 操作码（0x5F），London/Paris 节点不支持，会导致部署时报 `CALL_EXCEPTION`。

确认 `backend/hardhat-local/hardhat.config.ts` 中：
```typescript
evmVersion: 'paris',  // 不要用 'shanghai'，除非 Besu genesis 启用了 shanghaiTime
```

### 编译合约

```bash
cd backend
npm run chain:compile
# 输出：Compiled 1 Solidity file with solc 0.8.24 (evm target: paris)
```

### 部署合约

```bash
cd backend
npm run chain:deploy:v2
```

成功输出示例：
```json
{
  "contractName": "AviationMaintenanceV2",
  "address": "0xfeae27388A65eE984F452f86efFEd42AaBD438FD",
  "chainId": 1337,
  "rpcUrl": "http://43.167.254.129:8545",
  "deployer": "0xFE3B557E8Fb62b89F4916B721be55cEb828dBd73",
  "deployTxHash": "0x72fe3efcab...",
  "deployedAt": "2026-03-22T04:22:27.656Z"
}
```

部署信息会自动保存到 `backend/hardhat-local/deployments/local.json`，后端运行时会从这个文件读取合约地址。

### 验证合约

```bash
npm run chain:smoke:v2
```

Smoke test 会测试：提交记录、多阶段签名（技术员→审核员→放行）、状态转换。全部通过则合约部署正确。

### 常见部署失败原因

| 错误 | 原因 | 解决 |
|------|------|------|
| `CALL_EXCEPTION` during `estimateGas` | EVM 版本不兼容（shanghai vs london） | 改 hardhat.config.ts 为 `evmVersion: 'paris'`，重新编译 |
| `未找到合约产物` | 没有编译过 | 先执行 `npm run chain:compile` |
| 连接超时 | RPC 不通 | 检查防火墙 8545 端口、BESU_RPC_URL 配置 |
| `insufficient funds` | 部署账户无余额 | 检查 genesis alloc 是否包含部署地址 |

## 7. 后续扩展
这套 QBFT 配置天然可扩展到 4 节点，只需把 `nodes.count` 改为 4 并为每个 validator 启动一个 service（不同 data 路径和端口）。

## 8. 当前文档适用范围说明
当前这份文档已经适用于以下目标：

- 单台 Ubuntu 22.04 服务器部署一个可稳定出块的 Besu QBFT 节点
- 本地 Node.js 通过公网 RPC 部署合约、调用合约、拿到 receipt
- 作为后续扩展到多节点联盟链的基础主节点

当前这份文档还没有直接覆盖的内容：

- 第二台服务器加入网络的完整步骤
- 第二台服务器升级为 validator 的运维流程
- 4 节点正式生产拓扑的端口规划和证书化反向代理

下面补上“增加第二台服务器节点”的标准做法。

## 9. 增加第二台服务器节点
推荐分两步做：

1. 先把第二台服务器作为普通同步节点接入
2. 验证稳定后，再决定是否升级为 validator

这样风险最低，也最容易排错。

### 9.1 需要开放的端口
两台服务器都需要放行：

- TCP `30303`
- UDP `30303`
- TCP `8545`（如果你希望该节点也提供 RPC）

### 9.2 在主节点上确认对外 P2P 地址
当前主节点除了 RPC 端口，还要能让别的节点通过 P2P 找到它。建议把主节点 `docker-compose.yml` 的 `command` 增加两行：

```yaml
      - --p2p-host=主节点公网IP
      - --p2p-port=30303
```

同时在 `ports` 中增加：

```yaml
      - "30303:30303/tcp"
      - "30303:30303/udp"
```

改完后重启主节点：

```bash
cd /opt/besu-network
docker-compose down
docker-compose up -d
```

然后查看主节点 enode：

```bash
docker logs besu-production-rpc 2>&1 | grep -m1 "Enode URL"
```

输出结果里应该包含类似：

```text
enode://公钥@主节点IP:30303
```

### 9.3 在第二台服务器准备目录
在第二台 Ubuntu 服务器执行：

```bash
mkdir -p /opt/besu-node2/qbft
mkdir -p /opt/besu-node2/data
cd /opt/besu-node2
```

### 9.4 把 genesis.json 复制到第二台服务器
两台机器必须使用完全相同的 `genesis.json`。

在主节点执行：

```bash
scp /opt/besu-network/qbft/genesis.json root@第二台服务器IP:/opt/besu-node2/qbft/genesis.json
```

### 9.5 在第二台服务器创建普通节点配置
在第二台服务器写入 `docker-compose.yml`：

```yaml
services:
  node2:
    image: hyperledger/besu:26.2.0
    container_name: besu-node2
    restart: always
    ports:
      - "8545:8545"
      - "30303:30303/tcp"
      - "30303:30303/udp"
    volumes:
      - ./qbft:/opt/besu/qbft
      - ./data:/opt/besu/data
    command:
      - --genesis-file=/opt/besu/qbft/genesis.json
      - --data-path=/opt/besu/data
      - --rpc-http-enabled=true
      - --rpc-http-host=0.0.0.0
      - --rpc-http-port=8545
      - --rpc-http-api=ETH,NET,WEB3,TXPOOL,QBFT
      - --rpc-http-cors-origins=*
      - --host-allowlist=*
      - --bootnodes=enode://替换为主节点公钥@主节点公网IP:30303
      - --p2p-host=第二台服务器公网IP
      - --p2p-port=30303
      - --sync-min-peers=1
```

启动第二台节点：

```bash
cd /opt/besu-node2
docker-compose up -d
```

### 9.6 验证两台节点是否连通
在任一节点执行：

```bash
curl -X POST --data '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}' http://127.0.0.1:8545
```

如果返回不是 `0x0`，说明两台节点已通过 P2P 连通。

### 9.7 可选：把第二台服务器升级为 validator
如果只是为了高可用和同步，做到上一步已经够了。
如果你要把第二台机器变成真正参与共识的验证节点，需要再做 validator 投票。

先在第二台服务器导出地址：

```bash
docker exec besu-node2 besu public-key export-address --node-private-key-file=/opt/besu/data/key --to=/tmp/node2.addr
docker exec besu-node2 cat /tmp/node2.addr
```

然后在主节点执行投票：

```bash
curl -X POST --data '{"jsonrpc":"2.0","method":"qbft_proposeValidatorVote","params":["0x替换为第二台节点地址",true],"id":1}' http://127.0.0.1:8545
```

最后检查 validator 列表：

```bash
curl -X POST --data '{"jsonrpc":"2.0","method":"qbft_getValidatorsByBlockNumber","params":["latest"],"id":1}' http://127.0.0.1:8545
```

如果列表中出现第二台节点地址，说明扩容成功。

---

# 第二部分：后端应用部署 (Node.js + MySQL)

## 前置准备

### 10. 环境和依赖

在 Ubuntu 服务器安装必要工具：

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Node.js (推荐 18+)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 MySQL (8.0+)
sudo apt install -y mysql-server

# 验证
node -v      # v18.x
npm -v       # 9.x
mysql --version
```

### 11. MySQL 初始化

**重要**：Aero Evidence 系统的 MySQL 是**中心化的数据源**。在多节点场景下，所有 Besu 节点都会连接同一个 MySQL 实例（通过网络或 RDS）。

#### 本地单服务器部署（推荐用 RDS）

如果你用云服务商的 MySQL RDS：

```bash
# 创建数据库
mysql -h your-rds-endpoint.rds.amazonaws.com -u admin -p << 'EOF'
CREATE DATABASE aero_evidence CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
EOF
```

如果是本地 MySQL：

```bash
# 启动 MySQL
sudo systemctl start mysql
sudo systemctl enable mysql   # 开机自启

# 初始化数据库（在本节点或服务器本地执行）
mysql -u root -p << 'EOF'
CREATE DATABASE aero_evidence CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'aero'@'%' IDENTIFIED BY '你的安全密码';
GRANT ALL PRIVILEGES ON aero_evidence.* TO 'aero'@'%';
FLUSH PRIVILEGES;
EXIT;
EOF
```

#### 导入初始化脚本

从本地开发环境上传初始化脚本到服务器：

```bash
# 在本地项目目录执行
scp backend/sql/init_auth.sql root@你的服务器IP:/tmp/
scp backend/sql/init_maintenance_v2.sql root@你的服务器IP:/tmp/

# 在服务器上执行
ssh root@你的服务器IP
mysql -u aero -p aero_evidence < /tmp/init_auth.sql
mysql -u aero -p aero_evidence < /tmp/init_maintenance_v2.sql
```

### 12. 准备后端代码

在服务器上克隆或上传项目：

```bash
# 方案 A：从 Git 克隆（如果有权限）
git clone <你的项目仓库> /opt/aero-evidence
cd /opt/aero-evidence/backend

# 方案 B：从本地上传（开发阶段推荐）
scp -r backend/ root@你的服务器IP:/opt/aero-evidence/backend
ssh root@你的服务器IP
cd /opt/aero-evidence/backend
```

### 13. 配置后端环境变量

在 `/opt/aero-evidence/backend/.env` 中创建：

```bash
# 数据库配置（指向中心化 MySQL）
DB_HOST=mysql.company.com          # 或本地 127.0.0.1
DB_PORT=3306
DB_USER=aero
DB_PASSWORD=你的安全密码
DB_NAME=aero_evidence

# 区块链 RPC 配置
CHAIN_RPC_URL=http://127.0.0.1:8545  # 或其他节点的 RPC 地址

# 后端服务配置
PORT=3000
NODE_ENV=production
JWT_SECRET=你生成的长随机字符串（32位以上）

# 合约部署信息（从部署时保存）
CHAIN_CONTRACT_ADDRESS=0x...  # 从 deployment info 获取
CHAIN_DEPLOYER_ADDRESS=0x...

# 图片检测服务（如果有）
IMAGE_DETECTOR_URL=http://localhost:5000

# 日志配置
LOG_LEVEL=info
```

**安全提示**：使用 `chmod 600 .env` 保护文件权限。

### 14. 安装后端依赖并启动

```bash
cd /opt/aero-evidence/backend

# 安装依赖
npm install --omit=dev   # 生产环境只装生产依赖

# 验证合约部署信息存在
ls -lah ./deployments/

# 启动后端服务
npm start  # 或 node src/index.js

# 验证后端已启动
curl http://127.0.0.1:3000/api/health 2>/dev/null || echo "Backend not ready"
```

### 15. 后端进程管理（PM2）

强烈推荐用 PM2 管理后端进程，以便自动重启和日志管理：

```bash
# 安装 PM2（全局）
sudo npm install -g pm2

# 创建启动配置 /opt/aero-evidence/backend/ecosystem.config.js
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'aero-backend',
      script: 'src/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};
EOF

# 启动
pm2 start ecosystem.config.js

# 设置开机自启
pm2 startup
pm2 save

# 查看状态
pm2 status
pm2 logs aero-backend
```

---

# 第三部分：前端部署

## 16. 前端构建和部署

### 本地构建

```bash
cd frontend

# 安装依赖
npm install

# 生产构建（生成 dist/ 目录）
npm run build

# 验证构建产物
ls -lah dist/
```

### 部署前端到服务器

#### 方案 A：使用 Nginx 静态托管（推荐）

```bash
# 在服务器安装 Nginx
sudo apt install -y nginx

# 上传构建产物
scp -r frontend/dist root@你的服务器IP:/var/www/aero-evidence/

# 配置 Nginx
sudo tee /etc/nginx/sites-available/aero-evidence << 'EOF'
server {
    listen 80;
    server_name 你的域名或服务器IP;

    # 前端静态文件
    location / {
        root /var/www/aero-evidence;
        try_files $uri $uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, max-age=3600";
    }

    # API 代理（转发到后端）
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 日志
    access_log /var/log/nginx/aero-access.log;
    error_log /var/log/nginx/aero-error.log;
}
EOF

# 启用配置
sudo ln -s /etc/nginx/sites-available/aero-evidence /etc/nginx/sites-enabled/

# 移除默认配置
sudo rm /etc/nginx/sites-enabled/default

# 测试配置
sudo nginx -t

# 启动 Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

#### 方案 B：使用 Docker 部署前端

```bash
# 创建前端 Dockerfile
cat > frontend/Dockerfile << 'EOF'
FROM node:18-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]
EOF

# 构建镜像
docker build -t aero-frontend:latest frontend/

# 在 docker-compose.yml 中添加前端服务
```

### 17. 前端环境配置

创建 `frontend/.env.production`：

```bash
# 生产环境 API 地址
VITE_API_BASE_URL=http://你的域名/api
# 或直接用后端地址（如果前后端同机器）
VITE_API_BASE_URL=http://127.0.0.1:3000/api

# 区块链 RPC（如果前端直接调用）
VITE_CHAIN_RPC_URL=http://你的服务器IP:8545
```

确保构建时使用这个文件：

```bash
npm run build  # Vite 会自动读取 .env.production
```

---

# 第四部分：监控、日志和故障恢复

## 18. 系统监控检查清单

### 区块链状态监控

```bash
# 创建监控脚本 /opt/aero-evidence/scripts/monitor-besu.sh
#!/bin/bash
set -e

RPC_URL="http://127.0.0.1:8545"
ALERT_EMAIL="admin@company.com"

# 检查 RPC 连接
check_rpc() {
    local response=$(curl -s -X POST --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' $RPC_URL)
    if echo "$response" | grep -q "\"result\""; then
        return 0
    else
        echo "RPC 不可用" | mail -s "Besu Alert" $ALERT_EMAIL
        return 1
    fi
}

# 检查出块频率（应该约 2 秒）
check_block_rate() {
    local block1=$(curl -s -X POST --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' $RPC_URL | jq -r '.result')
    sleep 5
    local block2=$(curl -s -X POST --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' $RPC_URL | jq -r '.result')
    local blocks_in_5s=$((16#${block2:2} - 16#${block1:2}))

    if [ "$blocks_in_5s" -lt 2 ]; then
        echo "出块缓慢: 5秒只出 $blocks_in_5s 块" | mail -s "Besu Alert" $ALERT_EMAIL
    fi
}

# 检查节点 peer 连接
check_peers() {
    local peers=$(curl -s -X POST --data '{"jsonrpc":"2.0","method":"net_peerCount","params":[],"id":1}' $RPC_URL | jq -r '.result')
    if [ "$peers" = "0x0" ] && [ $EXPECTED_PEERS -gt 0 ]; then
        echo "节点未连接到 peer" | mail -s "Besu Alert" $ALERT_EMAIL
    fi
}

check_rpc && check_block_rate && check_peers
echo "Besu 监控检查完成 $(date)"
```

启用定时检查：

```bash
# 每 10 分钟检查一次
(crontab -l 2>/dev/null; echo "*/10 * * * * /opt/aero-evidence/scripts/monitor-besu.sh") | crontab -
```

### 数据库监控

```bash
# 检查数据库连接和数据量
mysql -h $DB_HOST -u $DB_USER -p$DB_PASSWORD -e << 'EOF'
SELECT
    TABLE_NAME,
    (SELECT SUM(TABLE_ROWS) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='aero_evidence') as total_records,
    (SELECT COUNT(*) FROM maintenance_records) as record_count,
    (SELECT COUNT(*) FROM maintenance_record_signatures) as signature_count
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA='aero_evidence'
LIMIT 5;
EOF
```

### 后端健康检查

```bash
# 检查后端 API 是否响应
curl -s http://127.0.0.1:3000/api/health | jq .

# 预期响应：{ "status": "ok", "timestamp": "..." }
```

## 19. 日志聚合和查看

### Besu 日志

```bash
# 实时查看 Besu 日志
docker logs -f besu-production-rpc

# 搜索特定错误
docker logs besu-production-rpc 2>&1 | grep -i error | tail -20

# 保存日志到文件（用于分析）
docker logs besu-production-rpc > /tmp/besu-full.log 2>&1
```

### 后端日志

```bash
# 如果用 PM2
pm2 logs aero-backend

# 查看错误日志
tail -f /opt/aero-evidence/backend/logs/error.log
```

### Nginx 日志

```bash
# 查看访问日志
tail -f /var/log/nginx/aero-access.log

# 查看错误日志
tail -f /var/log/nginx/aero-error.log
```

## 20. 常见故障恢复

### 问题：后端无法连接数据库

```bash
# 检查 MySQL 是否在线
mysql -h $DB_HOST -u $DB_USER -p$DB_PASSWORD -e "SELECT 1;"

# 检查后端的 .env 配置
cat /opt/aero-evidence/backend/.env | grep DB_

# 重启后端
pm2 restart aero-backend
```

### 问题：区块同步卡住

```bash
# 检查最新区块高度是否更新
curl -s -X POST --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://127.0.0.1:8545 | jq '.result'
sleep 10
# 再查一次，应该增加

# 如果卡住，重启节点
cd /opt/besu-network
docker-compose down
docker-compose up -d

# 如果仍然卡住，清除数据重新同步
docker-compose down
rm -rf ./data/*
docker-compose up -d
```

### 问题：磁盘空间不足

```bash
# 查看磁盘使用情况
df -h

# 查看 Besu 数据大小
du -sh /opt/besu-network/data

# 如果需要清理，先备份再删除旧块
docker-compose down
cp -r ./data ./data.backup
rm -rf ./data/*
docker-compose up -d
```

---

# 第五部分：安全加固

## 21. 防火墙配置

```bash
# 使用 UFW（Ubuntu 防火墙）
sudo ufw enable

# 只开放必要的端口
sudo ufw allow 22/tcp        # SSH
sudo ufw allow 80/tcp        # HTTP
sudo ufw allow 443/tcp       # HTTPS（后续配置）
sudo ufw allow 8545/tcp      # Besu RPC（可选限制来源）
sudo ufw allow 30303/tcp     # P2P（多节点时需要）
sudo ufw allow 30303/udp

# 查看规则
sudo ufw status
```

**云服务商配置**：如果用 AWS/阿里云等，在安全组中设置相同的规则。

## 22. SSL/TLS 配置（HTTPS）

使用 Let's Encrypt 自动化 SSL：

```bash
# 安装 Certbot
sudo apt install -y certbot python3-certbot-nginx

# 自动配置 SSL（需要域名指向这个服务器）
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# 验证证书
sudo certbot renew --dry-run
```

修改 Nginx 配置自动重定向 HTTP 到 HTTPS（Certbot 通常会自动做）：

```bash
# 验证配置
sudo nginx -t
sudo systemctl reload nginx
```

## 23. 敏感数据保护

```bash
# 保护环境变量文件
chmod 600 /opt/aero-evidence/backend/.env

# 不要把 .env 提交到 Git
cat > /opt/aero-evidence/backend/.gitignore << 'EOF'
.env
.env.local
.env.*.local
node_modules/
dist/
logs/
EOF
```

---

# 完整部署清单

使用这个清单确保所有步骤都完成：

- [ ] 1. Besu QBFT 节点启动并稳定出块
- [ ] 2. 智能合约编译（evmVersion: paris）并部署到 Besu
- [ ] 3. Smoke test 验证合约功能
- [ ] 4. MySQL 数据库创建和初始化
- [ ] 5. 后端环境变量配置正确（含 BESU_* 变量）
- [ ] 6. 后端 `npm install` 和 `npm start` 成功
- [ ] 7. 后端 PM2 进程管理配置
- [ ] 8. 前端构建 (`npm run build`)
- [ ] 9. Nginx 配置并启动
- [ ] 10. 防火墙规则配置
- [ ] 11. SSL 证书配置（生产环境）
- [ ] 12. 监控脚本部署和定时任务配置
- [ ] 13. 日志聚合和查看测试
- [ ] 14. 从本地浏览器访问 https://your-domain 测试

---

# 多节点部署补充说明

当你准备扩展到多个服务器时，关键是：

1. **MySQL 必须是共享的**（单个中心化实例或 RDS）
2. **每台服务器有自己的 Besu 节点**（连接到同一个 MySQL）
3. **Besu 节点通过 P2P 保持链同步**
4. **所有 API 请求通过各自的后端，但都读写同一个 MySQL**

示例多节点配置：

```
北京服务器：
  - Besu 节点 (RPC 8545)
  - Backend (3000)
  - Nginx (80/443)
  → DB_HOST=central-mysql.company.com

上海服务器：
  - Besu 节点 (RPC 8545)
  - Backend (3000)
  - Nginx (80/443)
  → DB_HOST=central-mysql.company.com

中央 MySQL RDS：
  - aero_evidence 数据库
  - 所有节点的数据源
```

---

**最后更新**: 2026-03-21
**版本**: 3.0（包含后端、前端、监控、安全）
