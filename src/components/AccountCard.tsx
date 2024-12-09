import { useState, useRef, useEffect } from "react";
import { IoMdMore } from "react-icons/io";

const AccountCard = ({
    name,
    address,
    balance,
    balanceUSD,
    isLast,
    setPrimaryAccount,
    removeAccount,
}: {
    name: string;
    address: string;
    balance: string;
    balanceUSD: string;
    isLast: boolean;
    setPrimaryAccount: (name: string) => void;
    removeAccount: (name: string) => void;
}) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLDivElement>(null);

    // Close the menu if clicked outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                menuRef.current && !menuRef.current.contains(event.target as Node) &&
                buttonRef.current && !buttonRef.current.contains(event.target as Node)
            ) {
                setIsMenuOpen(false);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    return (
        <>
            <div className="flex justify-between items-center w-full mt-6 relative">
                <div className="flex items-center gap-4">
                    <img
                        className="w-12 h-12 rounded-full object-cover"
                        src="profile-image.png"
                        alt={`${name} Profile`}
                    />
                    <div>
                        <div className="text-white text-xl font-semibold">{name}</div>
                        <div className="text-white/50 text-xs">{address}</div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end">
                        <div className="text-white text-xl font-medium">{balance}</div>
                        <div className="text-white/50 text-lg">{balanceUSD}</div>
                    </div>
                    <div
                        ref={buttonRef}
                        className="text-white text-3xl cursor-pointer"
                        onClick={() => setIsMenuOpen((prev) => !prev)}
                    >
                        <IoMdMore />
                    </div>
                </div>
                {isMenuOpen && (
                    <div
                        ref={menuRef}
                        className="p-3 top-8 z-10 bg-[#272727] rounded-[10px] border border-[#fdb913] absolute right-0 w-[210px] mt-2"
                    >
                        <p
                            className="text-white text-lg font-normal cursor-pointer hover:bg-white/10 p-2 rounded-md"
                            onClick={() => {
                                setPrimaryAccount(name);
                                setIsMenuOpen(false);
                            }}
                        >
                            Primary Account
                        </p>
                        <hr className="border-white/50 my-3" />
                        <p
                            className="text-white text-lg font-normal cursor-pointer hover:bg-white/10 p-2 rounded-md"
                            onClick={() => {
                                removeAccount(name);
                                setIsMenuOpen(false);
                            }}
                        >
                            Remove Account
                        </p>
                    </div>
                )}
            </div>
            {!isLast && <div className="h-[0px] border border-white/20 my-3" />}
        </>
    );
};

export default AccountCard;