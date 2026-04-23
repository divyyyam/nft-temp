/**
 * pinata.js
 * Uploads files and JSON metadata to IPFS via the Pinata API.
 * Set VITE_PINATA_API_KEY and VITE_PINATA_SECRET_API_KEY in your .env file.
 */

const PINATA_API_KEY    = import.meta.env.VITE_PINATA_API_KEY;
const PINATA_SECRET_KEY = import.meta.env.VITE_PINATA_SECRET_API_KEY;
const PINATA_BASE_URL   = "https://api.pinata.cloud";

// ── Helpers ──────────────────────────────────────────────────────────────────

function pinataHeaders(isJson = false) {
  const headers = {
    pinata_api_key: PINATA_API_KEY,
    pinata_secret_api_key: PINATA_SECRET_KEY,
  };
  if (isJson) headers["Content-Type"] = "application/json";
  return headers;
}

/**
 * Build a public IPFS gateway URL from a CID or ipfs:// URI.
 * Uses Pinata's dedicated gateway; falls back to dweb.link.
 */
export function ipfsToHttp(uriOrCid) {
  if (!uriOrCid) return "";
  const cid = uriOrCid.replace("ipfs://", "").replace("ipfs/", "");
  // Use Pinata public gateway (no auth needed for reads)
  return `https://gateway.pinata.cloud/ipfs/${cid}`;
}

// ── Upload a raw file (image, video, etc.) ───────────────────────────────────

/**
 * @param {File} file  - Browser File object
 * @param {string} name - Optional pin name shown in Pinata dashboard
 * @returns {Promise<string>} IPFS CID of the uploaded file
 */
export async function uploadFileToPinata(file, name = "nft-asset") {
  const formData = new FormData();
  formData.append("file", file);

  const pinataMetadata = JSON.stringify({ name });
  formData.append("pinataMetadata", pinataMetadata);

  const pinataOptions = JSON.stringify({ cidVersion: 1 });
  formData.append("pinataOptions", pinataOptions);

  const res = await fetch(`${PINATA_BASE_URL}/pinning/pinFileToIPFS`, {
    method: "POST",
    headers: pinataHeaders(false),
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Pinata file upload failed: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return data.IpfsHash; // CID
}

// ── Upload JSON metadata ──────────────────────────────────────────────────────

/**
 * Uploads an ERC-721 metadata JSON object to Pinata.
 * @param {object} metadata - ERC-721 metadata object
 * @param {string} name     - Pin name
 * @returns {Promise<string>} ipfs:// URI of the metadata
 */
export async function uploadMetadataToPinata(metadata, name = "nft-metadata") {
  const body = JSON.stringify({
    pinataContent: metadata,
    pinataMetadata: { name },
    pinataOptions: { cidVersion: 1 },
  });

  const res = await fetch(`${PINATA_BASE_URL}/pinning/pinJSONToIPFS`, {
    method: "POST",
    headers: pinataHeaders(true),
    body,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Pinata metadata upload failed: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return `ipfs://${data.IpfsHash}`;
}

// ── Full NFT upload flow ──────────────────────────────────────────────────────

/**
 * Complete flow:
 *  1. Upload the media file → get image CID
 *  2. Build ERC-721 metadata JSON with that image URI
 *  3. Upload metadata JSON → get metadata CID
 *  4. Return the metadata ipfs:// URI (used as tokenURI in contract)
 *
 * @param {File}   imageFile   - The NFT image/video/audio file
 * @param {object} nftDetails  - { name, description, attributes[] }
 * @returns {Promise<{ metadataUri: string, imageCid: string, metadataCid: string }>}
 */
export async function uploadNFTToIPFS(imageFile, nftDetails) {
  const { name, description, attributes = [] } = nftDetails;

  // 1. Upload image
  console.log("Uploading image to IPFS...");
  const imageCid = await uploadFileToPinata(imageFile, `${name}-image`);
  const imageUri = `ipfs://${imageCid}`;

  // 2. Build metadata (OpenSea-compatible ERC-721 metadata standard)
  const metadata = {
    name,
    description,
    image: imageUri,
    external_url: "",
    attributes: attributes.map(({ trait_type, value }) => ({ trait_type, value })),
  };

  // 3. Upload metadata
  console.log("Uploading metadata to IPFS...");
  const metadataUri = await uploadMetadataToPinata(metadata, `${name}-metadata`);
  const metadataCid = metadataUri.replace("ipfs://", "");

  console.log("IPFS upload complete:", { metadataUri, imageCid, metadataCid });
  return { metadataUri, imageCid, metadataCid };
}

// ── Test Pinata credentials ───────────────────────────────────────────────────

export async function testPinataConnection() {
  const res = await fetch(`${PINATA_BASE_URL}/data/testAuthentication`, {
    headers: pinataHeaders(false),
  });
  if (!res.ok) throw new Error("Pinata authentication failed");
  return res.json();
}
