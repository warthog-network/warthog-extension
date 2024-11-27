import { useState } from "react";
import Header from "../components/Header";

interface Props {
    wallet: string | null;
}

function IconButton({ iconSrc, label, onClick }: { iconSrc: string; label: string; onClick?: () => void }) {
    return (
        <div className="flex flex-col items-center gap-2 cursor-pointer" onClick={onClick}>
            <div className="flex justify-center items-center w-16 h-16 bg-[#f1f1f1] rounded-full">
                <img src={iconSrc} alt={label} />
            </div>
            <div className="text-sm text-white">{label}</div>
        </div>
    );
}

function ReceivePage({ wallet }: Props) {
    const [copyLabel, setCopyLabel] = useState("Copy");

    const handleCopyAddress = () => {
        if (wallet) {
            navigator.clipboard.writeText(wallet)
                .then(() => {
                    setCopyLabel("Copied!");
                    setTimeout(() => setCopyLabel("Copy"), 2000);
                })
                .catch((err) => {
                    console.log("Failed to copy wallet address: ", err);
                });
        } else {
            alert("No wallet connected to copy.");
        }
    };

    return (
        <div className="min-h-screen container mx-auto px-4">
            <Header title="Receive" />
            <div className="bg-gray-800 p-5 rounded-lg border border-primary/50 flex flex-col items-center gap-5 mt-5">
                <div className="flex flex-col items-center gap-6">
                    <img src="qrCode.png" alt="QR Code to receive payment" className="w-32 h-32" />
                    <div className="text-white text-sm font-light">{wallet}</div>
                </div>
            </div>
            <div className="mt-8 flex flex-col items-center gap-8">
                <div>
                    <p className="text-center text-white text-sm font-light">
                        Send only Warthog (Wart) to this address.
                    </p>
                    <p className="w-96 text-center text-white text-sm font-light">
                        Sending any other coins may result in permanent loss.
                    </p>
                </div>

                <div className="flex justify-center gap-12">
                    <IconButton iconSrc="icons/Icon-copy.svg" label={copyLabel} onClick={handleCopyAddress} />
                </div>
            </div>
        </div>
    );
}

export default ReceivePage;
