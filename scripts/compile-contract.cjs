const solc = require("solc");
const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "contracts", "DefiBuddyNFT.sol"), "utf8");

const input = {
  language: "Solidity",
  sources: {
    "DefiBuddyNFT.sol": { content: source },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  const errors = output.errors.filter((e) => e.severity === "error");
  if (errors.length > 0) {
    console.error("Compilation errors:");
    errors.forEach((e) => console.error(e.formattedMessage));
    process.exit(1);
  }
}

const contract = output.contracts["DefiBuddyNFT.sol"]["DefiBuddyNFT"];
const abi = contract.abi;
const bytecode = "0x" + contract.evm.bytecode.object;

const outDir = path.join(__dirname, "..", "shared");
fs.writeFileSync(
  path.join(outDir, "nftContract.ts"),
  `export const NFT_CONTRACT_ABI = ${JSON.stringify(abi, null, 2)} as const;\n\nexport const NFT_CONTRACT_BYTECODE = "${bytecode}";\n`
);

console.log("Contract compiled successfully!");
console.log(`ABI has ${abi.length} entries`);
console.log(`Bytecode length: ${bytecode.length} chars`);
