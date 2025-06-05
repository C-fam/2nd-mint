/* ---------- Config ---------- */
const RPC_URL  = "https://testnet-rpc.monad.xyz";
const CHAIN_ID = 10143;
const SWAPMINT = "0xD4C86d1f711A8E080f55197e7B5E0b988D087eED";
const NFT_ADDR = "0x66fb1b5733A1A719e57022247A1CD9F4Ed73B1FB";   // ← 実 NFT コントラクト
const PHASE_JSON = [
  { price: "0.01", cap: 100,  dump: () => import('../proofs/wl_proofs.json' , { assert:{type:'json'}}) },
  { price: "0.10", cap:  40,  dump: () => import('../proofs/fcfs_proofs.json',{ assert:{type:'json'}}) },
  { price: "1.00", cap:  10,  dump: () => Promise.resolve(null) }              // Public: no proof
];

/* ---------- Imports ---------- */
import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { walletActions } from 'viem/actions';
import { injectedProvider } from 'viem/providers/injected';
import SwapMintAbi from './SwapMint.abi.json' assert { type:'json' };
import NftAbi      from './Nft.abi.json'      assert { type:'json' };
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';

/* ---------- Shortcuts ---------- */
const $ = id => document.getElementById(id);

/* ---------- viem clients ---------- */
const publicClient = createPublicClient({ chain:{id:CHAIN_ID}, transport:http(RPC_URL) });
let   walletClient;

/* ---------- Global UI state ---------- */
let currentPhase = 0, proofCache = null;

/* ---------- Wallet connect/disconnect ---------- */
$('connectBtn').onclick = async () => {
  walletClient = createWalletClient({
    chain:{ id:CHAIN_ID }, transport: injectedProvider()
  }).extend(walletActions);
  await walletClient.switchChain({ id:CHAIN_ID });
  const [addr] = await walletClient.getAddresses();

  $('walletStatus').textContent = `Connected: ${addr.slice(0,6)}…${addr.slice(-4)}`;
  $('connectBtn').style.display='none';
  $('disconnectBtn').style.display='inline-block';
  $('mintBtn').disabled=false;

  await refreshMinted();
  await updatePhaseUI();
};

$('disconnectBtn').onclick = () => location.reload();

/* ---------- Phase selector ---------- */
document.querySelectorAll('input[name="phase"]').forEach(r =>
  r.onchange = async () => {
    currentPhase = Number(r.value);
    await updatePhaseUI();
  });

/* ---------- Update UI for phase ---------- */
async function updatePhaseUI(){
  const phase = PHASE_JSON[currentPhase];
  $('priceMon'  ).textContent = phase.price;
  $('cap'       ).textContent = phase.cap;
  $('proofInfo' ).textContent = 'Proof: checking…';
  proofCache = [];                                               // reset

  if(currentPhase < 2){      // WL / FCFS
    try{
      const dump  = await phase.dump();
      const tree  = StandardMerkleTree.load(dump.default ?? dump);
      const [addr] = await walletClient.getAddresses();
      const idx   = tree.entries().findIndex(([,v])=>v[0].toLowerCase()===addr.toLowerCase());
      if(idx === -1) throw new Error('not in list');
      proofCache = tree.getProof(idx);
      $('proofInfo').textContent = 'Proof: ✅ found';
    }catch(e){
      $('proofInfo').textContent = 'Proof: ❌ not whitelisted';
      $('mintBtn').disabled = true; return;
    }
  }else{
    $('proofInfo').textContent = 'Proof: n/a (Public)';
  }
  $('mintBtn').disabled=false;
}

/* ---------- minted so far ---------- */
async function refreshMinted(){
  const total = await publicClient.readContract({ address:NFT_ADDR, abi:NftAbi, functionName:'totalSupply' });
  $('mintedCount').textContent = total.toString();
}

/* ---------- Mint ---------- */
$('mintBtn').onclick = async ()=>{
  $('mintBtn').disabled=true; $('mintBtn').textContent='Sending…';
  try{
    const bps = Number($('bpsIn').value);
    const price = parseEther(PHASE_JSON[currentPhase].price);

    const hash = await walletClient.writeContract({
      abi:SwapMintAbi,
      address:SWAPMINT,
      functionName:'buyAndMint',
      args:[ currentPhase, bps, price, proofCache ],
      value:price
    });
    $('mintBtn').textContent='Waiting…';
    await publicClient.waitForTransactionReceipt({ hash });
    alert(`✅ Tx success!\n${hash}`);
    await refreshMinted();
  }catch(e){ window.showFatal(e,'mint'); }
  finally{ $('mintBtn').textContent='Mint Now'; $('mintBtn').disabled=false; }
};
