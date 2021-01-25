const express = require('express');
const bodyParser = require('body-parser');
const Blockchain = require('./blockchain');
const { v1: uuidv1 } = require('uuid');
const rp = require('request-promise');

const nodeAddress = uuidv1().split('-').join('');

const bitcoin = new Blockchain();

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/blockchain', (req, res, next) => {
	res.send(bitcoin);
});

app.post('/transaction', (req, res, next) => {
	const { newTransaction } = req.body;
	const blockIndex = bitcoin.addTransactionToPendingTransactions(
		newTransaction
	);

	res.json({
		note: `Transaction will be added in block ${blockIndex}`
	});
});

app.post('/transaction/broadcast', (req, res, next) => {
	const { amount, sender, recipient } = req.body;
	const newTransaction = bitcoin.createNewTransaction(
		amount,
		sender,
		recipient
	);

	bitcoin.addTransactionToPendingTransactions(newTransaction);

	const transactionPromises = [];
	bitcoin.networkNodes.forEach((networkNodeURL) => {
		const requestOptions = {
			uri: networkNodeURL + '/transaction',
			method: 'POST',
			body: { newTransaction },
			json: true
		};

		transactionPromises.push(rp(requestOptions));
	});

	Promise.all(transactionPromises).then(() => {
		res.json({
			note: `Transaction created and broadcasted successfully.`
		});
	});
});

app.get('/mine', (req, res, next) => {
	const { hash: previousBlockHash, index } = bitcoin.getLastBlock();

	const currentBlockData = {
		transactions: bitcoin.pendingTransactions,
		index: index + 1
	};

	const nonce = bitcoin.proofOfWork(previousBlockHash, currentBlockData);
	const hash = bitcoin.hashBlock(previousBlockHash, currentBlockData, nonce);
	const newBlock = bitcoin.createNewBlock(nonce, previousBlockHash, hash);

	const minePromises = [];
	bitcoin.networkNodes.forEach((networkNodeURL) => {
		const requestOptions = {
			uri: networkNodeURL + '/receive-new-block',
			method: 'POST',
			body: { newBlock },
			json: true
		};

		minePromises.push(rp(requestOptions));
	});

	Promise.all(minePromises)
		.then(() => {
			const requestOptions = {
				uri: bitcoin.currentNodeURL + '/transaction/broadcast',
				method: 'POST',
				body: {
					amount: 12.5,
					sender: '00',
					recipient: nodeAddress
				},
				json: true
			};

			return rp(requestOptions);
		})
		.then(() => {
			res.json({
				note: `New block mined & broadcast successfully.`,
				block: newBlock
			});
		});
});

app.post('/receive-new-block', (req, res, next) => {
	const { newBlock } = req.body;

	const lastBlock = bitcoin.getLastBlock();

	const correctHash = lastBlock.hash === newBlock.previousBlockHash;
	const correctIndex = lastBlock.index + 1 === newBlock.index;

	if (correctHash && correctIndex) {
		bitcoin.chain.push(newBlock);
		bitcoin.pendingTransactions = [];

		res.json({
			note: 'New block received and accepted.',
			newBlock
		});
	} else {
		res.json({
			note: 'New block rejected!',
			newBlock
		});
	}
});

const validateAndAddNode = (nodeURL) => {
	const notCurrentNode = bitcoin.currentNodeURL !== nodeURL;
	const uniqueNode = !bitcoin.networkNodes.includes(nodeURL);

	if (uniqueNode && notCurrentNode) {
		bitcoin.networkNodes.push(nodeURL);
	}
};

app.post('/register-and-broadcast-node', (req, res, next) => {
	const { newNodeURL } = req.body;
	validateAndAddNode(newNodeURL);

	// every network nodes registers the node which enters the network.
	const registerPromises = [];
	bitcoin.networkNodes.forEach((networkNodeURL) => {
		const requestOptions = {
			uri: networkNodeURL + '/register-node',
			method: 'POST',
			body: { newNodeURL },
			json: true
		};

		registerPromises.push(rp(requestOptions));
	});

	// the node which enters the network registers all the nodes.
	Promise.all(registerPromises)
		.then(() => {
			const bulkRegisterOptions = {
				uri: newNodeURL + '/register-nodes-bulk',
				method: 'POST',
				body: {
					allNetworkNodes: [...bitcoin.networkNodes, bitcoin.currentNodeURL]
				},
				json: true
			};

			return rp(bulkRegisterOptions);
		})
		.then(() => {
			res.json({ note: 'New note registered with network successfully.' });
		});
});

app.post('/register-node', (req, res, next) => {
	const { newNodeURL } = req.body;
	validateAndAddNode(newNodeURL);

	res.json({
		note: 'New node registered successfully with node.'
	});
});

app.post('/register-nodes-bulk', (req, res, next) => {
	const { allNetworkNodes } = req.body;
	allNetworkNodes.forEach((networkNodeURL) => {
		validateAndAddNode(networkNodeURL);
	});

	res.json({
		note: 'Bulk registration successful.'
	});
});

app.get('/consensus', (req, res, next) => {
	const consensusPromises = [];
	bitcoin.networkNodes.forEach((networkNodeURL) => {
		const requestOptions = {
			uri: networkNodeURL + '/blockchain',
			method: 'GET',
			json: true
		};

		consensusPromises.push(rp(requestOptions));
	});

	Promise.all(consensusPromises).then((blockchains) => {
		const currentChainLength = bitcoin.chain.length;
		let maxChainLength = currentChainLength;
		let newLongestChain = null;
		let newPendingTransactions = null;

		blockchains.forEach((blockchain) => {
			if (blockchain.chain.length > maxChainLength) {
				const { chain, pendingTransactions } = blockchain;

				maxChainLength = chain.length;
				newLongestChain = chain;
				newPendingTransactions = pendingTransactions;
			}
		});

		if (!newLongestChain || !bitcoin.chainIsValid(newLongestChain)) {
			res.json({
				note: 'Current chain has NOT been replaced!',
				chain: bitcoin.chain
			});
		} else if (newLongestChain && bitcoin.chainIsValid(newLongestChain)) {
			bitcoin.chain = newLongestChain;
			bitcoin.pendingTransactions = newPendingTransactions;

			res.json({
				note: 'Current chain has been replaced!',
				chain: bitcoin.chain
			});
		}
	});
});

app.get('/block/:blockHash', (req, res, next) => {
	const { blockHash } = req.params;
	const correctBlock = bitcoin.getBlock(blockHash);

	res.json({
		correctBlock
	});
});

app.get('/transaction/:transactionID', (req, res, next) => {
	const { transactionID } = req.params;
	const { block, transaction } = bitcoin.getTransaction(transactionID);

	res.json({
		block,
		transaction
	});
});

app.get('/address/:address', (req, res, next) => {
	const { address } = req.params;
	const addresData = bitcoin.getAddressData(address);

	res.json({
		addresData
	});
});

const port = process.argv[2];
app.listen(port, () => {
	console.log(`Listening server on ${port}`);
});
