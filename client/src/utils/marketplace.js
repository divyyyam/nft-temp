/**
 * marketplace.js
 * All ethers.js interactions with the NFTMarketplace contract.
 * Thin wrapper: each function returns the tx/data directly; UI layer handles toasts/errors.
 */

import { Contract, parseEther, formatEther } from "ethers";
import { getSigner, getProvider } from "./wallet.js";
import contractABI  from "../contracts/NFTMarketplace.json";
import deployment   from "../contracts/deployment.json";

// ── Contract factory ──────────────────────────────────────────────────────────

function getContract(signerOrProvider) {
  return new Contract(deployment.address, contractABI.abi, signerOrProvider);
}

/** Read-only contract (no MetaMask required for view calls). */
export async function readContract() {
  const provider = getProvider();
  return getContract(provider);
}

/** Write contract using the connected wallet's signer. */
export async function writeContract() {
  const signer = await getSigner();
  return getContract(signer);
}

// ── Getters ───────────────────────────────────────────────────────────────────

export async function getListingFee() {
  const c = await readContract();
  return c.listingFee(); // returns BigInt (wei)
}

export async function getRoyaltyBps() {
  const c = await readContract();
  return c.royaltyBps();
}

export async function getTotalMinted() {
  const c = await readContract();
  return c.totalMinted();
}

export async function getTotalSold() {
  const c = await readContract();
  return c.totalSold();
}

/** Single token info */
export async function getMarketItem(tokenId) {
  const c = await readContract();
  return c.marketItems(tokenId);
}

export async function getTokenURI(tokenId) {
  const c = await readContract();
  return c.tokenURI(tokenId);
}

export async function getOwnerOf(tokenId) {
  const c = await readContract();
  return c.ownerOf(tokenId);
}

// ── Fetch collection views ────────────────────────────────────────────────────

/**
 * Returns all currently listed market items with their tokenURIs resolved.
 * @returns {Promise<MarketItemWithMeta[]>}
 */
export async function fetchListedItems() {
  const c = await readContract();
  const raw = await c.fetchListedItems();
  return enrichItems(c, raw);
}

/**
 * Returns all NFTs owned (and not listed) by `address`.
 */
export async function fetchMyNFTs(address) {
  const c = await readContract();
  const raw = await c.fetchMyNFTs(address);
  return enrichItems(c, raw);
}

/**
 * Returns all NFTs ever created (minted) by `address`.
 */
export async function fetchCreatedByMe(address) {
  const c = await readContract();
  const raw = await c.fetchCreatedByMe(address);
  return enrichItems(c, raw);
}

/**
 * Enrich raw MarketItem structs with tokenURI and formatted price.
 */
async function enrichItems(contract, rawItems) {
  return Promise.all(
    rawItems.map(async (item) => {
      let tokenURI = "";
      try {
        tokenURI = await contract.tokenURI(item.tokenId);
      } catch {}

      return {
        tokenId:  Number(item.tokenId),
        seller:   item.seller,
        creator:  item.creator,
        price:    item.price,            // BigInt (wei)
        priceEth: formatEther(item.price),
        listed:   item.listed,
        tokenURI,
      };
    })
  );
}

// ── Mint ──────────────────────────────────────────────────────────────────────

/**
 * Mint a new NFT.
 * @param {string} tokenURI  ipfs:// URI of the metadata JSON
 * @returns {Promise<{ tx, receipt, tokenId: number }>}
 */
export async function mintNFT(tokenURI) {
  const c = await writeContract();
  const tx = await c.mintNFT(tokenURI);
  const receipt = await tx.wait();

  // Extract tokenId from NFTMinted event
  const event = receipt.logs
    .map((log) => { try { return c.interface.parseLog(log); } catch { return null; } })
    .find((e) => e?.name === "NFTMinted");

  const tokenId = event ? Number(event.args.tokenId) : null;
  return { tx, receipt, tokenId };
}

// ── List ──────────────────────────────────────────────────────────────────────

/**
 * Approve the contract to manage the token, then list it.
 * @param {number} tokenId
 * @param {string} priceEth  Sale price in ETH (e.g. "1.5")
 * @returns {Promise<{ approveTx, listTx, receipt }>}
 */
