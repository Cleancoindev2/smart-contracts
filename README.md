## Instructions
1. Clone this repo
2. `npm ci`
3. `./compilation.sh`
4. Run `npx buidler test --no-compile ./test/knpV5.js"`

## Expected Output
Ignoring the other 49 failing tests (test script not fully translated for compatibility with web3 1.x),
```
  1) Contract: KyberNetworkProxy
       should test low 'max dest amount' on sell. make sure it reduces source amount.:
     Error: Transaction reverted for an unrecognized reason. Please report this to help us improve Buidler.
      at TestTokenV5.transfer (contractsV5/TestTokenV5.sol:54)
      at KyberNetworkV5.handleChange (contractsV5/KyberNetworkV5.sol:618)
      at KyberNetworkV5.trade (contractsV5/KyberNetworkV5.sol:501)
      at KyberNetworkV5.tradeWithHint (contractsV5/KyberNetworkV5.sol:118)
      at KyberNetworkProxyV5.tradeWithHint (contractsV5/KyberNetworkProxyV5.sol:171)
      at KyberNetworkProxyV5.trade (contractsV5/KyberNetworkProxyV5.sol:47)
      at TruffleContract.trade (node_modules/@nomiclabs/truffle-contract/lib/execute.js:157:24)
      at Context.<anonymous> (test/knpV5.js:895:41)
      at runMicrotasks (<anonymous>)
      at processTicksAndRejections (internal/process/task_queues.js:93:5)
```