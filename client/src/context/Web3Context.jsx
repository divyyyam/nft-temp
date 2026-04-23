/**
 * Web3Context.jsx
 * Global context providing: wallet state, contract interactions, and NFT data.
 * Wrap <App /> with <Web3Provider> to access via useWeb3().
 */

import { createContext, useContext, useReducer, useEffect, useCallback, useRef } from "react";
import {
  isMetaMaskInstalled,
  connectWallet,
  getConnectedAccounts,
  getChainId,
  getBalance,
  registerWalletListeners,
  SUPPORTED_CHAIN_IDS,
} from "../utils/wallet.js";
import {
  fetchListedItems,
  fetchMyNFTs,
  fetchCreatedByMe,
  mintNFT as contractMintNFT,
  listNFT as contractListNFT,
  buyNFT as contractBuyNFT,
  cancelListing as contractCancelListing,
  getListingFee,
  fetchTokenMetadata,
  CONTRACT_ADDRESS,
  CHAIN_ID,
} from "../utils/marketplace.js";
import { uploadNFTToIPFS } from "../utils/pinata.js";
import { formatEther } from "ethers";

// ── State shape ───────────────────────────────────────────────────────────────

const initialState = {
  // Wallet
  account: null,
  chainId: null,
  balance: "0",
  isConnecting: false,
  walletError: null,
  isCorrectNetwork: false,

  // Marketplace data
  listedItems: [],
  myNFTs: [],
  createdByMe: [],
  listingFee: null,   // BigInt (wei)

  // Loading / tx states
  isFetchingListed: false,
  isFetchingMyNFTs: false,
  txPending: false,
  txHash: null,
  txError: null,
};

// ── Reducer ───────────────────────────────────────────────────────────────────

