// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Immutable proof anchor for one BOT Chain Pact payment request.
/// The deployment itself commits the exact route; no funds are held here.
contract PactReceipt {
    address public immutable recipient;
    address public immutable token;
    uint256 public immutable amount;
    uint256 public immutable deadline;
    bytes32 public immutable requestId;

    constructor(address recipient_, address token_, uint256 amount_, uint256 deadline_, bytes32 requestId_) {
        require(recipient_ != address(0), "recipient=zero");
        require(token_ != address(0), "token=zero");
        require(amount_ > 0, "amount=zero");
        require(deadline_ > block.timestamp, "deadline=past");
        require(requestId_ != bytes32(0), "request=zero");
        recipient = recipient_;
        token = token_;
        amount = amount_;
        deadline = deadline_;
        requestId = requestId_;
    }

    function isOpen(uint256 now_) external view returns (bool) {
        return now_ < deadline;
    }
}
