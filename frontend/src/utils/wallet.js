import { Wallet } from 'ethers';

export function normalizePrivateKey(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
}

export function createWalletFromPrivateKey(privateKey) {
  const normalizedPrivateKey = normalizePrivateKey(privateKey);
  if (!normalizedPrivateKey) {
    throw new Error('请输入私钥');
  }
  return new Wallet(normalizedPrivateKey);
}

export function createRandomWallet() {
  return Wallet.createRandom();
}