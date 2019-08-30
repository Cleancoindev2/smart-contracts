//let ConversionRates = artifacts.require("./ConversionRates.sol");
let MockEnhancedStepFunctions = artifacts.require("./mockContracts/MockEnhancedStepFunctions.sol");
let TestToken = artifacts.require("./mockContracts/TestToken.sol");
let Wrapper = artifacts.require("./mockContracts/Wrapper.sol");

let Helper = require("./helper.js");
let BigNumber = require('bignumber.js');

//global variables
let precisionUnits = (new BigNumber(10).pow(18));
let token;
let minimalRecordResolution = 2; //low resolution so I don't lose too much data. then easier to compare calculated imbalance values.
let maxPerBlockImbalance = 4000;
let maxTotalImbalance = maxPerBlockImbalance * 12;
let admin;
let alerter;
let currentBlock = 3000;
let lastSetCompactBlock = currentBlock;
let numTokens = 17;
let tokens = [];
let operator;
let reserveAddress;
let validRateDurationInBlocks = 1000;
let buys = [];
let sells = [];
let indices = [];
let baseBuy = [];
let baseSell = [];
let imbalanceBuyStepX = [];
let imbalanceBuyStepY = [];
let imbalanceSellStepX = [];
let imbalanceSellStepY = [];
let compactBuyArr1 = [];
let compactBuyArr2 = [];
let compactSellArr1 = [];
let compactSellArr2 = [];

let convRatesInst;

