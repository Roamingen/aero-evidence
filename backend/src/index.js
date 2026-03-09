const app = require('./app');
const env = require('./config/env');
const { testConnection } = require('./config/database');

async function bootstrap() {
    await testConnection();
    app.listen(env.port, () => {
        console.log(`Backend server listening on http://127.0.0.1:${env.port}`);
    });
}

bootstrap().catch((error) => {
    console.error('Failed to start backend server:');
    console.error(error.message || error);
    process.exit(1);
});
