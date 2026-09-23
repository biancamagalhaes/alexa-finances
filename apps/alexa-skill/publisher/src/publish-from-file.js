'use strict';

const { readFile } = require('node:fs/promises');
const { resolve } = require('node:path');
const { publishPortfolioView } = require('./data-store-publisher');

async function main() {
  const source = process.env.ALEXA_DATA_STORE_PAYLOAD_FILE;

  if (!source) {
    throw new Error('ALEXA_DATA_STORE_PAYLOAD_FILE must point to a PortfolioView JSON file');
  }

  const portfolio = JSON.parse(await readFile(resolve(source), 'utf8'));
  const result = await publishPortfolioView(portfolio);

  // Do not print the portfolio payload: it contains financial values.
  console.info(`Alexa Data Store publish completed in ${result.mode} mode.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Alexa Data Store publisher failed');
  process.exitCode = 1;
});
