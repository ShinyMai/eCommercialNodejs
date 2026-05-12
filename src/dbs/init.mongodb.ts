'use strict';

import mongoose from 'mongoose';
import {IDatabase} from "@/dbs/interfaces/db.interface.js";
import config from "@/configs/config.mongodb.js";

class MongoDB implements IDatabase {
    private static instance: MongoDB;
    private readonly connectString: string = `mongodb://${config.db.host}:${config.db.port}/${config.db.name}`;

    private constructor() {
        this.connect()
    }

    connect(): void {

        if (1 === 1) {
            mongoose.set('debug', true)
            mongoose.set('debug', {color: true})
        }

        mongoose.connect(this.connectString).then(r => console.log("DB connected PRO")).catch(e => console.error("DB connection error", e));
    }

    static getInstance() {
        if (!MongoDB.instance) {
            MongoDB.instance = new MongoDB()
        }
        return MongoDB.instance
    }
}

export default MongoDB;