/* -------------------------------------------------
 *  Config ― EDIT ME
 * ------------------------------------------------*/
const RPC_URL   = "https://testnet-rpc.monad.xyz";
const CHAIN_ID  = 10143; // 0x279F
const SWAP_MINT = "0xD4C86d1f711A8E080f55197e7B5E0b988D087eED";
const NFT_ADDR  = "0x66fb1b5733A1A719e57022247A1CD9F4Ed73B1FB";

const WL_PRICE   = "0.01";
const FCFS_PRICE = "0.1";
const PUB_PRICE  = "1";

/* WalletConnect Cloud で取得した projectId を設定 */
const WC_PROJECT_ID = "YOUR_WALLETCONNECT_CLOUD_PROJECT_ID";

/* -------------------------------------------------
 *  CDN imports (ESM)
 * ------------------------------------------------*/
import * as ethers from 'https://esm.sh/ethers@6.8.1?bundle';
import {
  createWalletClient,
  custom
} from 'https://esm.sh/viem@2.29.4?bundle';
import { StandardMerkleTree } from 'https://esm.sh/@openzeppelin/merkle-tree@1.0.8';

/* -------------------------------------------------
 *  DOM helpers
 * ------------------------------------------------*/
const $ = id => document.getElementById(id);

/* -------------------------------------------------
 *  Web3Modal v2 インスタンス
 * ------------------------------------------------*/
const web3Modal = new window.Web3Modal({
  projectId: WC_PROJECT_ID,
  walletProviders: [
    'walletConnect', 'metamask', 'rabby', 'phantom',
    'rainbow', 'trust', 'okx', 'safepal', 'coinbase'
  ],
  cacheProvider: false,
  themeMode: 'dark'
});

/* -------------------------------------------------
 *  Global state
 * ------------------------------------------------*/
let signer;
let walletClient;
const rpcProvider = new ethers.JsonRpcProvider(RPC_URL);

/* -------------------------------------------------
 *  初期化 – totalSupply 表示
 * ------------------------------------------------*/
(async () => {
  const nft = new ethers.Contract(
    NFT_ADDR,
    ["function totalSupply() view returns(uint256)"],
    rpcProvider
  );
  $("mintedSoFar").textContent = (await nft.totalSupply()).toString();
})().catch(console.error);

/* -------------------------------------------------
 *  Connect / Disconnect
 * ------------------------------------------------*/
$("connectWalletBtn").onclick = async () => {
  try{
    const ext = await web3Modal.connect();
    signer    = (new ethers.BrowserProvider(ext, "any")).getSigner();

    walletClient = createWalletClient({
      chain:   { id: CHAIN_ID },
      account: signer,
      transport: custom(ext)
    });

    const addr = await signer.getAddress();
    $("walletStatus").textContent =
      `Connected: ${addr.slice(0,6)}…${addr.slice(-4)}`;
    $("disconnectBtn").style.display = "inline-block";
    $("mintBtn").disabled = false;
  }catch(e){ window.showFatal(e,"connect"); }
};

$("disconnectBtn").onclick = () => location.reload();

/* -------------------------------------------------
 *  Proof helper
 * ------------------------------------------------*/
async function getProof(phaseId){
  const file =
    phaseId===0 ? "proofs/wl_proofs.json"  :
    phaseId===1 ? "proofs/fcfs_proofs.json": null;
  if(!file) return [];           // PUB

  const dump = await fetch(file).then(r=>r.json());
  const tree = StandardMerkleTree.load(dump);

  const addr = (await signer.getAddress()).toLowerCase();
  for(const [i,v] of tree.entries()){
    if(v[0].toLowerCase() === addr) return tree.getProof(i);
  }
  throw new Error("Address not in whitelist");
}

/* -------------------------------------------------
 *  Mint flow
 * ------------------------------------------------*/
$("mintBtn").onclick = async () => {
  $("mintBtn").disabled = true;
  $("mintBtn").textContent = "Sending…";
  try{
    const phaseId = 0;                              // ← UI で切替可能
    const mon     = phaseId===0 ? WL_PRICE :
                    phaseId===1 ? FCFS_PRICE : PUB_PRICE;

    const tokenCost = ethers.parseEther(mon);
    const proof     = await getProof(phaseId);

    const txHash = await walletClient.writeContract({
      address: SWAP_MINT,
      abi: ["function buyAndMint(uint8,uint16,uint256,bytes32[]) payable"],
      functionName: "buyAndMint",
      args: [ phaseId, 300, tokenCost, proof ],
      value: tokenCost
    });

    $("mintBtn").textContent = "Pending…";
    await walletClient.waitForTransactionReceipt({ hash: txHash });
    alert(`✅ Minted!\nTx ➜ https://testnet.monadexplorer.com/tx/${txHash}`);
    $("mintedSoFar").textContent =
      (+$("mintedSoFar").textContent + 1).toString();
  }catch(e){ window.showFatal(e,"mint"); }
  finally{
    $("mintBtn").disabled=false;
    $("mintBtn").textContent="Mint Now";
  }
};
