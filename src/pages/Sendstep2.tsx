import { useEffect, useState } from "react";
import Header from "../components/Header";
import Button from "../components/Button";
import { useNavigate } from "react-router-dom";
import { AiOutlineSwap } from "react-icons/ai";
import UserDropdown from "../components/UserDropdown";
import NetworkDropdown from "../components/NetworkDropdown";
import useWallet from "../hooks/useWallet";
import { formatWalletAddress } from "../utils";
import axios from "axios";
import Jazzicon from "react-jazzicon/dist/Jazzicon";
import {
  Address,
  Wart,
  NonceId,
  TransactionContext,
} from "warthog-ts";

/** Mainnet returns flat pin fields; DeFi nests under data.chainHead */
function normalizeChainPin(data: Record<string, unknown>): {
  pinHash: string;
  pinHeight: number;
} {
  const nested =
    data.chainHead && typeof data.chainHead === "object"
      ? (data.chainHead as Record<string, unknown>)
      : null;
  const pinHash = String(nested?.pinHash ?? data.pinHash ?? "");
  const pinHeight = Number(
    nested?.pinHeight ?? nested?.height ?? data.pinHeight ?? data.height,
  );
  if (!pinHash || pinHash.length < 64 || !Number.isFinite(pinHeight)) {
    throw new Error("Invalid chain head: missing pinHash/pinHeight");
  }
  return { pinHash, pinHeight };
}

function serializeTx(tx: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(tx, (_k, v) => (typeof v === "bigint" ? Number(v) : v)),
  );
}

interface AccountType {
  id: number;
  name: string;
  address: string;
  balance: number;
  balanceUSD: number;
  visible: boolean;
}

interface Network {
  id: string;
  name: string;
  logo: string;
}

const networks: Network[] = [
  { id: "1", name: "WART", logo: "logo.png" },
  { id: "2", name: "ETH", logo: "icons/eth_logo.svg" },
  { id: "3", name: "BNB", logo: "icons/bnb_logo.png" },
  { id: "4", name: "POL", logo: "icons/pol.png" },
];

