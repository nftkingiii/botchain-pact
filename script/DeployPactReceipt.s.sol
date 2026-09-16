// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {PactReceipt} from "../contracts/PactReceipt.sol";

interface VmDeploy {
    function startBroadcast() external;
    function stopBroadcast() external;
}

contract DeployPactReceipt {
    VmDeploy private constant vm = VmDeploy(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run(address recipient, address token, uint256 amount, uint256 deadline, bytes32 requestId)
        external
        returns (PactReceipt deployed)
    {
        vm.startBroadcast();
        deployed = new PactReceipt(recipient, token, amount, deadline, requestId);
        vm.stopBroadcast();
    }
}
