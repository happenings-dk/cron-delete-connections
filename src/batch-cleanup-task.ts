import { MongoClient } from 'mongodb';
import { Logger } from './utils/logger';
import * as fs from 'fs';
import * as path from 'path';

export class BatchCleanupTask {
    private readonly logger: Logger;
    private readonly mongoUri = 'mongodb+srv://feridem:zZCLTCIGpcH2RedN@cluster0.ynd5zaq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
    private collectionNames: Map<string, string> = new Map();
    private client: MongoClient;
    private readonly BATCH_SIZE = 5000;
    private deletionLog: string[] = [];
    private readonly logFilePath: string;

    constructor(logger: Logger) {
        this.logger = logger;
        this.client = new MongoClient(this.mongoUri);
        this.logFilePath = path.join(process.cwd(), 'deletion-report.txt');
    }

    private async logDeletionResult(userId: string, wasDeleted: boolean, reason?: string) {
        const status = wasDeleted ? 'ELIMINADO' : 'NO ELIMINADO';
        const reasonText = reason ? ` - Razón: ${reason}` : '';
        this.deletionLog.push(`${status}: Usuario ID ${userId}${reasonText}`);
    }

    private async saveReportToFile() {
        const deletedCount = this.deletionLog.filter(log => log.startsWith('ELIMINADO')).length;
        const notDeletedCount = this.deletionLog.filter(log => log.startsWith('NO ELIMINADO')).length;

        const report = [
            '=== REPORTE DE LIMPIEZA DE USUARIOS ===',
            '',
            `Fecha de ejecución: ${new Date().toLocaleString()}`,
            '',
            `Total usuarios eliminados: ${deletedCount}`,
            `Total usuarios no eliminados: ${notDeletedCount}`,
            '',
            '=== DETALLE DE USUARIOS ===',
            '',
            ...this.deletionLog
        ].join('\n');

        try {
            await fs.promises.writeFile(this.logFilePath, report, 'utf8');
            this.logger.info(`Reporte guardado en: ${this.logFilePath}`);
        } catch (error) {
            this.logger.error('Error al guardar el reporte:', error);
        }
    }

    private async verifyCollections(): Promise<boolean> {
        this.logger.info('Verificando colecciones en todas las bases de datos...');
        try {
            const dbUser = this.client.db('User');
            const dbAccess = this.client.db('Access');
            const dbOrganization = this.client.db('Organization');

            // Obtener las colecciones de cada base de datos
            const userCollections = await dbUser.listCollections().toArray();
            const accessCollections = await dbAccess.listCollections().toArray();
            const orgCollections = await dbOrganization.listCollections().toArray();

            const userColNames = userCollections.map(c => c.name);
            const accessColNames = accessCollections.map(c => c.name);
            const orgColNames = orgCollections.map(c => c.name);

            this.logger.info('Colecciones User:', userColNames);
            this.logger.info('Colecciones Access:', accessColNames);
            this.logger.info('Colecciones Organization:', orgColNames);

            let allFound = true;

            // Verificar Users en la base de datos User
            if (userColNames.includes('Users')) {
                this.collectionNames.set('users', 'Users');
                this.logger.info('Colección Users encontrada en base de datos User');
            } else {
                allFound = false;
                this.logger.error('No se encontró la colección Users en la base de datos User');
            }

            // Verificar Access en la base de datos Access
            if (accessColNames.includes('Access')) {
                this.collectionNames.set('accesses', 'Access');
                this.logger.info('Colección Access encontrada en base de datos Access');
            } else {
                allFound = false;
                this.logger.error('No se encontró la colección Access en la base de datos Access');
            }

            // Verificar Connections en la base de datos Organization
            if (orgColNames.includes('Connections')) {
                this.collectionNames.set('connections', 'Connections');
                this.logger.info('Colección Connections encontrada en base de datos Organization');
            } else {
                allFound = false;
                this.logger.error('No se encontró la colección Connections en la base de datos Organization');
            }

            return allFound;
        } catch (error) {
            this.logger.error('Error al verificar colecciones:', error);
            return false;
        }
    }

