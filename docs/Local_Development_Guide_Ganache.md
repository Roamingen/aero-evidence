# 本地开发与联调指南 (基于 Ganache 内存链)

为了让团队成员能够不受环境、网络、C++编译报错等影响，快速在本地跑通“后端 + 区块链”的数据交互逻辑，我们在**开发阶段**统一采用轻量级的本地模拟链节点（Ganache）。

> **⚠️ 注意**：此环境仅用于“开发阶段”光速打通业务逻辑。在项目最终答辩/上线前，我们只需更改代码中的一处 RPC 连接地址，即可一键切回部署在云服务器上的真实联盟链（如 Hyperledger Besu 或 FISCO BCOS），从而兼顾开发效率与高分架构。

## 1. 为什么使用此方案开发？
- **零配置，不报错**：不用装 Docker，不用装各种跨语言 SDK，原生 Node.js 支持。
- **环境隔离**：每个开发者在自己电脑上跑自己的私链，互不干扰，秒级出块。
- **完全免费无限制**：自带无限以太币（其实是免 Gas），不用担心发送交易失败。

## 2. 环境准备 (只需 Node.js)
确保你的电脑上安装了 Node.js (v16 或以上)。

在项目根目录下打开终端，安装全局的 Ganache 工具（如果报错权限问题可以尝试加 sudo 或是使用 npx）：
```bash
npm install -g ganache
```

## 3. 启动本地开发链
开启一个独立的终端窗口，输入以下命令并保持它在后台运行：
```bash
# 启动一个确定性（每次重启私钥都一样）的私有链，监听 18545 端口
ganache -d -p 18545
```
启动成功后，你会看到它分配了 10 个测试账号以及它们对应的私钥。默认第一个号就是我们的“上帝账号”。

## 4. 后端连接与测试
在你的 Node.js 后端代码 (如 `backend/test_besu.js`) 中，直接使用天下最通用的 `ethers.js` 库进行连接：

```javascript
const { ethers } = require('ethers');

// 1. 连接刚才启动的本地节点
const provider = new ethers.JsonRpcProvider("http://127.0.0.1:18545");

// 2. 填入 Ganache -d 模式下永远固定的第一个私钥
const privateKey = "0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d";
const wallet = new ethers.Wallet(privateKey, provider);

// 接下来就可以正常使用 ethers.Contract 进行合约部署和调用了...
```

## 5. 从本地链迁移到云端“真・联盟链”的方法 (终测前操作)
代码的业务逻辑（存证取证、验签、比对哈希）写完并测试通过后，如果要连接云服务器上的真实区块链服务，**只要把上面的 provider 网址换掉即可**：

```javascript
// 【开发环境】:
// const provider = new ethers.JsonRpcProvider("http://127.0.0.1:18545");

// 【生产/答辩环境】将这里换成真实云服务器的 IP 和端口，其余代码 1 行都不用改！
const provider = new ethers.JsonRpcProvider("http://你的云服务器IP:8545");
```