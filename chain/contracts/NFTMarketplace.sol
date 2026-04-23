// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title NFTMarketplace
 * @dev Combined ERC721 minting + marketplace (list, buy, cancel) in one contract.
 *      Listing fee goes to contract owner. Royalties paid to original creator on every sale.
 */
contract NFTMarketplace is ERC721URIStorage, Ownable, ReentrancyGuard {
    // ─── State ────────────────────────────────────────────────────────────────

    uint256 private _tokenIdCounter;
    uint256 private _itemsSold;

    /// Platform listing fee (in wei). Owner can update.
    uint256 public listingFee = 0.0025 ether;

    /// Royalty basis points paid to original creator on resale (250 = 2.5 %).
    uint256 public royaltyBps = 250;

    struct MarketItem {
        uint256 tokenId;
        address payable seller;
        address payable creator;   // original minter — receives royalties forever
        uint256 price;
        bool listed;
    }

    /// tokenId → MarketItem
    mapping(uint256 => MarketItem) public marketItems;

    // ─── Events ───────────────────────────────────────────────────────────────

    event NFTMinted(uint256 indexed tokenId, address indexed creator, string tokenURI);
    event NFTListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event NFTSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price);
    event ListingCancelled(uint256 indexed tokenId, address indexed seller);
    event ListingFeeUpdated(uint256 newFee);
    event RoyaltyBpsUpdated(uint256 newBps);

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() ERC721("NFT Marketplace", "NFTM") Ownable(msg.sender) {}

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setListingFee(uint256 _fee) external onlyOwner {
        listingFee = _fee;
        emit ListingFeeUpdated(_fee);
    }

    function setRoyaltyBps(uint256 _bps) external onlyOwner {
        require(_bps <= 1000, "Royalty too high"); // max 10 %
        royaltyBps = _bps;
        emit RoyaltyBpsUpdated(_bps);
    }

    /// Withdraw accumulated listing fees.
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 bal = address(this).balance;
        require(bal > 0, "Nothing to withdraw");
        (bool ok, ) = owner().call{value: bal}("");
        require(ok, "Transfer failed");
    }

  
    function mintNFT(string calldata tokenURI) external returns (uint256) {
        _tokenIdCounter++;
        uint256 tokenId = _tokenIdCounter;

        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, tokenURI);

        marketItems[tokenId] = MarketItem({
            tokenId: tokenId,
            seller: payable(address(0)),
            creator: payable(msg.sender),
            price: 0,
            listed: false
        });

        emit NFTMinted(tokenId, msg.sender, tokenURI);
        return tokenId;
    }

    // ─── List ─────────────────────────────────────────────────────────────────

    /**
     * @notice List an owned NFT for sale. Caller must approve this contract first
     *         (or use setApprovalForAll). Listing fee is sent with this call.
     * @param tokenId  Token to list.
     * @param price    Sale price in wei (must be > 0).
     */
    function listNFT(uint256 tokenId, uint256 price) external payable nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        require(price > 0, "Price must be > 0");
        require(msg.value == listingFee, "Wrong listing fee");
        require(!marketItems[tokenId].listed, "Already listed");

        // Transfer NFT custody to this contract while listed.
        transferFrom(msg.sender, address(this), tokenId);

        marketItems[tokenId].seller = payable(msg.sender);
        marketItems[tokenId].price = price;
        marketItems[tokenId].listed = true;

        emit NFTListed(tokenId, msg.sender, price);
    }

    // ─── Buy ──────────────────────────────────────────────────────────────────

    /**
     * @notice Buy a listed NFT. Send exactly the listed price in msg.value.
     *         Royalty is deducted and sent to creator; remainder goes to seller.
     * @param tokenId  Token to purchase.
     */
    function buyNFT(uint256 tokenId) external payable nonReentrant {
        MarketItem storage item = marketItems[tokenId];
        require(item.listed, "Not listed");
        require(msg.value == item.price, "Wrong price");
        require(msg.sender != item.seller, "Seller cannot buy own NFT");

        address payable seller = item.seller;
        address payable creator = item.creator;
        uint256 price = item.price;

        // Calculate royalty (skip if seller == creator, i.e. primary sale).
        uint256 royalty = 0;
        if (seller != creator) {
            royalty = (price * royaltyBps) / 10000;
        }
        uint256 sellerProceeds = price - royalty;

        // Update state before transfers (CEI pattern).
        item.listed = false;
        item.seller = payable(address(0));
        item.price = 0;
        _itemsSold++;

        // Transfer NFT to buyer.
        _transfer(address(this), msg.sender, tokenId);

        // Pay seller.
        (bool s1, ) = seller.call{value: sellerProceeds}("");
        require(s1, "Seller transfer failed");

        // Pay royalty to creator.
        if (royalty > 0) {
            (bool s2, ) = creator.call{value: royalty}("");
            require(s2, "Royalty transfer failed");
        }

        emit NFTSold(tokenId, seller, msg.sender, price);
    }

    // ─── Cancel ───────────────────────────────────────────────────────────────

    /**
     * @notice Cancel a live listing. NFT is returned to seller.
     *         Listing fee is NOT refunded (platform keeps it).
     * @param tokenId  Token to delist.
     */
    function cancelListing(uint256 tokenId) external nonReentrant {
        MarketItem storage item = marketItems[tokenId];
        require(item.listed, "Not listed");
        require(item.seller == msg.sender || owner() == msg.sender, "Not authorised");

        address payable seller = item.seller;

        item.listed = false;
        item.seller = payable(address(0));
        item.price = 0;

        _transfer(address(this), seller, tokenId);

        emit ListingCancelled(tokenId, seller);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /// Returns all currently listed items.
    function fetchListedItems() external view returns (MarketItem[] memory) {
        uint256 total = _tokenIdCounter;
        uint256 listedCount = 0;

        for (uint256 i = 1; i <= total; i++) {
            if (marketItems[i].listed) listedCount++;
        }

        MarketItem[] memory items = new MarketItem[](listedCount);
        uint256 idx = 0;
        for (uint256 i = 1; i <= total; i++) {
            if (marketItems[i].listed) {
                items[idx++] = marketItems[i];
            }
        }
        return items;
    }

    /// Returns all NFTs owned by a specific address (not listed).
    function fetchMyNFTs(address user) external view returns (MarketItem[] memory) {
        uint256 total = _tokenIdCounter;
        uint256 count = 0;

        for (uint256 i = 1; i <= total; i++) {
            // owned by user AND not held by contract (i.e. not listed)
            try this.ownerOf(i) returns (address o) {
                if (o == user) count++;
            } catch {}
        }

        MarketItem[] memory items = new MarketItem[](count);
        uint256 idx = 0;
        for (uint256 i = 1; i <= total; i++) {
            try this.ownerOf(i) returns (address o) {
                if (o == user) items[idx++] = marketItems[i];
            } catch {}
        }
        return items;
    }

    /// Returns all NFTs created (minted) by a specific address.
    function fetchCreatedByMe(address user) external view returns (MarketItem[] memory) {
        uint256 total = _tokenIdCounter;
        uint256 count = 0;

        for (uint256 i = 1; i <= total; i++) {
            if (marketItems[i].creator == user) count++;
        }

        MarketItem[] memory items = new MarketItem[](count);
        uint256 idx = 0;
        for (uint256 i = 1; i <= total; i++) {
            if (marketItems[i].creator == user) items[idx++] = marketItems[i];
        }
        return items;
    }

    function totalMinted() external view returns (uint256) { return _tokenIdCounter; }
    function totalSold()   external view returns (uint256) { return _itemsSold; }
}
