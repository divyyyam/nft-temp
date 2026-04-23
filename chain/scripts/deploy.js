const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  const NFTMarketplace = await ethers.getContractFactory("NFTMarketplace");
  const marketplace = await NFTMarketplace.deploy();
  await marketplace.waitForDeployment();

  const address = await marketplace.getAddress();
  console.log("NFTMarketplace deployed to:", address);

  // Write deployment info to a JSON file that the frontend can import.
  const deploymentInfo = {
    address,
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
  };

  const outDir = path.join(__dirname, "../../client/src/contracts");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(
    path.join(outDir, "deployment.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log("Deployment info written to client/src/contracts/deployment.json");

  // Copy ABI
  const artifact = require("../artifacts/contracts/NFTMarketplace.sol/NFTMarketplace.json");
  fs.writeFileSync(
    path.join(outDir, "NFTMarketplace.json"),
    JSON.stringify({ abi: artifact.abi }, null, 2)
  );
  console.log("ABI written to client/src/contracts/NFTMarketplace.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
