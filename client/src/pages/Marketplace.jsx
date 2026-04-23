/**
 * Marketplace.jsx
 * Displays all listed NFTs. Users can buy any listing that isn't their own.
 */

import { useEffect } from "react";
import { useWeb3 } from "../context/Web3Context.jsx";
import NFTCard from "../components/NFTCard.jsx";

export default function Marketplace() {
  const {
    listedItems,
    isFetchingListed,
    account,
    txPending,
    txHash,
    txError,
    buy,
    refreshListedItems,
  } = useWeb3();

  useEffect(() => {
    refreshListedItems();
  }, []);

  const handleBuy = async (item) => {
    if (!account) { alert("Connect your wallet first."); return; }
    try {
      await buy(item.tokenId, item.price);
      alert(`NFT #${item.tokenId} purchased! Tx: ${txHash}`);
    } catch (err) {
      alert(`Purchase failed: ${err.message}`);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Marketplace</h1>
        <p>{listedItems.length} item{listedItems.length !== 1 ? "s" : ""} listed</p>
        <button className="btn-secondary" onClick={refreshListedItems}>↻ Refresh</button>
      </div>

      {txPending && (
        <div className="tx-status pending">⏳ Transaction pending…</div>
      )}
      {txHash && !txPending && (
        <div className="tx-status success">
          ✅ Success!{" "}
          <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer">
            View on Etherscan
          </a>
        </div>
      )}
      {txError && <div className="tx-status error">❌ {txError}</div>}

      {isFetchingListed ? (
        <div className="loading">Loading NFTs…</div>
      ) : listedItems.length === 0 ? (
        <div className="empty-state">No NFTs listed yet. Be the first to create one!</div>
      ) : (
        <div className="nft-grid">
          {listedItems.map((item) => (
            <NFTCard
              key={item.tokenId}
              item={item}
              showBuyButton={!account || account.toLowerCase() !== item.seller.toLowerCase()}
              onBuy={() => handleBuy(item)}
              txPending={txPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
