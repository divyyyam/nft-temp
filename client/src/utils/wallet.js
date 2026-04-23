/**
 * wallet.js
 * Manages MetaMask connection, account state, and network switching.
 * Uses ethers.js v6.
 */

import { BrowserProvider, formatEther, parseEther } from "ethers";

// ── Constants ─────────────────────────────────────────────────────────────────

export const SUPPORTED_CHAIN_IDS = {
  1:     "Ethereum Mainnet",
  11155111: "Sepolia Testnet",
  137:   "Polygon Mainnet",
  80001: "Mumbai Testnet",
  31337: "Localhost",
};

// ── Provider helpers ──────────────────────────────────────────────────────────

/** Returns true if MetaMask (or compatible wallet) is installed. */
export function isMetaMaskInstalled() {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

/** Get an ethers BrowserProvider from window.ethereum. */
export function getProvider() {
  if (!isMetaMaskInstalled()) throw new Error("MetaMask not installed");
  return new BrowserProvider(window.ethereum);
}

/** Get a Signer (requires connected account). */
export async function getSigner() {
  const provider = getProvider();
  return provider.getSigner();
}

// ── Connect ───────────────────────────────────────────────────────────────────

/**
 * Prompts MetaMask to connect and returns the first account address.
 * @returns {Promise<string>} Connected wallet address
 */
export async function connectWallet() {
  if (!isMetaMaskInstalled()) {
    throw new Error("MetaMask is not installed. Please install it from https://metamask.io");
  }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  if (!accounts || accounts.length === 0) throw new Error("No accounts found");
  return accounts[0];
}

/**
 * Returns already-connected accounts without prompting.
 * @returns {Promise<string[]>}
 */
export async function getConnectedAccounts() {
  if (!isMetaMaskInstalled()) return [];
  return window.ethereum.request({ method: "eth_accounts" });
}

// ── Network ───────────────────────────────────────────────────────────────────

/** Returns the current chain id as a number. */
export async function getChainId() {
  const provider = getProvider();
  const network = await provider.getNetwork();
  return Number(network.chainId);
}

/**
 * Asks MetaMask to switch to `chainId`. If the network is not added,
 * it will throw – callers should handle wallet_addEthereumChain for custom nets.
 * @param {number} chainId
 */
export async function switchNetwork(chainId) {
  await window.ethereum.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: "0x" + chainId.toString(16) }],
  });
}

/**
 * Add + switch to a custom EVM network in MetaMask.
 */
export async function addAndSwitchNetwork({ chainId, name, rpcUrl, currencySymbol, blockExplorerUrl }) {
  await window.ethereum.request({
    method: "wallet_addEthereumChain",
    params: [
      {
        chainId: "0x" + chainId.toString(16),
        chainName: name,
        rpcUrls: [rpcUrl],
        nativeCurrency: { name: currencySymbol, symbol: currencySymbol, decimals: 18 },
        blockExplorerUrls: blockExplorerUrl ? [blockExplorerUrl] : [],
      },
    ],
  });
}

// ── Balance ───────────────────────────────────────────────────────────────────

/** Returns ETH balance of `address` formatted as a string (e.g. "1.234"). */
export async function getBalance(address) {
  const provider = getProvider();
  const raw = await provider.getBalance(address);
  return parseFloat(formatEther(raw)).toFixed(4);
}

// ── Event Listeners ───────────────────────────────────────────────────────────

/**
 * Register MetaMask event listeners.
 * @param {{ onAccountsChanged?, onChainChanged?, onDisconnect? }} handlers
 * @returns {() => void} Cleanup function to remove listeners
 */
export function registerWalletListeners({ onAccountsChanged, onChainChanged, onDisconnect } = {}) {
  if (!isMetaMaskInstalled()) return () => {};

  const handleAccounts = (accounts) => {
    onAccountsChanged?.(accounts);
  };
  const handleChain = (chainId) => {
    onChainChanged?.(parseInt(chainId, 16));
  };
  const handleDisconnect = (error) => {
    onDisconnect?.(error);
  };

  if (onAccountsChanged) window.ethereum.on("accountsChanged", handleAccounts);
  if (onChainChanged)    window.ethereum.on("chainChanged", handleChain);
  if (onDisconnect)      window.ethereum.on("disconnect", handleDisconnect);

  return () => {
    if (onAccountsChanged) window.ethereum.removeListener("accountsChanged", handleAccounts);
    if (onChainChanged)    window.ethereum.removeListener("chainChanged", handleChain);
    if (onDisconnect)      window.ethereum.removeListener("disconnect", handleDisconnect);
  };
}

// ── Utils ─────────────────────────────────────────────────────────────────────

export function shortenAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export { formatEther, parseEther };