function reducer(state, action) {
  switch (action.type) {
    case "SET_WALLET":
      return {
        ...state,
        account: action.account,
        chainId: action.chainId,
        balance: action.balance,
        isCorrectNetwork: action.isCorrectNetwork,
        walletError: null,
        isConnecting: false,
      };
    case "SET_CONNECTING":    return { ...state, isConnecting: action.value };
    case "SET_WALLET_ERROR":  return { ...state, walletError: action.error, isConnecting: false };
    case "SET_CHAIN":         return { ...state, chainId: action.chainId, isCorrectNetwork: action.isCorrectNetwork };
    case "SET_ACCOUNT":       return { ...state, account: action.account, balance: action.balance };
    case "SET_BALANCE":       return { ...state, balance: action.balance };
    case "DISCONNECT":        return { ...state, account: null, balance: "0" };

    case "SET_LISTED_ITEMS":  return { ...state, listedItems: action.items, isFetchingListed: false };
    case "SET_MY_NFTS":       return { ...state, myNFTs: action.items, isFetchingMyNFTs: false };
    case "SET_CREATED":       return { ...state, createdByMe: action.items };
    case "SET_LISTING_FEE":   return { ...state, listingFee: action.fee };
    case "FETCHING_LISTED":   return { ...state, isFetchingListed: true };
    case "FETCHING_MY_NFTS":  return { ...state, isFetchingMyNFTs: true };

    case "TX_START":          return { ...state, txPending: true, txHash: null, txError: null };
    case "TX_SUCCESS":        return { ...state, txPending: false, txHash: action.hash };
    case "TX_ERROR":          return { ...state, txPending: false, txError: action.error };

    default: return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

const Web3Context = createContext(null);

export function Web3Provider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const cleanupRef = useRef(null);

  // ── Init: reconnect silently if already authorized ────────────────────────

  useEffect(() => {
    (async () => {
      if (!isMetaMaskInstalled()) return;
      const accounts = await getConnectedAccounts();
      if (accounts.length > 0) {
        await hydrateWallet(accounts[0]);
      }
    })();
  }, []);

  // ── Wallet listeners ──────────────────────────────────────────────────────

  useEffect(() => {
    cleanupRef.current = registerWalletListeners({
      onAccountsChanged: async (accounts) => {
        if (accounts.length === 0) {
          dispatch({ type: "DISCONNECT" });
        } else {
          await hydrateWallet(accounts[0]);
        }
      },
      onChainChanged: async (chainId) => {
        dispatch({
          type: "SET_CHAIN",
          chainId,
          isCorrectNetwork: chainId === CHAIN_ID,
        });
        // Reload NFT data on network switch
        await refreshListedItems();
      },
    });
    return () => cleanupRef.current?.();
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────

  async function hydrateWallet(account) {
    const [chainId, balance] = await Promise.all([
      getChainId(),
      getBalance(account),
    ]);
    dispatch({
      type: "SET_WALLET",
      account,
      chainId,
      balance,
      isCorrectNetwork: chainId === CHAIN_ID,
    });
    // Fetch listing fee once
    try {
      const fee = await getListingFee();
      dispatch({ type: "SET_LISTING_FEE", fee });
    } catch {}
    await refreshListedItems();
    await refreshMyNFTs(account);
  }

  // ── Public actions ────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    dispatch({ type: "SET_CONNECTING", value: true });
    try {
      const account = await connectWallet();
      await hydrateWallet(account);
    } catch (err) {
      dispatch({ type: "SET_WALLET_ERROR", error: err.message });
    }
  }, []);

  const refreshListedItems = useCallback(async () => {
    dispatch({ type: "FETCHING_LISTED" });
    try {
      const items = await fetchListedItems();
      // Enrich with metadata in the background
      const enriched = await Promise.all(
        items.map(async (item) => {
          try {
            const meta = await fetchTokenMetadata(item.tokenURI);
            return { ...item, meta };
          } catch {
            return { ...item, meta: null };
          }
        })
      );
      dispatch({ type: "SET_LISTED_ITEMS", items: enriched });
    } catch {
      dispatch({ type: "SET_LISTED_ITEMS", items: [] });
    }
  }, []);

  const refreshMyNFTs = useCallback(async (address) => {
    const addr = address || state.account;
    if (!addr) return;
    dispatch({ type: "FETCHING_MY_NFTS" });
    try {
      const [mine, created] = await Promise.all([
        fetchMyNFTs(addr),
        fetchCreatedByMe(addr),
      ]);
      const enrichMeta = async (items) =>
        Promise.all(
          items.map(async (item) => {
            try { return { ...item, meta: await fetchTokenMetadata(item.tokenURI) }; }
            catch { return { ...item, meta: null }; }
          })
        );
      dispatch({ type: "SET_MY_NFTS",  items: await enrichMeta(mine) });
      dispatch({ type: "SET_CREATED",  items: await enrichMeta(created) });
    } catch {
      dispatch({ type: "SET_MY_NFTS", items: [] });
    }
  }, [state.account]);

  /**
   * Full mint flow:
   *  1. Upload image + metadata to Pinata
   *  2. Call mintNFT on the contract
   */
  const mint = useCallback(async (imageFile, nftDetails) => {
    dispatch({ type: "TX_START" });
    try {
      const { metadataUri } = await uploadNFTToIPFS(imageFile, nftDetails);
      const { receipt, tokenId } = await contractMintNFT(metadataUri);
      dispatch({ type: "TX_SUCCESS", hash: receipt.hash });
      await refreshMyNFTs();
      return tokenId;
    } catch (err) {
      dispatch({ type: "TX_ERROR", error: err.message });
      throw err;
    }
  }, [refreshMyNFTs]);

  /**
   * List a token for sale.
   */
  const list = useCallback(async (tokenId, priceEth) => {
    dispatch({ type: "TX_START" });
    try {
      const { receipt } = await contractListNFT(tokenId, priceEth);
      dispatch({ type: "TX_SUCCESS", hash: receipt.hash });
      await Promise.all([refreshListedItems(), refreshMyNFTs()]);
    } catch (err) {
      dispatch({ type: "TX_ERROR", error: err.message });
      throw err;
    }
  }, [refreshListedItems, refreshMyNFTs]);

  /**
   * Buy a listed NFT.
   */
  const buy = useCallback(async (tokenId, priceWei) => {
    dispatch({ type: "TX_START" });
    try {
      const { receipt } = await contractBuyNFT(tokenId, priceWei);
      dispatch({ type: "TX_SUCCESS", hash: receipt.hash });
      await Promise.all([refreshListedItems(), refreshMyNFTs()]);
    } catch (err) {
      dispatch({ type: "TX_ERROR", error: err.message });
      throw err;
    }
  }, [refreshListedItems, refreshMyNFTs]);

  /**
   * Cancel a listing.
   */
  const cancel = useCallback(async (tokenId) => {
    dispatch({ type: "TX_START" });
    try {
      const { receipt } = await contractCancelListing(tokenId);
      dispatch({ type: "TX_SUCCESS", hash: receipt.hash });
      await Promise.all([refreshListedItems(), refreshMyNFTs()]);
    } catch (err) {
      dispatch({ type: "TX_ERROR", error: err.message });
      throw err;
    }
  }, [refreshListedItems, refreshMyNFTs]);

  // ── Expose ─────────────────────────────────────────────────────────────────

  const value = {
    ...state,
    // Derived
    listingFeeEth: state.listingFee ? formatEther(state.listingFee) : "0.0025",
    contractAddress: CONTRACT_ADDRESS,
    targetChainId: CHAIN_ID,
    supportedNetworks: SUPPORTED_CHAIN_IDS,
    // Actions
    connect,
    refreshListedItems,
    refreshMyNFTs,
    mint,
    list,
    buy,
    cancel,
  };

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
}

export function useWeb3() {
  const ctx = useContext(Web3Context);
  if (!ctx) throw new Error("useWeb3 must be used inside <Web3Provider>");
  return ctx;
}
