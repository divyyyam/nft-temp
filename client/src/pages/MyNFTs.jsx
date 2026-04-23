/**
 * MyNFTs.jsx
 * Shows the connected user's owned NFTs and created NFTs.
 * Users can list unlisted tokens and cancel active listings.
 */

import { useEffect, useState } from "react";
import { useWeb3 } from "../context/Web3Context.jsx";
import NFTCard from "../components/NFTCard.jsx";

export default function MyNFTs() {
  const {
    account, connect,
    myNFTs, createdByMe,
    isFetchingMyNFTs,
    txPending, txHash, txError,
    list, cancel,
    listingFeeEth,
    refreshMyNFTs,
  } = useWeb3();

  const [tab, setTab]         = useState("owned");   // "owned" | "created"
  const [listingId, setListingId] = useState(null);  // tokenId being listed
  const [price, setPrice]     = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (account) refreshMyNFTs();
  }, [account]);

  if (!account) {
    return (
      <div className="page">
        <div className="empty-state">
          <p>Connect your wallet to view your NFTs.</p>
          <button className="btn-primary" onClick={connect}>Connect Wallet</button>
        </div>
      </div>
    );
  }

  const handleList = async (tokenId) => {
    setLocalError("");
    if (!price || isNaN(price) || parseFloat(price) <= 0) {
      setLocalError("Enter a valid price.");
      return;
    }
    try {
      await list(tokenId, price);
      setListingId(null);
      setPrice("");
    } catch (err) {
      setLocalError(err.message);
    }
  };

  const handleCancel = async (tokenId) => {
    if (!confirm("Cancel this listing? The listing fee won't be refunded.")) return;
    try {
      await cancel(tokenId);
    } catch (err) {
      alert(err.message);
    }
  };

  const items = tab === "owned" ? myNFTs : createdByMe;

  return (
    <div className="page">
      <div className="page-header">
        <h1>My NFTs</h1>
        <div className="tab-bar">
          <button className={`tab ${tab === "owned"   ? "active" : ""}`} onClick={() => setTab("owned")}>
            Owned ({myNFTs.length})
          </button>
          <button className={`tab ${tab === "created" ? "active" : ""}`} onClick={() => setTab("created")}>
            Created ({createdByMe.length})
          </button>
        </div>
      </div>

      {txPending && <div className="tx-status pending">⏳ Transaction pending…</div>}
      {txHash && !txPending && (
        <div className="tx-status success">
          ✅ Done!{" "}
          <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer">
            Etherscan
          </a>
        </div>
      )}
      {txError && <div className="tx-status error">❌ {txError}</div>}

      {isFetchingMyNFTs ? (
        <div className="loading">Loading your NFTs…</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          {tab === "owned" ? "You don't own any NFTs yet." : "You haven't created any NFTs yet."}
        </div>
      ) : (
        <div className="nft-grid">
          {items.map((item) => (
            <div key={item.tokenId} className="nft-card-wrapper">
              <NFTCard item={item} showBuyButton={false} />

              <div className="nft-actions">
                {/* Not listed → offer to list */}
                {!item.listed && (
                  <>
                    {listingId === item.tokenId ? (
                      <div className="list-inline">
                        <input
                          type="number"
                          min="0.001"
                          step="0.001"
                          placeholder="Price in ETH"
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          className="price-input"
                        />
                        <button
                          className="btn-primary btn-small"
                          onClick={() => handleList(item.tokenId)}
                          disabled={txPending}
                        >
                          {txPending ? "…" : "Confirm"}
                        </button>
                        <button
                          className="btn-secondary btn-small"
                          onClick={() => { setListingId(null); setLocalError(""); }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn-secondary"
                        onClick={() => { setListingId(item.tokenId); setLocalError(""); }}
                      >
                        List for Sale
                      </button>
                    )}
                    {localError && listingId === item.tokenId && (
                      <p className="form-error">{localError}</p>
                    )}
                    <small className="fee-note">Listing fee: {listingFeeEth} ETH</small>
                  </>
                )}

                {/* Listed → offer to cancel */}
                {item.listed && (
                  <button
                    className="btn-danger"
                    onClick={() => handleCancel(item.tokenId)}
                    disabled={txPending}
                  >
                    Cancel Listing
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
