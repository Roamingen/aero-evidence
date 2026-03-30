const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { deployMaintenanceContract } = require('./chain_helpers');

async function main() {
    const { deploymentInfo } = await deployMaintenanceContract();

    console.log('AviationMaintenanceV2 已部署到本地链:');
    console.log(JSON.stringify(deploymentInfo, null, 2));
}

main().catch((error) => {
    console.error('部署失败:');
    console.error(error.message || error);
    process.exit(1);
});