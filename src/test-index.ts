import { TestCleanupTask } from './test-cleanup';
import { Logger } from './utils/logger';

interface TestResults {
    success: boolean;
    accessDeleted: boolean;
    connectionDeleted: boolean;
    uniloginDeleted: boolean;
    message?: string;
}

async function runTest() {
    console.log(' Iniciando prueba de limpieza para usuario específico...');
    const logger = new Logger();
    const testCleanup = new TestCleanupTask(logger);

    try {
        const results = await testCleanup.executeTestCleanup() as TestResults;

        if (!results.success) {
            console.log(' No se pudo completar la validación');
            if (results.message) {
                console.log(`ℹ️  Razón: ${results.message}`);
            }
            return;
        }

        if (results.message) {
            console.log(`Mensaje: ${results.message}`);
        }

        console.log('Prueba completada');

    } catch (error) {
        console.error(' Error ejecutando la prueba:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

runTest().catch(error => {
    console.error('Error fatal:', error instanceof Error ? error.message : String(error));
    process.exit(1);
});