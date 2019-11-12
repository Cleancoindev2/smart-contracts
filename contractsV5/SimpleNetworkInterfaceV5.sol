pragma solidity 0.5.11;


import "./ERC20InterfaceV5.sol";


/// @title simple interface for Kyber Network 
interface SimpleNetworkInterfaceV5 {
    function swapTokenToToken(ERC20 src, uint srcAmount, ERC20 dest, uint minConversionRate) external returns(uint);
    function swapEtherToToken(ERC20 token, uint minConversionRate) external payable returns(uint);
    function swapTokenToEther(ERC20 token, uint srcAmount, uint minConversionRate) external returns(uint);
}