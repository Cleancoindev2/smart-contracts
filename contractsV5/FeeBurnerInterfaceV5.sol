pragma solidity 0.5.11;


interface FeeBurnerInterfaceV5 {
    function handleFees (uint tradeWeiAmount, address reserve, address wallet) external returns(bool);
    function setReserveData(address reserve, uint feesInBps, address kncWallet) external;
}