contract('EnhancedStepFunctions', function(accounts) {
    it("should init globals", function() {
        admin = accounts[0];
        alerter = accounts[1];
        operator = accounts[2];
        reserveAddress = accounts[3];
    })

    it("should init EnhancedStepFunctions Inst and set general parameters.", async function () {
        //init contracts
        convRatesInst = await MockEnhancedStepFunctions.new(admin);

        //set pricing general parameters
        convRatesInst.setValidRateDurationInBlocks(validRateDurationInBlocks);

        //create and add tokens. actually only addresses...
        for (let i = 0; i < numTokens; ++i) {
            token = await TestToken.new("test" + i, "tst" + i, 18);
            tokens[i] = token.address;
            await convRatesInst.addToken(token.address);
            await convRatesInst.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
            await convRatesInst.enableTokenTrade(token.address);
        }
        assert.deepEqual(tokens.length, numTokens, "bad number tokens");

        await convRatesInst.addOperator(operator);
        await convRatesInst.setReserveAddress(reserveAddress);
        await convRatesInst.addAlerter(alerter);
    });

    it("should set base rates for all tokens.", async function () {
        // set base rate

        //buy is ether to token rate. sale is token to ether rate. so sell == 1 / buy. assuming we have no spread.
        let ethToTokenRate;
        let tokenToEthRate;

        for (i = 0; i < numTokens; ++i) {
            ethToTokenRate = convertRateToPricingRate((i + 1) * 10);
            tokenToEthRate = convertRateToPricingRate(Number((1 / ((i + 1) * 10)).toFixed(13)));
            baseBuy.push(ethToTokenRate);
            baseSell.push(tokenToEthRate);
        }

        assert.deepEqual(baseBuy.length, tokens.length);
        assert.deepEqual(baseSell.length, tokens.length);

        buys.length = sells.length = indices.length = 0;

        await convRatesInst.setBaseRate(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices, {from: operator});

        //get base rate - validate data
        let thisSell;
        let thisBuy;
        for (i = 0; i < numTokens; ++i) {
            thisBuy = await convRatesInst.getBasicRate(tokens[i], true);
            thisSell = await convRatesInst.getBasicRate(tokens[i], false);
            assert.deepEqual(thisBuy.valueOf(), baseBuy[i].valueOf(), "wrong base buy rate.");
            assert.deepEqual(thisSell.valueOf(), baseSell[i].valueOf(), "wrong base sell rate.");
        }
    });

    it("should set compact data all tokens.", async function () {
        //set compact data
        compactBuyArr1 = [1, 2, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14];
        compactBuyArr2 = [15, 16, 17, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14];
        let compactBuyHex = Helper.bytesToHex(compactBuyArr1);
        buys.push(compactBuyHex);
        compactBuyHex = Helper.bytesToHex(compactBuyArr2);
        buys.push(compactBuyHex);

        compactSellArr1 = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34];
        compactSellArr2 = [35, 36, 37, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34];
        let compactSellHex = Helper.bytesToHex(compactSellArr1);
        sells.push(compactSellHex);
        compactSellHex = Helper.bytesToHex(compactSellArr2);
        sells.push(compactSellHex);

        indices[0] = 0;
        indices[1] = 1;

        assert.deepEqual(indices.length, sells.length, "bad array size");
        assert.deepEqual(indices.length, buys.length, "bad array size");

        await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        lastSetCompactBlock = currentBlock;

        //get compact data for all tokens and verify as expected
        for (i = 0; i < numTokens; ++i) {
            let arrIndex = Math.floor (i / 14);
            let fieldIndex = i % 14;
            let compactResArr = await convRatesInst.getCompactData(tokens[i]);
            let compactBuy;
            let compactSell;

            assert.equal(compactResArr[0].valueOf(), arrIndex.valueOf(), "wrong array " + i);
            assert.equal(compactResArr[1].valueOf(), fieldIndex.valueOf(), "wrong field index " + i);
            if (arrIndex == 0) {
                compactBuy = compactBuyArr1;
                compactSell = compactSellArr1;
            }
            else
            {
                compactBuy = compactBuyArr2;
                compactSell = compactSellArr2;
            }
            assert.equal(compactResArr[2].valueOf(), compactBuy[fieldIndex].valueOf(), "wrong buy: " + i);
            assert.equal(compactResArr[3].valueOf(), compactSell[fieldIndex].valueOf(), "wrong sell: " + i);
        }

        //get block number from compact data and verify
        let blockNum = await convRatesInst.getRateUpdateBlock(tokens[3]);

        assert.equal(blockNum.valueOf(), currentBlock.valueOf(), "bad block number returned");

        blockNum = await convRatesInst.getRateUpdateBlock(tokens[11]);

        assert.equal(blockNum.valueOf(), currentBlock.valueOf(), "bad block number returned");
    });

    it("should set step functions imbalance.", async function () {
        imbalanceBuyStepX = [180, 330, 900, 1500];
        imbalanceBuyStepY = [35, 150, 310, 1100, 1500];
        imbalanceSellStepX = [1500, 3000, 7000, 30000];
        imbalanceSellStepY = [45, 190, 360, 1800, 2000];
        
        for (let i = 0; i < numTokens; ++i) {
            await convRatesInst.setImbalanceStepFunction(tokens[i], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
        }
    });

    it("should test encode and decode function correct value", async function () {
        let x = -100;
        let y = 100;
        let val = await convRatesInst.mockEncodeStepData(x, y);
        let decode = await convRatesInst.mockDecodeStepData(val);
        assert.equal(decode[0].valueOf(), x, "decode x wrong value");
        assert.equal(decode[1].valueOf(), y, "decode y wrong value");
        y = 0;
        val = await convRatesInst.mockEncodeStepData(x, y);
        decode = await convRatesInst.mockDecodeStepData(val);
        assert.equal(decode[0].valueOf(), x, "decode x wrong value");
        assert.equal(decode[1].valueOf(), y, "decode y wrong value");
        x = 100;
        y = -100;
        val = await convRatesInst.mockEncodeStepData(x, y);
        decode = await convRatesInst.mockDecodeStepData(val);
        assert.equal(decode[0].valueOf(), x, "decode x wrong value");
        assert.equal(decode[1].valueOf(), y, "decode y wrong value");
        y = 0;
        val = await convRatesInst.mockEncodeStepData(x, y);
        decode = await convRatesInst.mockDecodeStepData(val);
        assert.equal(decode[0].valueOf(), x, "decode x wrong value");
        assert.equal(decode[1].valueOf(), y, "decode y wrong value");
        x = -10;
        y = -123;
        val = await convRatesInst.mockEncodeStepData(x, y);
        decode = await convRatesInst.mockDecodeStepData(val);
        assert.equal(decode[0].valueOf(), x, "decode x wrong value");
        assert.equal(decode[1].valueOf(), y, "decode y wrong value");
        x = 10;
        y = 123;
        val = await convRatesInst.mockEncodeStepData(x, y);
        decode = await convRatesInst.mockDecodeStepData(val);
        assert.equal(decode[0].valueOf(), x, "decode x wrong value");
        assert.equal(decode[1].valueOf(), y, "decode y wrong value");
    });

    it("check checkMultOverflow", async function () {
        const big = new BigNumber(2).pow(128);
        const small = new BigNumber(2).pow(100);
        const negativeBig = new BigNumber(2).pow(128).mul(-1);

        let overflow;
        overflow = await convRatesInst.mockCheckMultiOverflow(big, big);
        assert( overflow, "big * big should overflow");

        overflow = await convRatesInst.mockCheckMultiOverflow(big, negativeBig);
        assert( overflow, "big * negativeBig should overflow");

        overflow = await convRatesInst.mockCheckMultiOverflow(small, big);
        assert( !overflow, "big * small should not overflow");

        overflow = await convRatesInst.mockCheckMultiOverflow(small, negativeBig);
        assert( !overflow, "negativeBig * small should not overflow");

        overflow = await convRatesInst.mockCheckMultiOverflow(negativeBig, negativeBig);
        assert( overflow, "negativeBig * negativeBig should overflow");

        overflow = await convRatesInst.mockCheckMultiOverflow(0, big);
        assert( !overflow, "0 * big should not overflow");

        overflow = await convRatesInst.mockCheckMultiOverflow(big, 0);
        assert( !overflow, "big * 0 should not overflow");
    });

    it("should get buy rate with update according to compact data update.", async function () {
        let tokenInd = 7;
        let token = tokens[tokenInd]; //choose some token
        let baseBuyRate = await convRatesInst.getBasicRate(token, true);

        // get rate without activating quantity step function (small amount).
        let srcQty = 2;
        let expectedRate = (new BigNumber(baseBuyRate));
        let extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        let dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty.floor();
        extraBps = getExtraBpsForImbalanceBuyQuantity(0, dstQty * 1);
        expectedRate = addBps(expectedRate, extraBps);
        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.deepEqual(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
    });

    it("should get buy rate when compact data has boundary values (-128, 127).", async function () {
        let tokenInd = 7;
        let token = tokens[tokenInd]; //choose some token
        let baseBuyRate = await convRatesInst.getBasicRate(token, true);

        //update compact data
        indices.length = 0;
        indices[0] = 0; // we update 1st cell in compact data
        compactBuyArr1[tokenInd] = -128;
        let compactHex = Helper.bytesToHex(compactBuyArr1);
        buys.length = 0;
        buys.push(compactHex);
        sells.length = 0;
        compactHex = Helper.bytesToHex(compactSellArr1);
        sells.push(compactHex);
        convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        lastSetCompactBlock = currentBlock;

        // get rate with the updated compact data.
        let srcQty = 5;
        let expectedRate = (new BigNumber(baseBuyRate));
        let extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        let dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty.floor();
        extraBps = getExtraBpsForImbalanceBuyQuantity(0, dstQty);
        expectedRate = addBps(expectedRate, extraBps);

        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.deepEqual(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");

        //update compact data
        compactBuyArr1[tokenInd] = 127;
        compactHex = Helper.bytesToHex(compactBuyArr1);
        buys.length = 0;
        buys.push(compactHex);
        convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        lastSetCompactBlock = currentBlock;

        // get rate without activating quantity step function (small amount).
        srcQty = 11;
        expectedRate = (new BigNumber(baseBuyRate));
        extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty.floor();
        extraBps = getExtraBpsForImbalanceBuyQuantity(0, dstQty);
        expectedRate = addBps(expectedRate, extraBps);

        receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.deepEqual(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
    });


    it("should get buy rate when updating only 2nd cell compact data.", async function () {
        let tokenInd = 16;
        let token = tokens[tokenInd]; //choose some token
        let baseBuyRate = await convRatesInst.getBasicRate(token, true);

        //update compact data
        indices.length = 0;
        indices[0] = 1; // we update 2nd cell in compact data
        compactBuyArr2[tokenInd - 14] = -128;
        let compactHex = Helper.bytesToHex(compactBuyArr2);
        buys.length = 0;
        buys.push(compactHex);
        sells.length = 0;
        compactHex = Helper.bytesToHex(compactSellArr2);
        sells.push(compactHex);
        convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
        lastSetCompactBlock = currentBlock;

        // get rate without activating quantity step function (small amount).

        // calculate expected rate
        let srcQty = 21;
        let expectedRate = (new BigNumber(baseBuyRate));
        let extraBps = compactBuyArr2[tokenInd - 14] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        let dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty.floor();
        extraBps = getExtraBpsForImbalanceBuyQuantity(0, dstQty);
        expectedRate = addBps(expectedRate, extraBps);

        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.deepEqual(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
    });

    it("should get buy rate with compact data and quantity step.", async function () {
        let tokenInd = 11;
        let token = tokens[tokenInd]; //choose some token
        let baseBuyRate = await convRatesInst.getBasicRate(token, true);

        // calculate expected rate
        let srcQty = 17;
        let expectedRate = (new BigNumber(baseBuyRate));
        let extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        let dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty.floor();
        extraBps = getExtraBpsForImbalanceBuyQuantity(0, dstQty);
        expectedRate = addBps(expectedRate, extraBps);

        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.deepEqual(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
    });

    it("should get buy rate quantity step and compact data update with token index > 14.", async function () {
        let tokenInd = 15;
        let token = tokens[tokenInd]; //choose some token
        let baseBuyRate = await convRatesInst.getBasicRate(token, true);

        // get rate
        let srcQty = 24;
        let expectedRate = (new BigNumber(baseBuyRate));
        let extraBps = compactBuyArr2[tokenInd - 14] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        let dstQty = new BigNumber(srcQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty.floor();
        extraBps = getExtraBpsForImbalanceBuyQuantity(0, dstQty);
        expectedRate = addBps(expectedRate, extraBps);

        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);

        assert.deepEqual(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
    });

    it("should add imbalance. get buy rate with with compact data + quantity step + imbalance step.", async function () {
        let tokenInd = 8;
        let token = tokens[tokenInd]; //choose some token
        let baseBuyRate = await convRatesInst.getBasicRate(token, true);

        // get rate
        let buyQty = 15;
        let imbalance = 96;
        let expectedRate = (new BigNumber(baseBuyRate));
        let extraBps = compactBuyArr1[tokenInd] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        let dstQty = new BigNumber(buyQty).mul(expectedRate).div(precisionUnits);
        dstQty = dstQty.floor();
        //imbalance bps
        extraBps = getExtraBpsForImbalanceBuyQuantity(imbalance, dstQty * 1.0);
        expectedRate = addBps(expectedRate, extraBps);

        //record imbalance
        await convRatesInst.recordImbalance(token, imbalance, currentBlock, currentBlock, {from: reserveAddress});
        let receivedRate = await convRatesInst.getRate(token, currentBlock, true, buyQty);
        assert.deepEqual(expectedRate.valueOf(), receivedRate.valueOf(), "bad rate");
    });

    it("should add imbalance and get sell rate with with compact data + quantity step + imbalance step.", async function () {
        let tokenInd = 16;
        let token = tokens[tokenInd]; //choose some token
        let baseSellRate = await convRatesInst.getBasicRate(token, false);

        // get rate
        let sellQty = 500;
        let imbalance = 1800;
        let expectedRate = (new BigNumber(baseSellRate));
        //calc compact data
        let extraBps = compactSellArr2[tokenInd - 14] * 10;
        expectedRate = addBps(expectedRate, extraBps);
        //calc imbalance steps
        extraBps = getExtraBpsForImbalanceSellQuantity(imbalance, sellQty);
        expectedRate = addBps(expectedRate, extraBps);

        //record imbalance
        await convRatesInst.recordImbalance(token, imbalance, currentBlock, currentBlock, {from: reserveAddress});

        let receivedRate = await convRatesInst.getRate(token, currentBlock, false, sellQty);

        //round rates a bit
        compareRates(receivedRate, expectedRate);
    });

    it("should verify set imbalance step reverted when input arrays lengths don't match.", async function () {
        //imbalance buy step x - change size. see set fails
        imbalanceBuyStepX.push(17);

        try {
            await convRatesInst.setImbalanceStepFunction(tokens[4], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //set size back and see set success
        imbalanceBuyStepX.length = imbalanceBuyStepY.length - 1;
        await convRatesInst.setImbalanceStepFunction(tokens[4], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});

        //imbalance buy step x - change size. see set fails
        imbalanceBuyStepY.push(17);

        try {
            await convRatesInst.setImbalanceStepFunction(tokens[4], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //set size back and see set success
        imbalanceBuyStepY.length = imbalanceBuyStepX.length + 1;
        await convRatesInst.setImbalanceStepFunction(tokens[4], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});

        //imbalance sell step x - change size. see set fails
        imbalanceSellStepX.push(17);

        try {
            await convRatesInst.setImbalanceStepFunction(tokens[4], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //set size back and see set success
        imbalanceSellStepX.length = imbalanceSellStepY.length - 1;
        await convRatesInst.setImbalanceStepFunction(tokens[4], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});

        //imbalance sell step y - change size. see set fails
        imbalanceSellStepY.push(17);

        try {
            await convRatesInst.setImbalanceStepFunction(tokens[4], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //set size back and see set success
        imbalanceSellStepY.length = imbalanceSellStepX.length + 1;
        await convRatesInst.setImbalanceStepFunction(tokens[4], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
    });

    it("should verify get rate returns 0 if token disabled.", async function () {
        let qty = 3000;
        let index = 5;

        let rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);

        assert(rate > 0, "unexpected rate");

        await convRatesInst.disableTokenTrade(tokens[index], {from: alerter});
        rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);
        assert(rate == 0, "unexpected rate");

        await convRatesInst.enableTokenTrade(tokens[index]);
    });

    it("should verify get rate returns 0 if token minimal record resolution is zero.", async function () {
        let qty = 3000;
        let index = 5;

        let rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);

        assert(rate > 0, "unexpected rate");

        await convRatesInst.setTokenControlInfo(tokens[index], 0, 0, 0);
        rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);
        assert(rate == 0, "unexpected rate");

        await convRatesInst.setTokenControlInfo(tokens[index], minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance);
    });

    it("should verify get rate returns 0 block is high (bigger then expiration block).", async function () {
        let qty = 3000;
        let index = 5;

        let rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);

        assert(rate > 0, "unexpected rate");

        rate = await convRatesInst.getRate(tokens[index], currentBlock*1 + 2000, false, qty);
        assert(rate == 0, "unexpected rate");
    });

    it("should verify get rate returns 0 when qty above block imbalance.", async function () {
        let qty = maxPerBlockImbalance * 1 - 1;
        let index = 5;

        let rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);

        assert(rate > 0, "unexpected rate");

        qty = qty * 1 + 2;
        rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);
        assert(rate == 0, "unexpected rate");
    });

    it("should verify get rate returns 0 when qty + total imbalance are above maxTotalImbalance.", async function () {
        let qty = (maxPerBlockImbalance * -1 + 2);
        let index = 11;
        let totalImbalance = 0;
        let token = tokens[index];
        let imbalance = qty;

        let lastSetBlock = await convRatesInst.getUpdateRateBlockFromCompact(token);
        assert.equal(lastSetBlock.valueOf(), lastSetCompactBlock, "unexpected block");

        while ((totalImbalance + imbalance) > (-maxTotalImbalance)) {
            await convRatesInst.recordImbalance(token, imbalance, lastSetCompactBlock, currentBlock++, {from: reserveAddress});
            totalImbalance += imbalance;
        }

        qty = maxTotalImbalance + totalImbalance - 1;
        let rximbalance = await convRatesInst.getImbalancePerToken(token, lastSetCompactBlock, currentBlock);
        assert.equal(rximbalance[0].valueOf(), totalImbalance, "bad imbalance");

        let maxTotal = await convRatesInst.mockGetMaxTotalImbalance(token);
        assert.equal(maxTotalImbalance, maxTotal.valueOf(), "unexpected max total imbalance.");

        //we are near total imbalance so small getRate will get legal rate.
        let rate = await convRatesInst.getRate(token, currentBlock, false, qty);

        assert(rate > 0, "expected rate > 0, received: " + rate);

        //high get rate should get 0.
        rate = await convRatesInst.getRate(token, currentBlock, false, (qty + 1));

        assert.equal(rate.valueOf(), 0, "unexpected rate");
    });

    it("should verify set step functions for imbalance reverted when more them max steps (10).", async function () {
        let index = 1;

        imbalanceBuyStepX = [15, 30, 70, 100, 200, 500, 700, 900, 1100, 1500, 1600, 1700, 1800, 1900, 2000];
        imbalanceBuyStepY = [8, 30, 70, 100, 120, 150, 170, 190, 210, 250, 300, 320, 330, 340, 350, 360];
        imbalanceSellStepX = [15, 30, 70, 100, 200, 500, 700, 900, 1100, 1500, 1600, 1700, 1800, 1900, 2000];
        imbalanceSellStepY = [8, 30, 70, 100, 120, 150, 170, 190, 210, 250, 300, 320, 330, 340, 350, 360];

        await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});

        //set illegal value for buy steps.
        imbalanceBuyStepX[15] = 2100;
        imbalanceBuyStepY[16] = 400;

        try {
            await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }


        //remove extra step and see success again
        imbalanceBuyStepX.length = 15;
        imbalanceBuyStepY.length = 16;
        await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});

        //set illegal value for sell steps.
        imbalanceSellStepX[15] = 2100;
        imbalanceSellStepY[16] = 400;

        try {
            await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }
    });

    it("should verify set step functions for imbalance reverted when amounts are not increasing.", async function () {
        let index = 1;

        imbalanceBuyStepX = [15, 30, 70, 100, 200];
        imbalanceBuyStepY = [8, 30, 70, 100, 120, 150];
        imbalanceSellStepX = [15, 30, 70, 100, 200];
        imbalanceSellStepY = [8, 30, 70, 100, 120, 150];

        await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});

        imbalanceBuyStepX = [15, 30, 70, 200, 100];
        try {
            await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        imbalanceBuyStepX = [15, 30, 70, 100, 100];
        try {
            await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        imbalanceBuyStepX = [15, 30, 70, 100, 200];
        imbalanceSellStepX = [15, 30, 70, 200, 100];

        try {
            await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        imbalanceSellStepX = [15, 30, 70, 100, 100];
        try {
            await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        imbalanceBuyStepX = [15];
        imbalanceBuyStepY = [8, 10];
        imbalanceSellStepX = [15];
        imbalanceSellStepY = [8, 10];
        await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});

        imbalanceBuyStepX = [];
        imbalanceBuyStepY = [2];
        imbalanceSellStepX = [];
        imbalanceSellStepY = [2];
        await convRatesInst.setImbalanceStepFunction(tokens[index], imbalanceBuyStepX, imbalanceBuyStepY, imbalanceSellStepX, imbalanceSellStepY, {from:operator});
    });

    it("should verify record imbalance reverted when not from reserve address.", async function () {
        //try record imbalance
        try {
            await convRatesInst.recordImbalance(tokens[5], 30, currentBlock, currentBlock, {from: alerter});
            assert(false, "throw was expected in line above.")
        } catch(e){
            assert(Helper.isRevertErrorMessage(e), "expected throw but got: " + e);
        }

        //now the same from reserve address
        await convRatesInst.recordImbalance(tokens[5], 30, currentBlock, currentBlock, {from: reserveAddress});
    });

    it("should test getting bps from executing step function as expected", async function () {
        let tokenInd = 1;
        let token = tokens[tokenInd];
        // Case1: qty negative, 0 < qty < all steps
        let stepX = [-200, -100, -50];
        let stepY = [-20, -10, -5, -2];
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        let bps = getExtraBpsForQuantity(-400, -300, stepX, stepY);
        // 100 * -20
        assert.equal(-20, bps, "bad bps");
        let contractBps = await convRatesInst.mockExecuteStepFunction(token, -400, -300);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case2: qty negative, all steps < qty < 0
        stepX = [-200, -100, -50];
        stepY = [-20, -10, -5, -2];
        bps = getExtraBpsForQuantity(-25, 0, stepX, stepY);
        // 25 * -2
        assert.equal(-2, bps, "bad bps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -25, 0);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case2: qty negative, first step < qty < last step < 0
        stepX = [-200, -100, -50];
        stepY = [-20, -10, -5, -2];
        bps = getExtraBpsForQuantity(-75, 10, stepX, stepY);
        // 25 * (-5) + 60 * (-2)
        assert.equal(divSolidity(-245, 85), bps, "bad bps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -75, 10);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case3: qty negative, all steps negative except last one is 0
        stepX = [-200, -100, -50, 0];
        stepY = [-20, -10, -5, 1, 5];
        // 100 * (-20) + 100 * (-10) + 50 * (-5) + 20 * 1 = -3230
        bps = getExtraBpsForQuantity(-300, -25, stepX, stepY);
        assert.equal(divSolidity(-3230, 275), bps, "bad bps 1");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -300, -25);
        assert.equal(contractBps.valueOf(), bps, "bad bps 2");

        // Case4: qty negative, all steps negative except last one is positive, qty < all steps
        stepX = [-200, -100, -50, 10];
        stepY = [-20, -10, -5, 2, 5];
        // 100 * (-20) + 100 * (-10) + 50 * (-5) + 60 * 2 + 5 * 5 = -3105
        bps = getExtraBpsForQuantity(-300, 15, stepX, stepY);
        assert.equal(divSolidity(-3105, 315), bps, "bad bps 1");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -300, 15);
        assert.equal(contractBps.valueOf(), bps, "bad bps 2");

        // Case5: qty negative, all steps negative except last one is positive, first step < qty < last step
        // 50 * (-10) + 50 * (-5) + 60 * 2  + 10 * 5 = -580
        bps = getExtraBpsForQuantity(-150, 20, stepX, stepY);
        assert.equal(divSolidity(-580, 170), bps, "bad bps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -150, 20);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case6: qty negative, all steps non-negative with first step is 0
        stepX = [0, 10, 20, 30];
        stepY = [0, 20, 50, 100, 120];
        bps = getExtraBpsForQuantity(-100, 0, stepX, stepY);
        assert.equal(0, bps, "bad bps for negative qty with all non-negative qty");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -100, 0);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case7: qty negative, all steps non-negative
        stepX = [10, 20, 30];
        stepY = [20, 50, 100, 120];
        bps = getExtraBpsForQuantity(-100, 5, stepX, stepY);
        assert.equal(20, bps, "bad bps for negative qty with all non-negative qty");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, -100, 5);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case8: qty is 0, value is 0
        stepX = [10, 20, 30];
        stepY = [20, 50, 100, 120];
        bps = getExtraBpsForQuantity(0, 0, stepX, stepY);
        assert.equal(0, bps, "bad bps for 0 qty");
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 0);
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        stepX = [-100, -50, -30];
        stepY = [20, 50, 100, 120];
        bps = getExtraBpsForQuantity(120, 120, stepX, stepY);
        assert.equal(0, bps, "bad bps for 0 qty");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 120, 120);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case9: qty is positive, all steps are negative
        stepX = [-100, -50, -30];
        stepY = [20, 50, 100, 120];
        bps = getExtraBpsForQuantity(0, 20, stepX, stepY);
        assert.equal(120, bps, "bad bps for 0 qty");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 20);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case10: qty is positive, 0 < first step < qty < last step
        stepX = [10, 30, 50];
        stepY = [20, 50, 100, 120];
        bps = getExtraBpsForQuantity(0, 40, stepX, stepY);
        // (10 * 20 + 20 * 50 + 10 * 100) = 2200
        assert.equal(divSolidity(2200, 40), bps, "bad bps for positive qty not all steps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 40);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case11: qty is positive, 0 < all steps < qty
        stepX = [10, 30, 50];
        stepY = [20, 50, 100, 120];
        bps = getExtraBpsForQuantity(0, 120, stepX, stepY);
        // (10 * 20 + 20 * 50 + 20 * 100 + 70 * 120) = 11600
        assert.equal(divSolidity(11600, 120), bps, "bad bps for positive qty all steps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 120);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case12: qty is positive, first step < 0 < qty < last step
        stepX = [-100, -50, 10, 30, 150];
        stepY = [-30, -15, 20, 50, 100, 120];
        bps = getExtraBpsForQuantity(0, 120, stepX, stepY);
        // (10 * 20 + 20 * 50 + 20 * 100 + 70 * 100) = 10200
        assert.equal(divSolidity(10200, 120), bps, "bad bps for positive qty all steps");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 120);
        assert.equal(contractBps.valueOf(), bps, "bad bps");

        // Case13: qty is positive, step is empty
        stepX = [];
        stepY = [2];
        bps = getExtraBpsForQuantity(0, 120, stepX, stepY);
        assert.equal(2, bps, "bad bps: should be 0 when step is empty");
        await convRatesInst.setImbalanceStepFunction(token, stepX, stepY, stepX, stepY, {from:operator});
        contractBps = await convRatesInst.mockExecuteStepFunction(token, 0, 120);
        assert.equal(contractBps.valueOf(), bps, "bad bps");
    });
});

