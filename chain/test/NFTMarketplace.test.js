const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NFTMarketplace", function () {
  let marketplace;
  let owner, seller, buyer, other;
  const LISTING_FEE = ethers.parseEther("0.0025");
  const NFT_PRICE   = ethers.parseEther("1");

  beforeEach(async () => {
    [owner, seller, buyer, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("NFTMarketplace");
    marketplace = await Factory.deploy();
    await marketplace.waitForDeployment();
  });

  // ── Minting ──────────────────────────────────────────────────────────────

  it("mints an NFT and assigns it to the caller", async () => {
    await marketplace.connect(seller).mintNFT("ipfs://test-uri");
    expect(await marketplace.ownerOf(1)).to.equal(seller.address);
    expect(await marketplace.tokenURI(1)).to.equal("ipfs://test-uri");
  });

  it("increments tokenId on each mint", async () => {
    await marketplace.connect(seller).mintNFT("ipfs://a");
    await marketplace.connect(seller).mintNFT("ipfs://b");
    expect(await marketplace.totalMinted()).to.equal(2n);
  });

  // ── Listing ──────────────────────────────────────────────────────────────

  it("lists an NFT and transfers custody to the contract", async () => {
    await marketplace.connect(seller).mintNFT("ipfs://test");
    await marketplace.connect(seller).approve(await marketplace.getAddress(), 1);
    await marketplace.connect(seller).listNFT(1, NFT_PRICE, { value: LISTING_FEE });

    const item = await marketplace.marketItems(1);
    expect(item.listed).to.be.true;
    expect(item.price).to.equal(NFT_PRICE);
    expect(await marketplace.ownerOf(1)).to.equal(await marketplace.getAddress());
  });

  it("reverts listing without the correct fee", async () => {
    await marketplace.connect(seller).mintNFT("ipfs://test");
    await marketplace.connect(seller).approve(await marketplace.getAddress(), 1);
    await expect(
      marketplace.connect(seller).listNFT(1, NFT_PRICE, { value: 0 })
    ).to.be.revertedWith("Wrong listing fee");
  });

  it("reverts listing by non-owner", async () => {
    await marketplace.connect(seller).mintNFT("ipfs://test");
    await expect(
      marketplace.connect(other).listNFT(1, NFT_PRICE, { value: LISTING_FEE })
    ).to.be.revertedWith("Not token owner");
  });

  // ── Buying ───────────────────────────────────────────────────────────────

  it("allows buyer to purchase and transfers NFT", async () => {
    await marketplace.connect(seller).mintNFT("ipfs://test");
    await marketplace.connect(seller).approve(await marketplace.getAddress(), 1);
    await marketplace.connect(seller).listNFT(1, NFT_PRICE, { value: LISTING_FEE });

    await marketplace.connect(buyer).buyNFT(1, { value: NFT_PRICE });

    expect(await marketplace.ownerOf(1)).to.equal(buyer.address);
    const item = await marketplace.marketItems(1);
    expect(item.listed).to.be.false;
    expect(await marketplace.totalSold()).to.equal(1n);
  });

  it("pays seller correctly (no royalty on primary sale)", async () => {
    await marketplace.connect(seller).mintNFT("ipfs://test");
    await marketplace.connect(seller).approve(await marketplace.getAddress(), 1);
    await marketplace.connect(seller).listNFT(1, NFT_PRICE, { value: LISTING_FEE });

    const before = await ethers.provider.getBalance(seller.address);
    await marketplace.connect(buyer).buyNFT(1, { value: NFT_PRICE });
    const after = await ethers.provider.getBalance(seller.address);

    // Seller receives full price (creator == seller so no royalty deducted)
    expect(after - before).to.equal(NFT_PRICE);
  });

  it("pays royalty to original creator on secondary sale", async () => {
    // Primary sale: seller mints and sells to buyer
    await marketplace.connect(seller).mintNFT("ipfs://test");
    await marketplace.connect(seller).approve(await marketplace.getAddress(), 1);
    await marketplace.connect(seller).listNFT(1, NFT_PRICE, { value: LISTING_FEE });
    await marketplace.connect(buyer).buyNFT(1, { value: NFT_PRICE });

    // Secondary sale: buyer relists and 'other' buys
    await marketplace.connect(buyer).approve(await marketplace.getAddress(), 1);
    await marketplace.connect(buyer).listNFT(1, NFT_PRICE, { value: LISTING_FEE });

    const royaltyBps = await marketplace.royaltyBps();
    const expectedRoyalty = (NFT_PRICE * royaltyBps) / 10000n;
    const sellerProceeds  = NFT_PRICE - expectedRoyalty;

    const sellerBefore  = await ethers.provider.getBalance(buyer.address);
    const creatorBefore = await ethers.provider.getBalance(seller.address);

    const tx = await marketplace.connect(other).buyNFT(1, { value: NFT_PRICE });
    await tx.wait();

    const sellerAfter  = await ethers.provider.getBalance(buyer.address);
    const creatorAfter = await ethers.provider.getBalance(seller.address);

    // buyer (secondary seller) gets price - royalty
    expect(sellerAfter - sellerBefore).to.equal(sellerProceeds);
    // seller (original creator) gets royalty
    expect(creatorAfter - creatorBefore).to.equal(expectedRoyalty);
  });

  it("reverts buying with wrong price", async () => {
    await marketplace.connect(seller).mintNFT("ipfs://test");
    await marketplace.connect(seller).approve(await marketplace.getAddress(), 1);
    await marketplace.connect(seller).listNFT(1, NFT_PRICE, { value: LISTING_FEE });

    await expect(
      marketplace.connect(buyer).buyNFT(1, { value: ethers.parseEther("0.5") })
    ).to.be.revertedWith("Wrong price");
  });

  // ── Cancel ───────────────────────────────────────────────────────────────

  it("returns NFT to seller on cancel", async () => {
    await marketplace.connect(seller).mintNFT("ipfs://test");
    await marketplace.connect(seller).approve(await marketplace.getAddress(), 1);
    await marketplace.connect(seller).listNFT(1, NFT_PRICE, { value: LISTING_FEE });

    await marketplace.connect(seller).cancelListing(1);

    expect(await marketplace.ownerOf(1)).to.equal(seller.address);
    expect((await marketplace.marketItems(1)).listed).to.be.false;
  });

  // ── Fetch Views ──────────────────────────────────────────────────────────

  it("fetchListedItems returns only listed tokens", async () => {
    await marketplace.connect(seller).mintNFT("ipfs://a");
    await marketplace.connect(seller).mintNFT("ipfs://b");
    await marketplace.connect(seller).approve(await marketplace.getAddress(), 1);
    await marketplace.connect(seller).listNFT(1, NFT_PRICE, { value: LISTING_FEE });

    const listed = await marketplace.fetchListedItems();
    expect(listed.length).to.equal(1);
    expect(listed[0].tokenId).to.equal(1n);
  });

  it("fetchMyNFTs returns tokens owned by user", async () => {
    await marketplace.connect(seller).mintNFT("ipfs://a");
    await marketplace.connect(seller).mintNFT("ipfs://b");

    const mine = await marketplace.fetchMyNFTs(seller.address);
    expect(mine.length).to.equal(2);
  });

  // ── Admin ─────────────────────────────────────────────────────────────────

  it("owner can update listing fee", async () => {
    await marketplace.connect(owner).setListingFee(ethers.parseEther("0.005"));
    expect(await marketplace.listingFee()).to.equal(ethers.parseEther("0.005"));
  });

  it("non-owner cannot update listing fee", async () => {
    await expect(
      marketplace.connect(other).setListingFee(ethers.parseEther("0.005"))
    ).to.be.reverted;
  });

  it("owner can withdraw accumulated fees", async () => {
    // Two listings → two listing fees collected
    await marketplace.connect(seller).mintNFT("ipfs://a");
    await marketplace.connect(seller).mintNFT("ipfs://b");
    await marketplace.connect(seller).approve(await marketplace.getAddress(), 1);
    await marketplace.connect(seller).approve(await marketplace.getAddress(), 2);
    await marketplace.connect(seller).listNFT(1, NFT_PRICE, { value: LISTING_FEE });
    await marketplace.connect(seller).listNFT(2, NFT_PRICE, { value: LISTING_FEE });

    const before = await ethers.provider.getBalance(owner.address);
    const tx = await marketplace.connect(owner).withdrawFees();
    const receipt = await tx.wait();
    const gas = receipt.gasUsed * receipt.gasPrice;
    const after = await ethers.provider.getBalance(owner.address);

    expect(after - before + gas).to.equal(LISTING_FEE * 2n);
  });
});
