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


    private async verifyCollections(db: any): Promise<boolean> {
        this.logger.info('Verificando colecciones...');
        try {
            const collections = await db.listCollections().toArray();
            const collectionNames = collections.map((c: { name: string }) => c.name);
            this.logger.info('Colecciones encontradas:', collectionNames);

            const requiredCollections = {
                'users': ['Users', 'User.Users', 'users'],
                'identifications': ['Identifications'],
                'deletedRequests': ['DeleteRequests'],
                'deleted': ['Deleted']
            };

            let allFound = true;

            for (const [key, alternatives] of Object.entries(requiredCollections)) {
                const foundName = alternatives.find(name => collectionNames.includes(name));
                if (foundName) {
                    this.collectionNames.set(key, foundName);
                    this.logger.info(`Colección ${key} encontrada como: ${foundName}`);
                } else {
                    allFound = false;
                    this.logger.error(`No se encontró la colección ${key}`);
                }
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

            const dbUser = this.client.db('User');

            const collectionsVerified = await this.verifyCollections(dbUser);
            if (!collectionsVerified) {
                throw new Error('Fallo en la verificación de colecciones');
            }

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
                    const batchStats = await this.processBatch(batch, dbUser);
                    this.updateStats(stats, batchStats);
                    batch = [];

                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            if (batch.length > 0) {
                const batchStats = await this.processBatch(batch, dbUser);
                this.updateStats(stats, batchStats);
            }

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
        dbUser: any
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
                    const deleteRequestId = new Date().getTime() + '_' + user.id;

                    await dbUser.collection('DeleteRequests').insertOne({
                        _id: deleteRequestId,
                        userId: user.id,
                        requestDate: new Date(),
                        status: 'COMPLETED',
                        reason: 'AUTOMATIC_CLEANUP',
                        accessid: user.accessid || deleteRequestId,
                        metadata: {
                            originalUser: user,
                            deletionDate: new Date(),
                            deletionType: 'BATCH_CLEANUP'
                        }
                    }, { session });

                    await dbUser.collection('Deleted').insertOne({
                        ...user,
                        deletedAt: new Date(),
                        deleteRequestId: deleteRequestId
                    }, { session });

                    await dbUser.collection('Users').deleteOne({
                        id: user.id
                    }, { session });

                    await dbUser.collection('Identifications').deleteMany({
                        userId: user.id
                    }, { session });

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