import mongoose from 'mongoose';
import { Connection } from './models/connection';
import { User } from './models/user';
import { Organization } from './models/organization';
import { Auth } from './models/auth';
import { Page } from './models/page';
import { Access } from './models/access';
import { Logger } from './utils/logger';

interface ErrorWithMessage {
    message: string;
}

function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
    return (
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as Record<string, unknown>).message === 'string'
    );
}

function toErrorWithMessage(maybeError: unknown): ErrorWithMessage {
    if (isErrorWithMessage(maybeError)) return maybeError;

    try {
        return new Error(JSON.stringify(maybeError));
    } catch {
        return new Error(String(maybeError));
    }
}

function getErrorMessage(error: unknown) {
    return toErrorWithMessage(error).message;
}

interface CleanupStats {
    total: number;
    deleted: number;
    maintained: number;
    errors: number;
    collections: {
        connections: number;
        users: number;
        organizations: number;
        auth: number;
        pages: number;
        access: number;
        unilogin: number;
    };
}

export class ConnectionCleanupTask {
    private readonly logger: Logger;
    private readonly JULY_7TH = 7;
    private readonly JULY = 6;
    private readonly mongoUri = 'mongodb+srv://feridem:zZCLTCIGpcH2RedN@cluster0.ynd5zaq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

    constructor(logger: Logger) {
        this.logger = logger;
    }

    private async initializeDatabase(): Promise<void> {
        try {
            await mongoose.connect(this.mongoUri);
            this.logger.info('Conexión a base de datos inicializada');
        } catch (error) {
            this.logger.error(`Error inicializando la base de datos: ${getErrorMessage(error)}`);
            throw error;
        }
    }

    async execute(): Promise<CleanupStats> {
        const stats: CleanupStats = {
            total: 0,
            deleted: 0,
            maintained: 0,
            errors: 0,
            collections: {
                connections: 0,
                users: 0,
                organizations: 0,
                auth: 0,
                pages: 0,
                access: 0,
                unilogin: 0
            }
        };

        try {
            await this.initializeDatabase();

            // Obtener todas las conexiones
            const connections = await Connection.find({});
            stats.total = connections.length;

            this.logger.info(`Iniciando limpieza de conexiones. Total encontradas: ${stats.total}`);

            for (const connection of connections) {
                const session = await mongoose.startSession();
                session.startTransaction();

                try {
                    if (await this.shouldDeleteConnection(connection)) {
                        await this.deleteConnectionAndRelatedData(connection, session, stats);
                        stats.deleted++;
                    } else {
                        stats.maintained++;
                    }
                } catch (error) {
                    await session.abortTransaction();
                    stats.errors++;
                    this.logger.error(`Error procesando conexión ${connection._id}: ${getErrorMessage(error)}`);
                } finally {
                    await session.endSession();
                }
            }

            this.logger.info('Limpieza completada. Estadísticas:', stats);
            return stats;

        } catch (error) {
            this.logger.error(`Error crítico en la tarea de limpieza: ${getErrorMessage(error)}`);
            throw error;
        } finally {
            await mongoose.disconnect();
        }
    }

    private async shouldDeleteConnection(connection: any): Promise<boolean> {
        if (!connection.endyear) {
            this.logger.debug(`Conexión ${connection._id} marcada para eliminar: no tiene endyear`);
            return true;
        }

        const endYear = new Date(connection.endyear);
        const currentDate = new Date();

        if (endYear < currentDate) {
            this.logger.debug(`Conexión ${connection._id} marcada para eliminar: fecha expirada`);
            return true;
        }

        const isAfterJuly7th = (endYear.getMonth() > this.JULY) ||
            (endYear.getMonth() === this.JULY && endYear.getDate() >= this.JULY_7TH);

        if (isAfterJuly7th && endYear <= currentDate) {
            this.logger.debug(`Conexión ${connection._id} marcada para eliminar: posterior al 7 de julio y expirada`);
            return true;
        }

        return false;
    }

    private async deleteConnectionAndRelatedData(connection: any, session: any, stats: CleanupStats): Promise<void> {
        try {
            // 1. Eliminar conexión
            await Connection.deleteOne({ _id: connection._id }).session(session);
            stats.collections.connections++;

            // 2. Limpiar datos de Usuario
            await this.cleanupUserData(connection, session, stats);

            // 3. Limpiar datos de Organización
            await this.cleanupOrganizationData(connection, session, stats);

            // 4. Limpiar Auth
            await this.cleanupAuthData(connection, session, stats);

            // 5. Limpiar Pages
            await this.cleanupPageData(connection, session, stats);

            // 6. Limpiar Access
            await this.cleanupAccessData(connection, session, stats);

            // 7. Limpiar Unilogin si es necesario
            if (connection.method === 1) { // Método Unilogin
                await this.cleanupUniloginData(connection, session, stats);
            }

            await session.commitTransaction();
            this.logger.info(`Conexión ${connection._id} y datos relacionados eliminados exitosamente`);

        } catch (error) {
            this.logger.error(`Error en deleteConnectionAndRelatedData: ${getErrorMessage(error)}`);
            throw error;
        }
    }

    private async cleanupUserData(connection: any, session: any, stats: CleanupStats): Promise<void> {
        try {
            await User.updateOne(
                { id: connection.characterid },
                {
                    $pull: {
                        institutionconnections: connection.organization.id
                    }
                }
            ).session(session);
            stats.collections.users++;
        } catch (error) {
            this.logger.error(`Error limpiando datos de usuario: ${getErrorMessage(error)}`);
            throw error;
        }
    }

    private async cleanupOrganizationData(connection: any, session: any, stats: CleanupStats): Promise<void> {
        try {
            await Organization.updateOne(
                { id: connection.organization.id },
                {
                    $pull: {
                        connections: connection._id
                    }
                }
            ).session(session);
            stats.collections.organizations++;
        } catch (error) {
            this.logger.error(`Error limpiando datos de organización: ${getErrorMessage(error)}`);
            throw error;
        }
    }

    private async cleanupAuthData(connection: any, session: any, stats: CleanupStats): Promise<void> {
        try {
            await Auth.deleteMany({
                userid: connection.characterid
            }).session(session);
            stats.collections.auth++;
        } catch (error) {
            this.logger.error(`Error limpiando datos de auth: ${getErrorMessage(error)}`);
            throw error;
        }
    }

    private async cleanupPageData(connection: any, session: any, stats: CleanupStats): Promise<void> {
        try {
            await Page.updateMany(
                { 'organization.id': connection.organization.id },
                { $pull: { allowedUsers: connection.characterid } }
            ).session(session);
            stats.collections.pages++;
        } catch (error) {
            this.logger.error(`Error limpiando datos de páginas: ${getErrorMessage(error)}`);
            throw error;
        }
    }

    private async cleanupAccessData(connection: any, session: any, stats: CleanupStats): Promise<void> {
        try {
            await Access.deleteMany({
                characterid: connection.characterid,
                'organization.id': connection.organization.id
            }).session(session);
            stats.collections.access++;
        } catch (error) {
            this.logger.error(`Error limpiando datos de acceso: ${getErrorMessage(error)}`);
            throw error;
        }
    }

    private async cleanupUniloginData(connection: any, session: any, stats: CleanupStats): Promise<void> {
        try {
            // await Unilogin.deleteMany({
            //     userid: connection.characterid,
            //     'organization.id': connection.organization.id
            // }).session(session);
            stats.collections.unilogin++;
        } catch (error) {
            this.logger.error(`Error limpiando datos de Unilogin: ${getErrorMessage(error)}`);
            throw error;
        }
    }
}