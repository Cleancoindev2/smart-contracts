pragma solidity 0.5.11;


import "./ERC20InterfaceV5.sol";


interface ExpectedRateInterfaceV5 {
    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty, bool usePermissionless) external view
        returns (uint expectedRate, uint slippageRate);
}