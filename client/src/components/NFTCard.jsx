/**
 * NFTCard.jsx
 * Reusable card for displaying a single NFT with its metadata.
 */

import { useState, useEffect } from "react";
import { fetchTokenMetadata } from "../utils/marketplace.js";
import { shortenAddress } from "../utils/wallet.js";

export default function NFTCard({ item, showBuyButton = false, onBuy, txPending }) {
  const [meta, setMeta] = useState(item.meta || null);
  const [loading, setLoading] = useState(!item.meta && Boolean(item.tokenURI));

  useEffect(() => {
    if (item.meta) { setMeta(item.meta); setLoading(false); return; }
    if (!item.tokenURI) return;
    fetchTokenMetadata(item.tokenURI)
      .then(setMeta)
      .catch(() => setMeta(null))
      .finally(() => setLoading(false));
  }, [item.tokenURI, item.meta]);

  return (
    <div className={`nft-card ${item.listed ? "listed" : ""}`}>
      {/* Image */}
      <div className="nft-image-container">
        {loading ? (
          <div className="nft-image-placeholder">Loading…</div>
        ) : meta?.imageHttp ? (
          <img src={meta.imageHttp} alt={meta.name || `NFT #${item.tokenId}`} className="nft-image" />
        ) : (
          <div className="nft-image-placeholder">No Image</div>
        )}
        <span className="nft-id-badge">#{item.tokenId}</span>
      </div>

      {/* Info */}
      <div className="nft-info">
        <h3 className="nft-name">{meta?.name || `NFT #${item.tokenId}`}</h3>
        {meta?.description && <p className="nft-description">{meta.description}</p>}

        {/* Attributes */}
        {meta?.attributes?.length > 0 && (
          <div className="nft-attributes">
            {meta.attributes.map((a, i) => (
              <div key={i} className="attr-pill">
                <span className="attr-trait">{a.trait_type}</span>
                <span className="attr-value">{a.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Price */}
        {item.listed && (
          <div className="nft-price">
            <span className="price-label">Price</span>
            <span className="price-value">{item.priceEth} ETH</span>
          </div>
        )}

        {/* Addresses */}
        <div className="nft-meta-row">
          {item.seller && item.seller !== "0x0000000000000000000000000000000000000000" && (
            <span title={item.seller}>Seller: {shortenAddress(item.seller)}</span>
          )}
          {item.creator && (
            <span title={item.creator}>Creator: {shortenAddress(item.creator)}</span>
          )}
        </div>

        {/* IPFS link */}
        {item.tokenURI && (
          <a
            href={item.tokenURI.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/")}
            target="_blank"
            rel="noreferrer"
            className="ipfs-link"
          >
            View on IPFS ↗
          </a>
        )}

        {/* Buy button */}
        {showBuyButton && (
          <button
            className="btn-primary buy-btn"
            onClick={onBuy}
            disabled={txPending}
          >
            {txPending ? "Processing…" : `Buy for ${item.priceEth} ETH`}
          </button>
        )}
      </div>
    </div>
  );
}
