const sha256 = require('sha256');
const { v1: uuidv1 } = require('uuid');
const currentNodeURL = process.argv[3];

function Blockchain() {
	this.chain = [];
	this.pendingTransactions = [];

	this.currentNodeURL = currentNodeURL;
	this.networkNodes = [];

	this.createNewBlock(0, '0', '0');
}

Blockchain.prototype.createNewBlock = function (
	nonce,
	previousBlockHash,
	hash
) {
	const newBlock = {
		index: this.chain.length + 1,
		timestamp: Date.now(),
		transactions: this.pendingTransactions,
		nonce,
		previousBlockHash,
		hash
	};

	this.pendingTransactions = [];
	this.chain.push(newBlock);

	return newBlock;
};

Blockchain.prototype.getLastBlock = function () {
	return this.chain[this.chain.length - 1];
};

Blockchain.prototype.createNewTransaction = function (
	amount,
	sender,
	recipient
) {
	const newTransaction = {
		amount,
		sender,
		recipient,
		transactionID: uuidv1().split('-').join('')
	};

	return newTransaction;
};

Blockchain.prototype.addTransactionToPendingTransactions = function (
	transactionObj
) {
	this.pendingTransactions.push(transactionObj);

	return this.getLastBlock().index + 1;
};

Blockchain.prototype.hashBlock = function (
	previousBlockHash,
	currentBlockData,
	nonce
) {
	const dataAsString =
		previousBlockHash + nonce.toString() + JSON.stringify(currentBlockData);
	const hash = sha256(dataAsString);

	return hash;
};

Blockchain.prototype.proofOfWork = function (
	previousBlockHash,
	currentBlockData
) {
	let nonce = 0;
	let hash = this.hashBlock(previousBlockHash, currentBlockData, nonce);

	while (hash.substring(0, 4) !== '0000') {
		nonce++;
		hash = this.hashBlock(previousBlockHash, currentBlockData, nonce);
	}

	return nonce;
};

Blockchain.prototype.chainIsValid = function (blockchain) {
	let validChain = true;

	for (let i = 1; i < blockchain.length; i++) {
		const currentBlock = blockchain[i];
		const prevBlock = blockchain[i - 1];

		const { transactions, index, nonce } = currentBlock;
		const blockHash = this.hashBlock(
			prevBlock.hash,
			{ transactions, index },
			nonce
		);

		const invalidHashString = blockHash.substring(0, 4) !== '0000';
		const invalidBlockHash = currentBlock.previousBlockHash !== prevBlock.hash;
		if (invalidHashString || invalidBlockHash) {
			validChain = false;
		}

		const genesisBlock = blockchain[0];
		const correnctNonce = genesisBlock.nonce === 0;
		const correctPreviousHash = genesisBlock.previousBlockHash === '0';
		const correctHash = genesisBlock.hash === '0';
		const correctTransaction = genesisBlock.transactions.length === 0;

		if (
			!correnctNonce ||
			!correctPreviousHash ||
			!correctHash ||
			!correctTransaction
		) {
			validChain = false;
		}
	}

	return validChain;
};

Blockchain.prototype.getBlock = function (blockHash) {
	let correctBlock = null;

	this.chain.forEach((block) => {
		if (block.hash === blockHash) {
			correctBlock = block;
		}
	});

	return correctBlock;
};

Blockchain.prototype.getTransaction = function (transactionID) {
	let correctTransaction = null;
	let correctBlock = null;

	this.chain.forEach((block) => {
		block.transactions.forEach((transaction) => {
			if (transaction.transactionID === transactionID) {
				correctTransaction = transaction;
				correctBlock = block;
			}
		});
	});

	return {
		block: correctBlock,
		transaction: correctTransaction
	};
};

Blockchain.prototype.getAddressData = function (address) {
	const addressTransactions = [];

	this.chain.forEach((block) => {
		block.transactions.forEach((transaction) => {
			if (transaction.sender === address || transaction.recipient === address) {
				addressTransactions.push(transaction);
			}
		});
	});

	let balance = 0;
	addressTransactions.forEach((transaction) => {
		if (transaction.recipient === address) {
			balance += transaction.amount;
		} else if (transaction.sender === address) {
			balance -= transaction.amount;
		}
	});

	return {
		addressTransactions,
		balance
	};
};

module.exports = Blockchain;
