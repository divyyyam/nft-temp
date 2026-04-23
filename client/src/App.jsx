/**
 * App.jsx
 * Root component. Sets up routing and wraps everything in Web3Provider.
 */

import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { Web3Provider, useWeb3 } from "./context/Web3Context.jsx";
import Marketplace  from "./pages/Marketplace.jsx";
import CreateNFT    from "./pages/CreateNFT.jsx";
import MyNFTs       from "./pages/MyNFTs.jsx";
import { shortenAddress } from "./utils/wallet.js";

function NavBar() {
  const { account, balance, isCorrectNetwork, connect, isConnecting, targetChainId, chainId } = useWeb3();

  return (
    <header className="navbar">
      <div className="navbar-brand">⬡ NFT Market</div>
      <nav className="navbar-links">
        <NavLink to="/"        className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>Marketplace</NavLink>
        <NavLink to="/create"  className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>Create</NavLink>
        <NavLink to="/my-nfts" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>My NFTs</NavLink>
      </nav>
      <div className="navbar-wallet">
        {!isCorrectNetwork && chainId && (
          <span className="network-warning">⚠ Wrong network (need chain {targetChainId})</span>
        )}
        {account ? (
          <div className="wallet-info">
            <span className="wallet-balance">{balance} ETH</span>
            <span className="wallet-address">{shortenAddress(account)}</span>
          </div>
        ) : (
          <button className="btn-connect" onClick={connect} disabled={isConnecting}>
            {isConnecting ? "Connecting…" : "Connect Wallet"}
          </button>
        )}
      </div>
    </header>
  );
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <NavBar />
      <main className="main-content">
        <Routes>
          <Route path="/"        element={<Marketplace />} />
          <Route path="/create"  element={<CreateNFT />} />
          <Route path="/my-nfts" element={<MyNFTs />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <Web3Provider>
      <AppRoutes />
    </Web3Provider>
  );
}
