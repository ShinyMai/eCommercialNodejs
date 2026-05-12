import {IDatabase} from "./interfaces/db.interface.js";
import MongoDB from "./init.mongodb.js";

type DBType = 'mongodb' ;

class DatabaseFactory {
    static getDatabase(type: DBType): IDatabase {
        switch (type) {
            case 'mongodb':
                return MongoDB.getInstance();
            default:
                throw new Error(`Unsupported database type: ${type}`);
        }
    }
}

export default DatabaseFactory;