    async executeBatchCleanup(): Promise<any> {
        try {
            this.logger.info('Conectando a MongoDB...');
            await this.client.connect();
            this.logger.info('Conexión establecida exitosamente');

            const collectionsVerified = await this.verifyCollections();
            if (!collectionsVerified) {
                throw new Error('Fallo en la verificación de colecciones');
            }

            const dbUser = this.client.db('User');
            const dbAccess = this.client.db('Access');
            const dbOrganization = this.client.db('Organization');
            const dbUnilogin = this.client.db('Unilogin');

            const stats = {
                totalProcessed: 0,
                successfulDeletions: 0,
                failedDeletions: 0,
                skippedUsers: 0
            };

            const usersCursor = dbUser.collection('Users').find({});

            let batch: any[] = [];
            while (await usersCursor.hasNext()) {
                const user = await usersCursor.next();
                batch.push(user);

                if (batch.length >= this.BATCH_SIZE) {
                    const batchStats = await this.processBatch(batch, dbAccess, dbOrganization, dbUnilogin);
                    this.updateStats(stats, batchStats);
                    batch = [];

                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            if (batch.length > 0) {
                const batchStats = await this.processBatch(batch, dbAccess, dbOrganization, dbUnilogin);
                this.updateStats(stats, batchStats);
            }

            await this.saveReportToFile();

            return {
                success: true,
                stats,
                message: `Proceso completado. Total procesados: ${stats.totalProcessed}, 
                         Eliminados: ${stats.successfulDeletions}, 
                         Fallidos: ${stats.failedDeletions}, 
                         Omitidos: ${stats.skippedUsers}`
            };

        } catch (error) {
            this.logger.error('Error en executeBatchCleanup:', error);
            throw error;
        } finally {
            await this.client.close();
            this.logger.info('Conexión a MongoDB cerrada');
        }
    }

    private async processBatch(
        users: any[],
        dbAccess: any,
        dbOrganization: any,
        dbUnilogin: any
    ): Promise<any> {
        const batchStats = {
            totalProcessed: 0,
            successfulDeletions: 0,
            failedDeletions: 0,
            skippedUsers: 0
        };

        for (const user of users) {
            batchStats.totalProcessed++;

            try {
                if (!await this.shouldDeleteConnection(user)) {
                    await this.logDeletionResult(user.id, false, 'No cumple criterios de eliminación');
                    batchStats.skippedUsers++;
                    continue;
                }

                const session = await this.client.startSession();
                session.startTransaction();

                try {
                    const connection = await dbOrganization.collection('Connections')
                        .findOne({ characterid: user.id }, { session });

                    await dbAccess.collection('Access')
                        .deleteOne({ characterid: user.id }, { session });

                    await dbOrganization.collection('Connections')
                        .deleteOne({ characterid: user.id }, { session });

                    if (connection?.method === 1) {
                        await dbUnilogin.collection('Auth')
                            .deleteMany({ userid: user.id }, { session });
                    }

                    await session.commitTransaction();
                    await this.logDeletionResult(user.id, true);
                    batchStats.successfulDeletions++;
                    this.logger.info(`Usuario ${user.id} procesado exitosamente`);

                } catch (error) {
                    await session.abortTransaction();
                    await this.logDeletionResult(user.id, false, 'Error en la transacción');
                    this.logger.error(`Error procesando usuario ${user.id}:`, error);
                    batchStats.failedDeletions++;
                } finally {
                    await session.endSession();
                }

            } catch (error) {
                await this.logDeletionResult(user.id, false, 'Error en el procesamiento');
                this.logger.error(`Error procesando usuario ${user.id}:`, error);
                batchStats.failedDeletions++;
            }
        }

        return batchStats;
    }

    private updateStats(totalStats: any, batchStats: any): void {
        totalStats.totalProcessed += batchStats.totalProcessed;
        totalStats.successfulDeletions += batchStats.successfulDeletions;
        totalStats.failedDeletions += batchStats.failedDeletions;
        totalStats.skippedUsers += batchStats.skippedUsers;
    }

    private async shouldDeleteConnection(user: any): Promise<boolean> {
        this.logger.info(`Evaluando criterios de eliminación para usuario ${user.id}`);

        const endYearValue = user.endyear && user.endyear.$numberInt
            ? parseInt(user.endyear.$numberInt)
            : user.endyear;

        if (!endYearValue) {
            this.logger.info('No hay endyear definido, se debe eliminar');
            return true;
        }

        const endYear = new Date(endYearValue, 0);
        const currentDate = new Date();

        if (endYear < currentDate) {
            this.logger.info('La fecha de fin es anterior a la fecha actual, se debe eliminar');
            return true;
        }

        const isAfterJuly7th = (endYear.getMonth() > 6) ||
            (endYear.getMonth() === 6 && endYear.getDate() >= 7);

        if (endYear.getFullYear() === currentDate.getFullYear() && isAfterJuly7th) {
            this.logger.info('Es el año actual y después del 7 de julio, se debe eliminar');
            return true;
        }

        return false;
    }
}