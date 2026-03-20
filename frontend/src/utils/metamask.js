import { ethers } from 'ethers';

/**
 * 连接 MetaMask 钱包，返回 provider / signer / address。
 * 若 MetaMask 未安装或用户拒绝连接则抛错。
 */
export async function connectMetaMask() {
  if (!window.ethereum) {
    throw new Error('未检测到 MetaMask 插件，请先安装 MetaMask 浏览器扩展');
  }

  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    return { provider, signer, address };
  } catch (error) {
    if (error.code === 4001 || error?.info?.error?.code === 4001) {
      throw new Error('用户取消了 MetaMask 连接请求');
    }
    throw error;
  }
}

/**
 * 使用 MetaMask 签署字符串消息（用于登录/注册挑战）。
 * @param {string}  message          要签署的消息文本
 * @param {string?} expectedAddress  可选，校验 MetaMask 当前地址是否匹配
 * @returns {{ signature: string, address: string }}
 */
export async function signMessageWithMetaMask(message, expectedAddress = null) {
  const { signer, address } = await connectMetaMask();

  if (expectedAddress && address.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error(
      `MetaMask 当前地址（${address}）与登录账户地址（${expectedAddress}）不一致，请在 MetaMask 中切换到正确的账户`,
    );
  }

  try {
    const signature = await signer.signMessage(message);
    return { signature, address };
  } catch (error) {
    if (error.code === 4001 || error?.info?.error?.code === 4001) {
      throw new Error('用户取消了 MetaMask 签名请求');
    }
    throw error;
  }
}

/**
 * 使用 MetaMask 签署 bytes32 摘要（用于提交/审签）。
 * 先将 hex 转为字节数组，再调用 EIP-191 signMessage。
 * @param {string}  digestHex        0x 前缀的 bytes32 十六进制字符串
 * @param {string?} expectedAddress  可选，校验 MetaMask 当前地址是否匹配
 * @returns {{ signature: string, address: string }}
 */
export async function signDigestWithMetaMask(digestHex, expectedAddress = null) {
  const { signer, address } = await connectMetaMask();

  if (expectedAddress && address.toLowerCase() !== expectedAddress.toLowerCase()) {
    throw new Error(
      `MetaMask 当前地址（${address}）与登录账户地址（${expectedAddress}）不一致，请在 MetaMask 中切换到正确的账户`,
    );
  }

  try {
    const signature = await signer.signMessage(ethers.getBytes(digestHex));
    return { signature, address };
  } catch (error) {
    if (error.code === 4001 || error?.info?.error?.code === 4001) {
      throw new Error('用户取消了 MetaMask 签名请求');
    }
    throw error;
  }
}
