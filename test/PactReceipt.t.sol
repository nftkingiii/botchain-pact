// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {PactReceipt} from "../contracts/PactReceipt.sol";

contract PactReceiptTest {
    function assertEq(address actual, address expected) private pure { require(actual == expected, "address mismatch"); }
    function assertEq(uint256 actual, uint256 expected) private pure { require(actual == expected, "uint mismatch"); }
    function assertEq(bytes32 actual, bytes32 expected) private pure { require(actual == expected, "bytes mismatch"); }

    function testStoresLockedRoute() external {
        PactReceipt pact = new PactReceipt(address(1), address(2), 123, block.timestamp + 1 days, bytes32(uint256(7)));
        assertEq(pact.recipient(), address(1)); assertEq(pact.token(), address(2)); assertEq(pact.amount(), 123); assertEq(pact.requestId(), bytes32(uint256(7)));
    }

    function testRejectsPastDeadline() external {
        try new PactReceipt(address(1), address(2), 123, block.timestamp, bytes32(uint256(7))) {
            revert("past deadline accepted");
        } catch {
            // Expected constructor rejection.
        }
    }
}
