'use strict';
import dotenv from "dotenv";

dotenv.config();

const dev = {
    app: {
        port: process.env.DEV_APP_PORT || 3000
    },
    db: {
        host: process.env.DEV_DB_HOST || 'localhost',
        port: process.env.DEV_DB_PORT || 27017,
        name: process.env.DEV_DB_NAME || 'shopDEV'
    }
}

const prod = {
    app: {
        port: process.env.PROD_APP_PORT || 3000
    },
    db: {
        host: process.env.PROD_DB_HOST || 'localhost',
        port: process.env.PROD_DB_PORT || 27017,
        name: process.env.PROD_DB_NAME || 'shopPROD'
    }
}

export const config = {dev, prod};
const env = process.env.NODE_ENV || 'dev';
export default config[env as keyof typeof config];