function SendFinalStep() {
  const {
    password,
    selectedWalletIndex,
    selectedNodeIndex,
    nameList,
    walletList,
    nodeList,
    tmpDestinationWallet,
    visibleWalletList,
    setSelectedWalletIndex,
    setName,
    setWallet,
    getAccountFromIndex,
  } = useWallet();
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState<AccountType[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<Network | null>(
    networks[0],
  );
  const [isSwapped, setSwapped] = useState(false);
  const [amount, setAmount] = useState<number>(0);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<
    "idle" | "processing" | "success" | "error"
  >("idle");
  const [transactionHash, setTransactionHash] = useState<string>("");
  const [transactionError, setTransactionError] = useState<string>("");
  const [nonce, setNonce] = useState<number>(0);

  const selectUser = (id: number) => {
    setName(nameList[id]);
    setWallet(walletList[id]);
    setSelectedWalletIndex(id);
  };

  const handleSwap = () => {
    setSwapped((prev) => !prev); // Toggle the swap state
  };

  const handleTransaction = async () => {
    if (confirmPassword !== password) {
      setPasswordError("Incorrect password. Please try again.");
      return;
    }

    setIsProcessing(true);
    setTransactionStatus("processing");
    setTransactionError("");

    try {
      const nodeBase = String(nodeList[selectedNodeIndex] || "").replace(
        /\/$/,
        "",
      );
      if (!nodeBase) {
        throw new Error("No node selected. Open Select Node and add a live peer.");
      }

      const toRaw = (tmpDestinationWallet || "").trim().replace(/^0x/i, "");
      const recipient = Address.fromHex(toRaw) ?? Address.fromRaw(toRaw);
      if (!recipient) {
        throw new Error("Invalid recipient address");
      }

      const wartAmount = Wart.parse(String(amount));
      if (!wartAmount || amount <= 0) {
        throw new Error("Invalid amount");
      }

      // Default fee 0.01 WART, rounded to 16-bit encoding the node accepts
      const feeWart = Wart.parse("0.01");
      if (!feeWart) {
        throw new Error("Invalid fee");
      }
      const roundedFee = feeWart.roundedFee(true);

      // Chain pin — mainnet flat or DeFi nested chainHead
      const headResponse = (
        await axios.get(`${nodeBase}/chain/head`, { timeout: 15000 })
      ).data;
      if (headResponse?.code != null && headResponse.code !== 0) {
        throw new Error(headResponse.error || "Failed to fetch chain head");
      }
      const pin = normalizeChainPin(
        (headResponse?.data || headResponse) as Record<string, unknown>,
      );

      // Prefer on-chain account nonce when available; fall back to local counter
      const fromAccount = getAccountFromIndex(selectedWalletIndex);
      const fromAddr = fromAccount.address.hex;
      let chainNonce = 0;
      try {
        const balRes = (
          await axios.get(`${nodeBase}/account/${fromAddr}/balance`, {
            timeout: 15000,
          })
        ).data;
        const balData = balRes?.data || balRes;
        chainNonce = Number(balData?.nonceId) || 0;
      } catch {
        // ignore — some nodes omit nonce
      }
      const nonceId = Math.max(nonce + 1, chainNonce);
      setNonce(nonceId);

      const nonceObj = NonceId.fromNumber(nonceId);
      if (!nonceObj) {
        throw new Error("Invalid nonce");
      }

      const ctx = new TransactionContext(pin, roundedFee, nonceObj);
      const tx = ctx.transferWart(fromAccount, recipient, wartAmount);
      const payload = serializeTx(tx as Record<string, unknown>);

      const res = await axios.post(`${nodeBase}/transaction/add`, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 20000,
      });
      const data = res.data;
      if (data?.error || (data?.code != null && data.code !== 0)) {
        throw new Error(data.error || `Transaction error code: ${data.code}`);
      }

      setTransactionHash(data?.data?.txHash || "");
      setTransactionStatus("success");
    } catch (error) {
      setTransactionStatus("error");
      const ax = error as {
        response?: { data?: { error?: string; message?: string } };
        message?: string;
      };
      setTransactionError(
        ax.response?.data?.error ||
          ax.response?.data?.message ||
          (error instanceof Error ? error.message : "Transaction failed"),
      );
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (nameList.length !== walletList.length) {
      console.log(
        `**** unmatched error in nameList and walletList:`,
        nameList.length,
        walletList.length,
      );
    } else {
      setAccounts(
        nameList.map((name, index) => ({
          id: index,
          name,
          address: walletList[index],
          balance: 0,
          balanceUSD: 0,
          visible: visibleWalletList[index],
        })),
      );
    }
  }, [walletList, nameList, visibleWalletList]);

  return (
    <div className="min-h-screen container relative">
      <Header title="Send" />

      <div className="flex flex-col gap-1">
        <p className="text-white text-sm">From</p>
        <UserDropdown
          users={accounts}
          selectedUser={accounts[selectedWalletIndex]}
          onSelectUser={selectUser}
        />
        <NetworkDropdown
          networks={networks}
          selectedNetwork={selectedNetwork}
          onSelectNetwork={setSelectedNetwork}
          handleSwap={handleSwap}
          isSwapped={isSwapped}
          amount={amount}
          setAmount={setAmount}
        />

        <p className="text-white text-sm mt-3">To</p>
        <div className="flex items-center gap-3 p-4 rounded-lg border border-primary/25 backdrop-blur-md">
          {/* <img className="w-12 h-12 rounded-full" src="profile-image.png" alt="Profile" /> */}
          {<Jazzicon diameter={48} seed={1000} />}
          <div>
            <p className="text-white text-lg font-semibold">Receiver</p>
            <p className="text-white/50 text-xs">
              {formatWalletAddress(tmpDestinationWallet || "")}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 p-4 rounded-lg border border-primary/25 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <img
              className="w-12 h-12 rounded-full"
              src={selectedNetwork?.logo}
              alt="logo"
            />
            <div>
              <p className="text-white text-lg font-semibold">
                {selectedNetwork?.name}
              </p>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <div className="text-right">
              {isSwapped ? (
                <>
                  <p className="text-white text-lg">${amount}</p>
                  <p className="text-white/50 text-sm">
                    {amount} {selectedNetwork?.name}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-white text-lg">
                    {amount} {selectedNetwork?.name}
                  </p>
                  <p className="text-white/50 text-sm">${amount}</p>
                </>
              )}
            </div>
            <AiOutlineSwap
              className="text-white rotate-90 text-2xl"
              onClick={handleSwap}
            />
          </div>
        </div>
      </div>

      <div className="flex bottom-3 absolute left-0 px-3 w-full gap-3">
        <Button
          variant="outline"
          ariaLabel="Backup"
          className="w-full mt-5 hover:bg-primary/10"
          onClick={() => navigate("/home")}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          ariaLabel="Continue"
          className="w-full mt-5"
          onClick={() => setShowConfirmation(true)}
        >
          Continue
        </Button>
      </div>

      {/* Add Confirmation Popup */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[#1A1A1A] rounded-lg p-6 max-w-md w-full border border-primary/25">
            {transactionStatus === "idle" && (
              <>
                <h3 className="text-white text-xl font-semibold mb-4">
                  Confirm Transaction
                </h3>
                <div className="space-y-4 mb-6">
                  <div className="bg-[#2A2A2A] p-4 rounded-lg">
                    <p className="text-white/70 text-sm">Sending</p>
                    <p className="text-white text-lg font-semibold">
                      {amount} {selectedNetwork?.name}
                    </p>
                    <p className="text-white/50 text-sm">${amount}</p>
                  </div>

                  <div className="bg-[#2A2A2A] p-4 rounded-lg">
                    <p className="text-white/70 text-sm">To</p>
                    <p className="text-white text-lg font-semibold">Receiver</p>
                    <p className="text-white/50 text-sm">
                      {formatWalletAddress(tmpDestinationWallet || "")}
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="password"
                      className="block text-white/70 text-sm mb-2"
                    >
                      Enter your password to confirm
                    </label>
                    <input
                      type="password"
                      id="password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setPasswordError("");
                      }}
                      className="w-full bg-[#2A2A2A] border border-primary/25 rounded-lg p-3 text-white focus:outline-none focus:border-primary"
                      placeholder="Enter your password"
                    />
                    {passwordError && (
                      <p className="text-red-500 text-sm mt-2">
                        {passwordError}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setShowConfirmation(false);
                      setConfirmPassword("");
                      setPasswordError("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={handleTransaction}
                    disabled={isProcessing}
                  >
                    {isProcessing ? "Processing..." : "Confirm"}
                  </Button>
                </div>
              </>
            )}

            {transactionStatus === "processing" && (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
                <h3 className="text-white text-xl font-semibold mb-2">
                  Processing Transaction
                </h3>
                <p className="text-white/70">
                  Please wait while we process your transaction...
                </p>
              </div>
            )}

            {transactionStatus === "success" && (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h3 className="text-white text-xl font-semibold mb-2">
                  Transaction Successful!
                </h3>
                <p className="text-white/70 mb-4">
                  Your transaction has been processed successfully.
                </p>
                <p className="text-sm text-white/50 break-all mb-6">
                  Transaction Hash:{" "}
                  <a
                    href={`https://wartscan.io/tx/${transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {transactionHash}
                  </a>
                </p>
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => {
                    setShowConfirmation(false);
                    setTransactionStatus("idle");
                    navigate("/home");
                  }}
                >
                  Done
                </Button>
              </div>
            )}

            {transactionStatus === "error" && (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
                <h3 className="text-white text-xl font-semibold mb-2">
                  Transaction Failed
                </h3>
                <p className="text-red-500 mb-6">{transactionError}</p>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setShowConfirmation(false);
                      setTransactionStatus("idle");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => {
                      setTransactionStatus("idle");
                      setTransactionError("");
                    }}
                  >
                    Try Again
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SendFinalStep;
