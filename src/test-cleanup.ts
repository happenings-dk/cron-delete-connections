import mongoose from 'mongoose';
import { Connection } from './models/connection';
import { UniloginAuth } from './models/unilogin';
import { Access } from './models/access';
import { User } from './models/user';
import { Logger } from './utils/logger';

export class TestCleanupTask {
    private readonly logger: Logger;
    private readonly TEST_USER_ID = "8840f313-163f-44ff-b942-a2f8cd9143d9";
    private readonly mongoUri = 'mongodb+srv://feridem:zZCLTCIGpcH2RedN@cluster0.ynd5zaq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

    constructor(logger: Logger) {
        this.logger = logger;
    }

    private async initializeDatabase(): Promise<mongoose.mongo.Db> {
        try {
            await mongoose.connect(this.mongoUri);

            const db = mongoose.connection.db;
            if (!db) {
                throw new Error('No se pudo obtener la referencia a la base de datos');
            }

            return db;
        } catch (error) {
            throw error;
        }
    }

    private async verifyCollections(db: mongoose.mongo.Db): Promise<boolean> {
        try {
            const collections = await db.listCollections().toArray();
            const collectionNames = collections.map(c => c.name);

            const requiredCollections = {
                'users': ['users'],
                'Organization.Connections': ['Organization.Connections', 'connections'],
                'Access.Access': ['Access.Access', 'accesses']
            };

            return Object.entries(requiredCollections).every(([_, alternatives]) =>
                alternatives.some(name => collectionNames.includes(name))
            );
        } catch (error) {
            return false;
        }
    }

    async executeTestCleanup(): Promise<any> {
        let db: mongoose.mongo.Db | null = null;

        try {
            db = await this.initializeDatabase();
            await this.verifyCollections(db);

            const userFromCollection = await db.collection('users').findOne({
                id: this.TEST_USER_ID
            });

            if (!userFromCollection) {
                return {
                    success: false,
                    message: 'Usuario no encontrado'
                };
            }

            const access = await Access.findOne({
                characterid: this.TEST_USER_ID
            });

            if (!access) {
                return {
                    success: false,
                    message: 'No se encontró registro en Access'
                };
            }

            const connection = await Connection.findOne({
                characterid: this.TEST_USER_ID
            });

            if (!connection) {
                return {
                    success: false,
                    message: 'No se encontró conexión'
                };
            }

            const results = {
                success: true,
                accessDeleted: false,
                connectionDeleted: false,
                uniloginDeleted: false,
                message: ''
            };

            if (await this.shouldDeleteConnection(connection)) {
                const session = await mongoose.startSession();
                session.startTransaction();

                try {
                    await Access.deleteOne({
                        characterid: this.TEST_USER_ID
                    }).session(session);
                    results.accessDeleted = true;

                    await Connection.deleteOne({
                        characterid: this.TEST_USER_ID
                    }).session(session);
                    results.connectionDeleted = true;

                    if (connection.method === 1) {
                        const uniloginResult = await UniloginAuth.deleteMany({
                            userid: this.TEST_USER_ID
                        }).session(session);
                        results.uniloginDeleted = uniloginResult.deletedCount > 0;
                    }

                    await session.commitTransaction();
                    results.message = 'Eliminación completada exitosamente';

                } catch (error) {
                    await session.abortTransaction();
                    throw error;
                } finally {
                    await session.endSession();
                }
            } else {
                results.message = 'La conexión no cumple los criterios para ser eliminada';
            }

            return results;

        } catch (error) {
            throw error;
        } finally {
            await mongoose.disconnect();
        }
    }

    private async shouldDeleteConnection(connection: any): Promise<boolean> {
        if (!connection.endyear) {
            return true;
        }

        const endYear = new Date(connection.endyear);
        const currentDate = new Date();

        if (endYear < currentDate) {
            return true;
        }

        const isAfterJuly7th = (endYear.getMonth() > 6) ||
            (endYear.getMonth() === 6 && endYear.getDate() >= 7);

        if (endYear.getFullYear() === currentDate.getFullYear() && isAfterJuly7th) {
            return true;
        }

        return false;
    }
}