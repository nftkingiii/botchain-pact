# Pact

Pact stores an immutable receipt binding a recipient, token, amount, deadline, and request identifier.

Testnet deployment and explorer proof: [BOTCHAIN_TESTNET.md](BOTCHAIN_TESTNET.md).

The contract is a receipt parameter anchor, not a payment processor. It does not receive tokens or prove payment/service delivery.

## Web app

Pact includes a local-first request list, request creator, shareable invoice link with QR, deterministic field fingerprint, and read-only comparison against the deployed receipt contract. Requests persist in the current browser; sharing is explicit. There is no wallet connection, signing, settlement, or paid status.

Verified target: BOT Chain Testnet chain `968`, RPC `https://rpc.bohr.life`; deployed `PactReceipt` and explorer proof are recorded in [BOTCHAIN_TESTNET.md](BOTCHAIN_TESTNET.md). Read-back compares the immutable recipient, token, amount, deadline, and request ID. An exact match only confirms parameter equality.

Use Node `24.12.x` and npm `11.6.2`:

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm run build
npm start
```

The standalone service binds `0.0.0.0:$PORT` (local default 4319), serves deep links, and exposes `/healthz`, `/revision`, and a restricted read-only `/api/rpc` endpoint. Build and runtime configuration are documented in `.env.example`.

No external payment service, oracle, prover, or token metadata service is configured. The requester supplies the displayed asset label and decimals.

```sh
forge build
forge test
```
