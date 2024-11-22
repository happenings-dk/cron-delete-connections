export class Logger {
    info(message: string, ...args: any[]) {
        console.log(new Date().toISOString(), '[INFO]', message, ...args);
    }

    debug(message: string, ...args: any[]) {
        console.debug(new Date().toISOString(), '[DEBUG]', message, ...args);
    }

    error(message: string, ...args: any[]) {
        console.error(new Date().toISOString(), '[ERROR]', message, ...args);
    }
}