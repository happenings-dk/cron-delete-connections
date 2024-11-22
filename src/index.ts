import { ConnectionCleanupTask } from './connection-cleanup-task';
import { Logger } from './utils/logger';
import cron from 'node-cron';

// Función para ejecutar la tarea una sola vez
async function runOnce() {
    console.log('🚀 Iniciando proceso de limpieza...');
    const logger = new Logger();
    const cleanup = new ConnectionCleanupTask(logger);

    try {
        console.log('📋 Ejecutando tarea de limpieza...');
        const stats = await cleanup.execute();
        console.log('✅ Tarea completada. Estadísticas:', JSON.stringify(stats, null, 2));
    } catch (error) {
        console.error('❌ Error ejecutando la tarea:', error);
        process.exit(1);
    }
}

// Función para iniciar el cron
function startCron() {
    console.log('🕒 Iniciando tarea cron...');

    // Ejecutar la tarea inmediatamente al iniciar
    runOnce();

    // Programar la tarea para ejecutarse todos los días a la medianoche
    cron.schedule('0 0 * * *', async () => {
        console.log('⏰ Ejecutando tarea programada...');
        const logger = new Logger();
        const cleanup = new ConnectionCleanupTask(logger);

        try {
            const stats = await cleanup.execute();
            console.log('✅ Tarea cron completada:', JSON.stringify(stats, null, 2));
        } catch (error) {
            console.error('❌ Error en tarea cron:', error);
        }
    });

    console.log('✨ Cron job configurado y ejecutándose...');
}

// Verificar argumentos de línea de comando
const args = process.argv.slice(2);
if (args.includes('--cron')) {
    startCron();
} else {
    runOnce();
}

// Manejo de señales de terminación
process.on('SIGTERM', () => {
    console.log('👋 Recibida señal SIGTERM. Finalizando...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('👋 Recibida señal SIGINT. Finalizando...');
    process.exit(0);
});

// Manejo de excepciones no capturadas
process.on('uncaughtException', (error) => {
    console.error('💥 Error no capturado:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Promesa rechazada no manejada:', reason);
    process.exit(1);
});