function convertRateToPricingRate (baseRate) {
// conversion rate in pricing is in precision units (10 ** 18) so
// rate 1 to 50 is 50 * 10 ** 18
// rate 50 to 1 is 1 / 50 * 10 ** 18
    return ((new BigNumber(10).pow(18)).mul(baseRate).floor());
};

function getExtraBpsForImbalanceBuyQuantity(current, qty) {
    return getExtraBpsForQuantity(current, current + qty, imbalanceBuyStepX, imbalanceBuyStepY);
};

function getExtraBpsForImbalanceSellQuantity(current, qty) {
    return getExtraBpsForQuantity(current - qty, current, imbalanceSellStepX, imbalanceSellStepY);
};

function getExtraBpsForQuantity(from, to, stepX, stepY) {
    if (stepY.length == 0) { return 0; }
    let len = stepX.length;
    if (from == to) {
        return 0;
    }
    let change = 0;
    let qty = to - from;
    for(let i = 0; i < len; i++) {
        if (stepX[i] <= from) { continue; }
        if (stepX[i] >= to) {
            change += (to - from) * stepY[i];
            from = to;
            break;
        } else {
            change += (stepX[i] - from) * stepY[i];
            from = stepX[i];
        }
    }
    if (from < to) {
        change += (to - from) * stepY[len];
    }
    return divSolidity(change, qty);
}

function addBps (rate, bps) {
    return (rate.mul(10000 + bps).div(10000));
};

function compareRates (receivedRate, expectedRate) {
    expectedRate = expectedRate - (expectedRate % 10);
    receivedRate = receivedRate - (receivedRate % 10);
    assert.deepEqual(expectedRate, receivedRate, "different rates");
};

function divSolidity(a, b) {
    let c = a / b;
    if (c < 0) { return Math.ceil(c); }
    return Math.floor(c);
}