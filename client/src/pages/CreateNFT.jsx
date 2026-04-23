/**
 * CreateNFT.jsx
 * Form to upload an image to Pinata IPFS and mint it as an NFT.
 * After minting, user can optionally list immediately.
 */

import { useState, useRef } from "react";
import { useWeb3 } from "../context/Web3Context.jsx";

const EMPTY_FORM = {
  name: "",
  description: "",
  priceEth: "",
  listImmediately: false,
  attributes: [],
};

export default function CreateNFT() {
  const { account, connect, mint, list, txPending, listingFeeEth } = useWeb3();

  const [form, setForm]           = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setPreview]= useState(null);
  const [status, setStatus]       = useState(""); // user-facing log
  const [mintedId, setMintedId]   = useState(null);
  const [error, setError]         = useState("");
  const [attrKey, setAttrKey]     = useState("");
  const [attrVal, setAttrVal]     = useState("");
  const fileRef = useRef();

  // ── Field helpers ───────────────────────────────────────────────────────────

  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const handleImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const addAttribute = () => {
    if (!attrKey || !attrVal) return;
    setForm((f) => ({ ...f, attributes: [...f.attributes, { trait_type: attrKey, value: attrVal }] }));
    setAttrKey(""); setAttrVal("");
  };

  const removeAttr = (i) =>
    setForm((f) => ({ ...f, attributes: f.attributes.filter((_, idx) => idx !== i) }));

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setMintedId(null);

    if (!account) { await connect(); return; }
    if (!imageFile) { setError("Please select an image file."); return; }
    if (!form.name.trim()) { setError("NFT name is required."); return; }
    if (form.listImmediately && !form.priceEth) { setError("Enter a price to list."); return; }

    try {
      setStatus("Uploading image to IPFS via Pinata…");
      const tokenId = await mint(imageFile, {
        name: form.name,
        description: form.description,
        attributes: form.attributes,
      });
      setStatus(`Minted NFT #${tokenId}! ✓`);
      setMintedId(tokenId);

      if (form.listImmediately && tokenId != null) {
        setStatus("Approving + listing NFT…");
        await list(tokenId, form.priceEth);
        setStatus(`NFT #${tokenId} minted and listed for ${form.priceEth} ETH! ✓`);
      }

      // Reset form
      setForm(EMPTY_FORM);
      setImageFile(null);
      setPreview(null);
    } catch (err) {
      setError(err.message || "Something went wrong.");
      setStatus("");
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <div className="page-header">
        <h1>Create NFT</h1>
        <p>Listing fee: <strong>{listingFeeEth} ETH</strong></p>
      </div>

      <div className="create-layout">
        {/* Preview */}
        <div className="image-upload-zone" onClick={() => fileRef.current.click()}>
          {imagePreview
            ? <img src={imagePreview} alt="preview" className="image-preview" />
            : <div className="upload-placeholder">
                <span>🖼</span>
                <p>Click to upload image</p>
                <small>PNG, JPG, GIF, MP4, WebP — max 50 MB</small>
              </div>
          }
          <input
            type="file"
            ref={fileRef}
            accept="image/*,video/mp4,video/webm"
            style={{ display: "none" }}
            onChange={handleImage}
          />
        </div>

        {/* Form */}
        <form className="create-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name *</label>
            <input value={form.name} onChange={set("name")} placeholder="My Awesome NFT" required />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={form.description}
              onChange={set("description")}
              placeholder="Tell the story of your NFT…"
              rows={3}
            />
          </div>

          {/* Attributes */}
          <div className="form-group">
            <label>Attributes (optional)</label>
            <div className="attr-row">
              <input placeholder="Trait type" value={attrKey} onChange={(e) => setAttrKey(e.target.value)} />
              <input placeholder="Value"      value={attrVal} onChange={(e) => setAttrVal(e.target.value)} />
              <button type="button" className="btn-small" onClick={addAttribute}>+</button>
            </div>
            {form.attributes.map((a, i) => (
              <div key={i} className="attr-badge">
                {a.trait_type}: {a.value}
                <button type="button" onClick={() => removeAttr(i)}>×</button>
              </div>
            ))}
          </div>

          {/* List immediately toggle */}
          <div className="form-group checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={form.listImmediately}
                onChange={set("listImmediately")}
              />
              List for sale immediately
            </label>
          </div>

          {form.listImmediately && (
            <div className="form-group">
              <label>Price (ETH) *</label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={form.priceEth}
                onChange={set("priceEth")}
                placeholder="e.g. 0.5"
              />
              <small>+{listingFeeEth} ETH listing fee</small>
            </div>
          )}

          {error  && <div className="form-error">{error}</div>}
          {status && <div className="form-status">{status}</div>}

          <button type="submit" className="btn-primary" disabled={txPending}>
            {txPending ? "Processing…" : account ? "Mint NFT" : "Connect Wallet to Mint"}
          </button>

          {mintedId != null && (
            <div className="success-banner">
              🎉 NFT #{mintedId} successfully minted!
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
