/* ---------- Config ---------- */
const RPC_URL    = "https://testnet-rpc.monad.xyz";
const CHAIN_ID   = 10143;                    // 0x279F
const SWAP_MINT  = "0xD4C86d1f711A8E080f55197e7B5E0b988D087eED";
const NFT        = "0x66fb1b5733A1A719e57022247A1CD9F4Ed73B1FB";
const WL_PRICE   = "0.01";                   // MON (18dec)
const FCFS_PRICE = "0.1";
const PUB_PRICE  = "1";

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const { ethers }   = window;                                 // ethers v6  ✔
const { createWalletClient, custom } = window.viem;          // viem CDN ✔ :contentReference[oaicite:4]{index=4}
const { StandardMerkleTree }        = window.viem;           // re-export from viem

/* ---------- wallet setup ---------- */
let signer, walletClient;
const web3Modal = new window.Web3Modal({                      // v2
  cacheProvider:false,
  walletConnectProjectId:"demo"                               // ← 独自プロジェクト ID 推奨
});

$("connectWalletBtn").onclick = async () => {
  const ext  = await web3Modal.connect();
  const prov = new ethers.BrowserProvider(ext, "any");        // v6 API
  signer       = await prov.getSigner();
  walletClient = createWalletClient({                         // viem walletClient (tx送信) :contentReference[oaicite:5]{index=5}
    chain:  { id: CHAIN_ID },
    account: signer,
    transport: custom(ext)
  });

  $("walletStatus").textContent = `Connected: ${await signer.getAddress()}`;
  $("disconnectBtn").style.display="inline-block";
  $("mintBtn").disabled=false;

  /* 表示用 – 現在の totalSupply */
  const nft = new ethers.Contract(NFT,["function totalSupply() view returns(uint256)"],prov);
  $("mintedSoFar").textContent = (await nft.totalSupply()).toString();
};

$("disconnectBtn").onclick = () => location.reload();

/* ---------- proof helper ---------- */
async function getProof(phaseId){
  const file = phaseId===0 ? "proofs/wl_proofs.json"
            : phaseId===1 ? "proofs/fcfs_proofs.json"
            : null;
  if(!file) return [];            // PUB

  const dump  = await fetch(file).then(r=>r.json());
  const tree  = StandardMerkleTree.load(dump);                // browser OK :contentReference[oaicite:6]{index=6}
  const addr  = (await signer.getAddress()).toLowerCase();

  for(const [i,v] of tree.entries()){
    if(v[0].toLowerCase()===addr) return tree.getProof(i);
  }
  throw new Error("Not in whitelist");
}

/* ---------- mint flow ---------- */
$("mintBtn").onclick = async () => {
  try{
    const phaseId = 0;                         // ← UI 選択式なら書き換え
    const mon     = phaseId===0 ? WL_PRICE : phaseId===1 ? FCFS_PRICE : PUB_PRICE;
    const tokenCost = ethers.parseEther(mon);
    const proof   = await getProof(phaseId);

    const txHash = await walletClient.writeContract({
      address: SWAP_MINT,
      abi:      [                                     // buyAndMint(…)
        "function buyAndMint(uint8,uint16,uint256,bytes32[]) payable"
      ],
      functionName: "buyAndMint",
      args: [phaseId, 300, tokenCost, proof],         // slippageBps=300
      value: tokenCost
    });
    $("mintBtn").disabled=true;$("mintBtn").textContent="Pending…";
    await walletClient.waitForTransactionReceipt({ hash: txHash });
    alert(`✅ Success!\nTx: https://testnet.monadexplorer.com/tx/${txHash}`);
  }catch(e){ window.showFatal(e,"mint"); }
  finally{ $("mintBtn").disabled=false;$("mintBtn").textContent="Mint Now"; }
};