export async function listNFT(tokenId, priceEth) {
  const signer = await getSigner();
  const c      = getContract(signer);

  const listingFee = await c.listingFee();
  const priceWei   = parseEther(priceEth);

  // Step 1: approve contract to transfer this token
  const approveTx = await c.approve(deployment.address, tokenId);
  await approveTx.wait();

  // Step 2: list
  const listTx = await c.listNFT(tokenId, priceWei, { value: listingFee });
  const receipt = await listTx.wait();

  return { approveTx, listTx, receipt };
}

// ── Buy ───────────────────────────────────────────────────────────────────────

/**
 * Buy a listed NFT.
 * @param {number} tokenId
 * @param {BigInt} priceWei  Exact price in wei from marketItems mapping
 * @returns {Promise<{ tx, receipt }>}
 */
export async function buyNFT(tokenId, priceWei) {
  const c   = await writeContract();
  const tx  = await c.buyNFT(tokenId, { value: priceWei });
  const receipt = await tx.wait();
  return { tx, receipt };
}

// ── Cancel ────────────────────────────────────────────────────────────────────

/**
 * Cancel a live listing (seller only).
 * @param {number} tokenId
 * @returns {Promise<{ tx, receipt }>}
 */
export async function cancelListing(tokenId) {
  const c   = await writeContract();
  const tx  = await c.cancelListing(tokenId);
  const receipt = await tx.wait();
  return { tx, receipt };
}

// ── Admin (owner only) ────────────────────────────────────────────────────────

export async function setListingFee(newFeeEth) {
  const c = await writeContract();
  const tx = await c.setListingFee(parseEther(newFeeEth));
  return tx.wait();
}

export async function setRoyaltyBps(bps) {
  const c = await writeContract();
  const tx = await c.setRoyaltyBps(bps);
  return tx.wait();
}

export async function withdrawFees() {
  const c = await writeContract();
  const tx = await c.withdrawFees();
  return tx.wait();
}

// ── Event listeners ───────────────────────────────────────────────────────────

/**
 * Subscribe to NFTListed events.
 * @param {(tokenId, seller, price) => void} callback
 * @returns {() => void} Unsubscribe function
 */
export async function onNFTListed(callback) {
  const c = await readContract();
  c.on("NFTListed", (tokenId, seller, price) => callback(Number(tokenId), seller, price));
  return () => c.removeAllListeners("NFTListed");
}

export async function onNFTSold(callback) {
  const c = await readContract();
  c.on("NFTSold", (tokenId, seller, buyer, price) =>
    callback(Number(tokenId), seller, buyer, price)
  );
  return () => c.removeAllListeners("NFTSold");
}

export async function onNFTMinted(callback) {
  const c = await readContract();
  c.on("NFTMinted", (tokenId, creator, tokenURI) =>
    callback(Number(tokenId), creator, tokenURI)
  );
  return () => c.removeAllListeners("NFTMinted");
}

// ── Metadata fetch (IPFS → JSON) ──────────────────────────────────────────────

/**
 * Fetches and parses the ERC-721 metadata JSON for a token.
 * Converts ipfs:// URIs to HTTP gateway URLs automatically.
 * @param {string} tokenURI
 * @returns {Promise<object>} metadata JSON
 */
export async function fetchTokenMetadata(tokenURI) {
  if (!tokenURI) return null;
  const httpUrl = tokenURI.startsWith("ipfs://")
    ? `https://gateway.pinata.cloud/ipfs/${tokenURI.slice(7)}`
    : tokenURI;

  const res = await fetch(httpUrl);
  if (!res.ok) throw new Error(`Failed to fetch metadata: ${res.status}`);
  const meta = await res.json();

  // Resolve image URI
  if (meta.image?.startsWith("ipfs://")) {
    meta.imageHttp = `https://gateway.pinata.cloud/ipfs/${meta.image.slice(7)}`;
  } else {
    meta.imageHttp = meta.image;
  }

  return meta;
}

// ── Contract info export ──────────────────────────────────────────────────────

export const CONTRACT_ADDRESS = deployment.address;
export const CHAIN_ID         = deployment.chainId;
