pragma solidity 0.5.11;


import "./ERC20InterfaceV5.sol";


/// @title Kyber Network interface
interface KyberNetworkInterfaceV5 {
    function maxGasPrice() external view returns(uint);
    function getUserCapInWei(address user) external view returns(uint);
    function getUserCapInTokenWei(address user, ERC20 token) external view returns(uint);
    function enabled() external view returns(bool);
    function info(bytes32 id) external view returns(uint);

    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty) external view
        returns (uint expectedRate, uint slippageRate);

    function tradeWithHint(address payable trader, ERC20 src, uint srcAmount, ERC20 dest, address payable destAddress,
        uint maxDestAmount, uint minConversionRate, address walletId, bytes calldata hint) external payable returns(uint);
}
