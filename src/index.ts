import { BatchCleanupTask } from './batch-cleanup-task';
import { Logger } from './utils/logger';

async function main() {
    const logger = new Logger();
    const batchCleanup = new BatchCleanupTask(logger);

    try {
        logger.info('Iniciando proceso de limpieza por lotes...');
        const results = await batchCleanup.executeBatchCleanup();
        logger.info('Proceso completado:', results);
    } catch (error) {
        logger.error('Error en el proceso principal:', error);
        process.exit(1);
    }
}

main().catch(error => {
    console.error('Error fatal:', error);
    process.exit(1);
});