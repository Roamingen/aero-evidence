import { defineConfig } from 'hardhat/config';

export default defineConfig({
    paths: {
        sources: './contracts',
        tests: './test',
        cache: './cache',
        artifacts: './artifacts',
    },
    solidity: {
        version: '0.8.24',
        settings: {
            evmVersion: 'paris',
            viaIR: true,
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {
        hardhatMainnet: {
            type: 'edr-simulated',
            chainType: 'l1',
            chainId: 31337,
        },
    },
});