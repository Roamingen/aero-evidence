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
