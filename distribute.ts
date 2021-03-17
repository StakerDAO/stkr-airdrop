import lineReader from 'line-reader'
import { BigNumber } from 'bignumber.js'
import { Utils } from '@tacoinfra/harbinger-lib'
import fetch from 'node-fetch'
import { getLogger } from 'loglevel'
import {
  registerFetch,
  registerLogger,
} from 'conseiljs'
import { TezosToolkit } from '@taquito/taquito'
import { InMemorySigner } from '@taquito/signer';
import * as fs from 'fs';

const DISTRIBUTION_FILE = "airdrop.csv"
const NODE_URL = " https://mainnet-tezos.giganode.io"
const CONTRACT_ADDRESS = ""

// Load private key
const privateKeyName = 'STKR_AIRDROP_PRIVATE_KEY'
const privateKey = process.env[privateKeyName]
if (privateKey === undefined) {
  console.log('Fatal: No deployer private key defined.')
  console.log(`Set a ${privateKeyName} environment variable..`)
  process.abort()
}

type AirDrop = {
  address: string,
  amount: string
}

type CompletedAirDrop = {
  address: string,
  amount: string,
  operationHash: string
}

const main = async () => {
  const logger = getLogger('conseiljs')
  logger.setLevel('debug', false)

  registerLogger(logger)
  registerFetch(fetch)

  // Load a signer
  const tezos = new TezosToolkit('https://YOUR_PREFERRED_RPC_URL');
  const signer = new InMemorySigner(privateKey)
  tezos.setProvider({
    signer
  });

  console.log("> Parsing file: " + DISTRIBUTION_FILE)
  console.log("> Using Node: " + NODE_URL)
  console.log("> Deploying from: " + signer.publicKeyHash)
  console.log("> Token Contract: " + CONTRACT_ADDRESS)
  console.log("")

  let drops: Array<AirDrop> = []
  lineReader.eachLine(DISTRIBUTION_FILE, (line) => {
    const split = line.split(',')
    const trimmed = split.map((input) => {
      return input.trim()
    })
    drops.push({
      address: trimmed[0],
      amount: trimmed[1],
    })
  })

  const total = drops.reduce((accumulated: BigNumber, next: AirDrop) => {
    return accumulated.plus(new BigNumber(next.amount))
  }, new BigNumber("0"))

  // Sanity Check
  console.log("> About to distribute " + total.toFixed() + " STRK?")
  console.log("> Sleeping for 120secs while you ponder that.")
  await Utils.sleep(120)

  // Get contract
  const tokenContract = await tezos.contract.at(CONTRACT_ADDRESS)

  // Iterate over each airdop and carry out the drop.
  const completedOps: Array<CompletedAirDrop> = []
  for (let i = 0; i < drops.length; i++) {
    console.log(`>> Processing ${i + 1} of ${drops.length}`)
    const drop = drops[i]
    console.log(`>> Sending ${drop.amount} to ${drop.address}`)

    const result = await tokenContract.methods.transfer(signer.publicKeyHash, drop.address, drop.amount).send({ amount: 0, mutez: true })

    completedOps.push({
      address: drop.address,
      amount: drop.amount,
      operationHash: result.hash
    })
    console.log(`>> Sent in hash ${result.hash}. Waiting for 1 confirmation.`)

    await result.confirmation(1)
    console.log(`>> Confirmed.`)
  }

  // Print results to file
  console.log("> Writing results.")
  const dropFile = "completed_airdrops.csv"
  if (fs.existsSync(dropFile)) {
    fs.unlinkSync(dropFile)
  }
  fs.writeFileSync(dropFile, `address, amount (mutez), operation hash,\n`)
  for (let i = 0; i < completedOps.length; i++) {
    const completedOp = completedOps[i]

    fs.appendFileSync(dropFile, `${completedOp.address}, ${completedOp.amount}, ${completedOp.operationHash},\n`)
  }
  console.log(`> Written to ${dropFile}`)
  console.log("")
}

main()